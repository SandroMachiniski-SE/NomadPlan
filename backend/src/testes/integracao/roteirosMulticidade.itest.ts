import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarRoteiroDeExemplo, DIAS_DO_EXEMPLO } from "../../lib/roteiroExemplo";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

// Segunda-feira 10h (local) fixa, para o resultado não depender de quando o teste roda.
const SEGUNDA_10H = new Date(2026, 9, 26, 10, 0, 0).toISOString();

describe("roteiro como caderno de viagem: atividades, pernoites e várias cidades", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let dono: Awaited<ReturnType<typeof criarUsuario>>;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    dono = await criarUsuario();
  });

  after(async () => {
    await servidor.fechar();
  });

  async function novoRoteiro() {
    return (await api("POST", "/roteiros", { token: dono.token, json: { nome: "Viagem" } })).corpo.id as number;
  }

  it("aceita atividade livre com período e exige ponto ou título", async () => {
    const id = await novoRoteiro();

    const atividade = await api("POST", `/roteiros/${id}/itens`, {
      token: dono.token,
      json: { titulo: "Rolê pelo centro histórico", periodo: "MANHA", dia: 1 },
    });
    assert.equal(atividade.status, 201);
    assert.equal(atividade.corpo.idPonto, null);
    assert.equal(atividade.corpo.titulo, "Rolê pelo centro histórico");
    assert.equal(atividade.corpo.periodo, "MANHA");

    const semNada = await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { dia: 1 } });
    assert.equal(semNada.status, 400);

    // Muda o período e o título; depois remove pelo id da parada.
    const editada = await api("PATCH", `/roteiros/${id}/itens/${atividade.corpo.id}`, {
      token: dono.token,
      json: { titulo: "Dia livre", periodo: "DIA_INTEIRO" },
    });
    assert.equal(editada.corpo.titulo, "Dia livre");
    assert.equal(editada.corpo.periodo, "DIA_INTEIRO");

    assert.equal((await api("DELETE", `/roteiros/${id}/paradas/${atividade.corpo.id}`, { token: dono.token })).status, 204);
    assert.equal(await prisma.itemRoteiro.count({ where: { idRoteiro: id } }), 0);
  });

  it("tem uma pernoite por noite, no fim do dia, e o mesmo hotel pode valer para várias noites", async () => {
    const id = await novoRoteiro();
    const hotel = await criarPonto({ nome: "Hotel Central", categoria: "Hospedagem" });
    const museu = await criarPonto({ nome: "Museu", longitude: -48.84 });

    await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: hotel.id, dia: 1, pernoite: true } });
    await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: museu.id, dia: 1 } });
    const segundaNoite = await api("POST", `/roteiros/${id}/itens`, {
      token: dono.token,
      json: { idPonto: hotel.id, dia: 2, pernoite: true },
    });
    assert.equal(segundaNoite.status, 201, "o mesmo hotel em outra noite");

    // Uma nova pernoite no dia 1 substitui a anterior.
    await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { titulo: "Acampamento na serra", dia: 1, pernoite: true } });

    const roteiro = (await api("GET", `/roteiros/${id}`, { token: dono.token })).corpo;
    const dia1 = roteiro.itens.filter((i: { dia: number }) => i.dia === 1);

    assert.deepEqual(
      dia1.map((i: { titulo: string | null; ponto: { nome: string } | null; pernoite: boolean }) => [i.ponto?.nome ?? i.titulo, i.pernoite]),
      [
        ["Hotel Central", false],
        ["Museu", false],
        ["Acampamento na serra", true],
      ],
      "a pernoite fecha o dia; o hotel deixou de ser a pernoite do dia 1 e volta à ordem em que entrou",
    );

    const visitaRepetida = await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: museu.id, dia: 2 } });
    assert.equal(visitaRepetida.status, 409, "como visita, o ponto entra uma vez só");
  });

  it("mostra as cidades do roteiro e a viagem de estrada entre dias de cidades diferentes", async () => {
    const id = await novoRoteiro();
    const museu = await criarPonto({ nome: "Museu", cidade: "Joinville", latitude: -26.3045, longitude: -48.8487 });
    const vila = await criarPonto({ nome: "Vila Germânica", cidade: "Blumenau", latitude: -26.9155, longitude: -49.0837 });

    await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: museu.id, dia: 1 } });
    await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { titulo: "Café colonial", dia: 2 } });
    await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: vila.id, dia: 2 } });

    const roteiro = (await api("GET", `/roteiros/${id}`, { token: dono.token })).corpo;

    assert.deepEqual(roteiro.cidades, ["Joinville", "Blumenau"]);
    assert.equal(roteiro.viagensEntreDias.length, 1);
    const [viagem] = roteiro.viagensEntreDias;
    assert.equal(viagem.dia, 2);
    assert.equal(viagem.de, "Joinville");
    assert.equal(viagem.para, "Blumenau");
    assert.ok(viagem.minutos >= 75 && viagem.minutos <= 100, `${viagem.minutos} min pela estrada`);

    const lista = (await api("GET", "/roteiros", { token: dono.token })).corpo.dados;
    assert.deepEqual(lista[0].cidades, ["Joinville", "Blumenau"]);
  });

  it("gera um roteiro por etapas, cada dia na sua cidade, descontando a estrada", async () => {
    await criarPonto({ nome: "Museu", categoria: "Cultura", cidade: "Joinville", latitude: -26.3045, longitude: -48.8487 });
    await criarPonto({ nome: "Parque", categoria: "Natureza", cidade: "Joinville", latitude: -26.3011, longitude: -48.8402 });
    await criarPonto({ nome: "Vila", categoria: "Cultura", cidade: "Blumenau", latitude: -26.9155, longitude: -49.0837 });

    const r = await api("POST", "/roteiros/gerar", {
      token: dono.token,
      json: {
        etapas: [
          { cidade: "Joinville", dias: 1 },
          { cidade: "blumenau", dias: 1 },
        ],
        horasDisponiveis: 6,
        dataHoraInicio: SEGUNDA_10H,
      },
    });

    assert.equal(r.status, 200);
    assert.deepEqual(
      r.corpo.dias.map((d: { dia: number; cidade: string }) => [d.dia, d.cidade]),
      [
        [1, "Joinville"],
        [2, "Blumenau"],
      ],
    );
    assert.equal(r.corpo.dias[0].viagem, null);
    assert.equal(r.corpo.dias[1].viagem.de, "Joinville");

    const porDia = (dia: number) => r.corpo.pontos.filter((p: { dia: number }) => p.dia === dia).map((p: { nome: string }) => p.nome);
    assert.deepEqual(porDia(1).sort(), ["Museu", "Parque"]);
    assert.deepEqual(porDia(2), ["Vila"]);

    // O dia 2 começa depois da viagem (mais de 1 h depois do horário do dia 1).
    const inicioDia2 = new Date(r.corpo.dias[1].inicio).getTime();
    assert.ok(inicioDia2 - (new Date(SEGUNDA_10H).getTime() + 86_400_000) >= 60 * 60_000);

    const invalido = await api("POST", "/roteiros/gerar", {
      token: dono.token,
      json: { etapas: [{ cidade: "Joinville", dias: 15 }] },
    });
    assert.equal(invalido.status, 400);
  });

  it("o roteiro de exemplo usa os pontos que existem e vira atividade o que não existe", async () => {
    await criarPonto({ nome: "Museu Nacional de Imigração e Colonização", cidade: "Joinville" });
    await criarPonto({ nome: "Hotel Tannenhof", cidade: "Joinville", categoria: "Hospedagem" });

    const { criado } = await criarRoteiroDeExemplo(dono.usuario.id);
    assert.equal(criado, true);
    assert.equal((await criarRoteiroDeExemplo(dono.usuario.id)).criado, false, "não duplica");

    const roteiro = await prisma.roteiro.findFirstOrThrow({ where: { idUsuario: dono.usuario.id }, include: { itens: true } });
    const dias = new Set(roteiro.itens.map((i) => i.dia));
    assert.equal(dias.size, DIAS_DO_EXEMPLO.length);

    // O hotel da cidade-base é a pernoite dos três primeiros dias, inclusive o bate-volta.
    const noitesNoHotel = roteiro.itens.filter((i) => i.pernoite && i.idPonto !== null);
    assert.deepEqual(noitesNoHotel.map((i) => i.dia).sort(), [1, 2, 3]);
    assert.ok(roteiro.itens.some((i) => i.idPonto === null && i.titulo === "Trekking até a Pedra Furada"));
  });
});
