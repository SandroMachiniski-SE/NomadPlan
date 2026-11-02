import "../ambiente";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";
import { estradaReta, instalarViagemFalsa, JOINVILLE, prepararBrasilia, type ViagemFalsa } from "../viagemFalsa";

const INICIO = new Date(2026, 9, 26, 9, 0, 0).toISOString();

interface Trecho {
  dia: number;
  noite: number | null;
  pernoite: { codigoIbge: number | null; cidade: string; hospedagens: { idOsm: string; nome: string }[] } | null;
}

describe("salvar e ler a viagem de carro", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let viagem: ViagemFalsa;
  let token: string;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    viagem = instalarViagemFalsa();
    await prepararBrasilia(viagem);
    const pessoa = await criarUsuario();
    await prisma.usuario.update({ where: { id: pessoa.usuario.id }, data: { codigoMunicipioBase: JOINVILLE.codigoIbge } });
    token = pessoa.token;
  });

  afterEach(() => {
    viagem.desinstalar();
  });

  after(async () => {
    await servidor.fechar();
  });

  /** Gera Joinville → Brasília (4 dias) e monta o pedido de salvamento como o front faz. */
  async function gerarEMontar(
    hotelDaNoite1 = true,
    { dias = 4, comVolta = false, combustivel = {} as { consumoKmPorLitro?: number; precoLitroCentavos?: number } } = {},
  ) {
    const gerado = await api("POST", "/roteiros/gerar", {
      token,
      json: {
        etapas: [{ cidade: "Brasília, DF", dias }],
        horasDisponiveis: 6,
        dataHoraInicio: INICIO,
        viagemDeCarro: { comVolta, ...combustivel },
      },
    });
    assert.equal(gerado.status, 200, JSON.stringify(gerado.corpo));

    const pernas = gerado.corpo.viagemDeCarro.pernas as { perna: number; trechos: Trecho[] }[];
    const noites = pernas.flatMap((p) =>
      p.trechos
        .filter((t) => t.noite !== null)
        .map((t) => ({
          perna: p.perna,
          noite: t.noite!,
          codigoIbge: t.pernoite!.codigoIbge,
          ...(t.noite === 1 && hotelDaNoite1 ? { idOsm: t.pernoite!.hospedagens[0].idOsm } : {}),
        })),
    );

    return {
      gerado: gerado.corpo,
      pedido: {
        nome: "Viagem para Brasília",
        pontos: gerado.corpo.pontos.map((p: { id: number; dia: number }) => ({ idPonto: p.id, dia: p.dia })),
        viagemDeCarro: {
          origem: JOINVILLE.codigoIbge,
          etapas: [{ codigoIbge: 5300108, dias }],
          horasDisponiveis: 6,
          kmPorDia: 500,
          comVolta,
          ...combustivel,
          escolhas: [],
          decisoes: [],
          noites,
        },
      },
    };
  }

  const salvar = (pedido: unknown) => api("POST", "/roteiros", { token, json: pedido });

  it("salvar grava os trechos, os pernoites e as hospedagens no catálogo", async () => {
    const { gerado, pedido } = await gerarEMontar();
    const hotelEscolhido = gerado.viagemDeCarro.pernas[0].trechos[0].pernoite.hospedagens[0];

    const r = await salvar(pedido);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const roteiro = await prisma.roteiro.findUnique({ where: { id: r.corpo.id } });
    assert.equal(roteiro?.kmPorDia, 500);
    assert.equal(roteiro?.viagemOrigem, JOINVILLE.codigoIbge);
    assert.equal(roteiro?.viagemVolta, false);

    const trechos = await prisma.trechoEstrada.findMany({ where: { idRoteiro: r.corpo.id }, orderBy: { dia: "asc" } });
    assert.deepEqual(
      trechos.map((t) => [t.dia, t.perna, t.noite, t.deNome, t.paraNome, t.ocupaODia]),
      [
        [1, 0, 1, "Joinville/SC", "Cidade A/GO", true],
        [2, 0, 2, "Cidade A/GO", "Cidade B/GO", true],
        [3, 0, null, "Cidade B/GO", "Brasília/DF", true],
      ],
    );
    assert.ok(Array.isArray(trechos[0].tracado) && (trechos[0].tracado as unknown[]).length >= 2);

    const pernoites = await prisma.itemRoteiro.findMany({
      where: { idRoteiro: r.corpo.id, pernoite: true },
      orderBy: { dia: "asc" },
      include: { ponto: true },
    });
    assert.deepEqual(
      pernoites.map((p) => [p.dia, p.ponto?.nome ?? p.titulo]),
      [
        [1, hotelEscolhido.nome],
        [2, "Pernoite em Cidade B (hotel a definir)"],
      ],
    );
    assert.equal(pernoites[0].ponto?.idOsm, hotelEscolhido.idOsm);

    // As 6 hospedagens de A e as 5 de B entram no catálogo, vindas do OpenStreetMap.
    const hoteis = await prisma.pontoTuristico.findMany({ where: { categoria: "Hospedagem" } });
    assert.equal(hoteis.length, 11);
    assert.ok(hoteis.every((h) => h.origem === "API" && h.idOsm && h.status === "PUBLICADO"));
    assert.deepEqual([...new Set(hoteis.map((h) => h.cidade))].sort(), ["Cidade A", "Cidade B"]);
  });

  it("salvar com volta grava os trechos de todas as pernas", async () => {
    viagem.naEstrada(JOINVILLE, () => ({ corpo: estradaReta(1501) }));
    const { pedido } = await gerarEMontar(false, { dias: 2, comVolta: true });

    const r = await salvar(pedido);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const trechos = await prisma.trechoEstrada.findMany({ where: { idRoteiro: r.corpo.id }, orderBy: [{ dia: "asc" }] });
    assert.deepEqual(
      trechos.map((t) => [t.dia, t.perna]),
      [
        [1, 0],
        [2, 0],
        [3, 0],
        [6, 1],
        [7, 1],
        [8, 1],
      ],
    );
    assert.equal(trechos[5].paraNome, "Joinville/SC");
    assert.equal((await prisma.roteiro.findUnique({ where: { id: r.corpo.id } }))?.viagemVolta, true);
    assert.equal(await prisma.itemRoteiro.count({ where: { idRoteiro: r.corpo.id, pernoite: true } }), 4);
  });

  it("salvar grava litros e custo de cada trecho e o orçamento do roteiro mostra o combustível", async () => {
    const { pedido } = await gerarEMontar(false, { combustivel: { consumoKmPorLitro: 12, precoLitroCentavos: 629 } });
    const { corpo: criado } = await salvar(pedido);

    const trechos = await prisma.trechoEstrada.findMany({ where: { idRoteiro: criado.id } });
    assert.ok(trechos.every((t) => t.litros !== null && t.custoCombustivelCentavos !== null));

    const r = await api("GET", `/roteiros/${criado.id}`, { token });
    const combustivel = trechos.reduce((soma, t) => soma + t.custoCombustivelCentavos!, 0);
    assert.equal(r.corpo.orcamento.combustivelCentavos, combustivel);
    assert.equal(r.corpo.orcamento.porDia[1], trechos.find((t) => t.dia === 1)!.custoCombustivelCentavos);
    assert.equal(r.corpo.viagemDeCarro.consumoKmPorLitro, 12);
    assert.equal(r.corpo.viagemDeCarro.precoLitroCentavos, 629);
    assert.equal(r.corpo.trechosDeEstrada[0].litros, Number(trechos.find((t) => t.dia === 1)!.litros));
  });

  it("idOsm que não está no resumo da cidade dá 400", async () => {
    const { pedido } = await gerarEMontar();
    pedido.viagemDeCarro.noites[0] = { ...pedido.viagemDeCarro.noites[0], idOsm: "node/999999" };

    const r = await salvar(pedido);

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Hotel não encontrado entre as hospedagens de Cidade A.");
    assert.equal(await prisma.roteiro.count(), 0);
  });

  it("noites diferentes do recálculo dão 409 e nada é gravado", async () => {
    const { pedido } = await gerarEMontar();
    pedido.viagemDeCarro.noites[0] = { perna: 0, noite: 1, codigoIbge: 1000011 };

    const r = await salvar(pedido);

    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro, "A rota mudou desde a geração; gere de novo.");
    assert.equal(await prisma.roteiro.count(), 0);
    assert.equal(await prisma.trechoEstrada.count(), 0);
  });

  it("pernoite enviado nas paradas num dia de estrada dá 400", async () => {
    const { pedido } = await gerarEMontar();
    pedido.pontos.push({ titulo: "Acampamento", dia: 1, pernoite: true } as never);

    const r = await salvar(pedido);

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Os pernoites dos dias de estrada vêm da viagem de carro.");
  });

  it("GET /roteiros/:id traz a viagem, os trechos e as viagens entre dias da estrada", async () => {
    const { pedido } = await gerarEMontar(false);
    const { corpo: criado } = await salvar(pedido);

    const r = await api("GET", `/roteiros/${criado.id}`, { token });

    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.viagemDeCarro, {
      origem: { codigoIbge: 4209102, cidade: "Joinville", uf: "SC" },
      kmPorDia: 500,
      horasPorDia: null,
      comVolta: false,
      consumoKmPorLitro: null,
      precoLitroCentavos: null,
    });
    assert.deepEqual(
      r.corpo.trechosDeEstrada.map((t: { dia: number; de: string }) => [t.dia, t.de]),
      [
        [1, "Joinville/SC"],
        [2, "Cidade A/GO"],
        [3, "Cidade B/GO"],
      ],
    );
    assert.ok("litros" in r.corpo.trechosDeEstrada[0]);
    const daEstrada = r.corpo.viagensEntreDias.filter((v: { estrada?: boolean }) => v.estrada);
    assert.deepEqual(
      daEstrada.map((v: { dia: number }) => v.dia),
      [1, 2, 3],
    );
  });

  it("o link público não traz consumo, preço, litros nem custo", async () => {
    const { pedido } = await gerarEMontar(false);
    const { corpo: criado } = await salvar(pedido);
    const ligado = await api("PATCH", `/roteiros/${criado.id}/compartilhar`, { token, json: { publico: true } });

    const r = await api("GET", `/roteiros/publico/${ligado.corpo.slugPublico}`);

    assert.equal(r.status, 200);
    assert.equal(r.corpo.trechosDeEstrada.length, 3);
    assert.ok(!("litros" in r.corpo.trechosDeEstrada[0]) && !("custoCentavos" in r.corpo.trechosDeEstrada[0]));
    assert.ok(!("consumoKmPorLitro" in r.corpo.viagemDeCarro) && !("precoLitroCentavos" in r.corpo.viagemDeCarro));
    assert.equal(r.corpo.viagemDeCarro.kmPorDia, 500);
  });

  it("restaurar uma versão traz de volta os trechos e os campos da viagem", async () => {
    const { pedido } = await gerarEMontar(false);
    const { corpo: criado } = await salvar(pedido);

    // A edição guarda uma versão (com os trechos) antes de mudar.
    await api("PUT", `/roteiros/${criado.id}`, { token, json: { nome: "Outro nome" } });
    const [versao] = await prisma.versaoRoteiro.findMany({ where: { idRoteiro: criado.id }, orderBy: { id: "asc" } });

    await prisma.trechoEstrada.deleteMany({ where: { idRoteiro: criado.id } });
    await prisma.roteiro.update({ where: { id: criado.id }, data: { kmPorDia: null, viagemOrigem: null } });

    const r = await api("POST", `/roteiros/${criado.id}/versoes/${versao.id}/restaurar`, { token });

    assert.equal(r.status, 200);
    assert.equal(await prisma.trechoEstrada.count({ where: { idRoteiro: criado.id } }), 3);
    const restaurado = await prisma.roteiro.findUnique({ where: { id: criado.id } });
    assert.equal(restaurado?.kmPorDia, 500);
    assert.equal(restaurado?.viagemOrigem, JOINVILLE.codigoIbge);
  });
});
