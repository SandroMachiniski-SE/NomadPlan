import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

interface ItemResposta {
  id: number;
  idPonto: number;
  dia: number;
  ordem: number;
  deslocamento: { metros: number; minutos: number } | null;
  ponto: { nome: string };
}

describe("roteiro por dia, trajeto e otimização", () => {
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

  // Pontos numa linha de leste a oeste, ~1,1 km entre dois vizinhos (0,01° de longitude).
  const naLinha = (nome: string, posicao: number) =>
    criarPonto({ nome, latitude: 0, longitude: posicao * 0.01 });

  async function roteiroCom(
    paradas: { ponto: { id: number }; dia?: number }[],
    token = dono.token,
  ): Promise<number> {
    const r = await api("POST", "/roteiros", {
      token,
      json: { nome: "Viagem", pontos: paradas.map((p) => ({ idPonto: p.ponto.id, ...(p.dia ? { dia: p.dia } : {}) })) },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    return r.corpo.id;
  }

  async function itensDe(idRoteiro: number, token = dono.token): Promise<ItemResposta[]> {
    return (await api("GET", `/roteiros/${idRoteiro}`, { token })).corpo.itens;
  }

  describe("dia de cada parada", () => {
    it("paradas sem dia entram no dia 1; sem informar, uma nova parada vai para o último dia", async () => {
      const [a, b, c] = [await naLinha("A", 0), await naLinha("B", 1), await naLinha("C", 2)];
      const id = await roteiroCom([{ ponto: a }]);

      await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: b.id, dia: 3 } });
      await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: c.id } });

      const itens = await itensDe(id);

      assert.deepEqual(itens.map((i) => [i.ponto.nome, i.dia]), [["A", 1], ["B", 3], ["C", 3]]);
    });

    it("a criação já com paradas aceita o dia de cada uma", async () => {
      const [a, b, c] = [await naLinha("A", 0), await naLinha("B", 1), await naLinha("C", 2)];
      const id = await roteiroCom([{ ponto: a, dia: 1 }, { ponto: b, dia: 2 }, { ponto: c, dia: 2 }]);

      assert.deepEqual((await itensDe(id)).map((i) => i.dia), [1, 2, 2]);
    });

    it("recusa dia fora de 1 a 30", async () => {
      const a = await naLinha("A", 0);
      const id = await roteiroCom([{ ponto: a }]);
      const b = await naLinha("B", 1);

      for (const dia of [0, 31, -1, "x"]) {
        const r = await api("POST", `/roteiros/${id}/itens`, { token: dono.token, json: { idPonto: b.id, dia } });
        assert.equal(r.status, 400, `dia ${dia}`);
      }
    });

    it("lista as paradas por dia e, dentro do dia, na ordem", async () => {
      const [a, b, c, d] = [await naLinha("A", 0), await naLinha("B", 1), await naLinha("C", 2), await naLinha("D", 3)];
      const id = await roteiroCom([{ ponto: a, dia: 2 }, { ponto: b, dia: 1 }, { ponto: c, dia: 2 }, { ponto: d, dia: 1 }]);

      assert.deepEqual((await itensDe(id)).map((i) => i.ponto.nome), ["B", "D", "A", "C"]);
    });
  });

  describe("tempo e distância entre paradas", () => {
    it("cada parada traz o trecho desde a anterior do mesmo dia; a primeira de cada dia não tem", async () => {
      const [a, b, c, d] = [await naLinha("A", 0), await naLinha("B", 1), await naLinha("C", 10), await naLinha("D", 11)];
      const id = await roteiroCom([{ ponto: a, dia: 1 }, { ponto: b, dia: 1 }, { ponto: c, dia: 2 }, { ponto: d, dia: 2 }]);

      const [primeira, segunda, terceira, quarta] = await itensDe(id);

      assert.equal(primeira.deslocamento, null);
      assert.ok(segunda.deslocamento && segunda.deslocamento.metros > 1000 && segunda.deslocamento.metros < 1200);
      assert.ok(segunda.deslocamento.minutos >= 2 && segunda.deslocamento.minutos <= 3);
      assert.equal(terceira.deslocamento, null, "o trecho não atravessa a virada de dia");
      assert.ok(quarta.deslocamento);
    });

    it("parada sem coordenadas fica sem trecho, sem quebrar a lista", async () => {
      const a = await naLinha("A", 0);
      const semMapa = await criarPonto({ nome: "Sem mapa", latitude: null, longitude: null });
      const id = await roteiroCom([{ ponto: a }, { ponto: semMapa }]);

      assert.equal((await itensDe(id))[1].deslocamento, null);
    });

    it("o roteiro público também mostra dia e trechos", async () => {
      const [a, b] = [await naLinha("A", 0), await naLinha("B", 1)];
      const id = await roteiroCom([{ ponto: a, dia: 1 }, { ponto: b, dia: 1 }]);
      const { corpo: compartilhado } = await api("PATCH", `/roteiros/${id}/compartilhar`, { token: dono.token, json: { publico: true } });

      const r = await api("GET", `/roteiros/publico/${compartilhado.slugPublico}`);

      assert.equal(r.status, 200);
      assert.equal(r.corpo.itens[0].dia, 1);
      assert.ok(r.corpo.itens[1].deslocamento.metros > 0);
    });
  });

  describe("organizar o roteiro (mover entre dias e reordenar)", () => {
    it("move uma parada para outro dia e grava a ordem pedida", async () => {
      const [a, b, c] = [await naLinha("A", 0), await naLinha("B", 1), await naLinha("C", 2)];
      const id = await roteiroCom([{ ponto: a }, { ponto: b }, { ponto: c }]);
      const [ia, ib, ic] = await itensDe(id);

      const r = await api("PUT", `/roteiros/${id}/itens/organizar`, {
        token: dono.token,
        json: { itens: [{ id: ic.id, dia: 1 }, { id: ia.id, dia: 1 }, { id: ib.id, dia: 2 }] },
      });

      assert.equal(r.status, 204);
      assert.deepEqual((await itensDe(id)).map((i) => [i.ponto.nome, i.dia]), [["C", 1], ["A", 1], ["B", 2]]);
    });

    it("agrupa por dia mesmo que a lista chegue misturada", async () => {
      const [a, b, c] = [await naLinha("A", 0), await naLinha("B", 1), await naLinha("C", 2)];
      const id = await roteiroCom([{ ponto: a }, { ponto: b }, { ponto: c }]);
      const [ia, ib, ic] = await itensDe(id);

      await api("PUT", `/roteiros/${id}/itens/organizar`, {
        token: dono.token,
        json: { itens: [{ id: ia.id, dia: 2 }, { id: ib.id, dia: 1 }, { id: ic.id, dia: 2 }] },
      });

      assert.deepEqual((await itensDe(id)).map((i) => [i.ponto.nome, i.dia]), [["B", 1], ["A", 2], ["C", 2]]);
    });

    it("exige exatamente as paradas atuais, sem repetir nem trocar de roteiro", async () => {
      const [a, b] = [await naLinha("A", 0), await naLinha("B", 1)];
      const id = await roteiroCom([{ ponto: a }, { ponto: b }]);
      const outro = await roteiroCom([{ ponto: a }]);
      const [ia] = await itensDe(id);
      const [itemDeOutro] = await itensDe(outro);

      const organizar = (itens: { id: number; dia: number }[]) =>
        api("PUT", `/roteiros/${id}/itens/organizar`, { token: dono.token, json: { itens } });

      assert.equal((await organizar([{ id: ia.id, dia: 1 }])).status, 400, "faltou uma parada");
      assert.equal((await organizar([{ id: ia.id, dia: 1 }, { id: ia.id, dia: 2 }])).status, 400, "repetiu");
      assert.equal((await organizar([{ id: ia.id, dia: 1 }, { id: itemDeOutro.id, dia: 1 }])).status, 400, "item de outro roteiro");
      assert.equal((await organizar([])).status, 400);
      assert.equal((await organizar([{ id: ia.id, dia: 99 }])).status, 400);
    });

    it("só o dono organiza; outra pessoa recebe 404", async () => {
      const a = await naLinha("A", 0);
      const id = await roteiroCom([{ ponto: a }]);
      const [item] = await itensDe(id);
      const intruso = await criarUsuario();

      const r = await api("PUT", `/roteiros/${id}/itens/organizar`, {
        token: intruso.token,
        json: { itens: [{ id: item.id, dia: 2 }] },
      });

      assert.equal(r.status, 404);
      assert.equal((await itensDe(id))[0].dia, 1);
    });

    it("guarda uma versão antes de reorganizar e restaurá-la devolve os dias", async () => {
      const [a, b] = [await naLinha("A", 0), await naLinha("B", 1)];
      const id = await roteiroCom([{ ponto: a, dia: 1 }, { ponto: b, dia: 2 }]);
      const [ia, ib] = await itensDe(id);

      await api("PUT", `/roteiros/${id}/itens/organizar`, {
        token: dono.token,
        json: { itens: [{ id: ia.id, dia: 1 }, { id: ib.id, dia: 1 }] },
      });

      const versoes = (await api("GET", `/roteiros/${id}/versoes`, { token: dono.token })).corpo.dados as {
        id: number;
        motivo: string;
      }[];
      const antes = versoes.find((v) => v.motivo === "organizar")!;

      assert.ok(antes);

      const r = await api("POST", `/roteiros/${id}/versoes/${antes.id}/restaurar`, { token: dono.token });

      assert.equal(r.status, 200);
      assert.deepEqual((await itensDe(id)).map((i) => i.dia), [1, 2]);
    });

    it("versões gravadas antes do roteiro por dia (sem o campo dia) restauram no dia 1", async () => {
      const [a, b] = [await naLinha("A", 0), await naLinha("B", 1)];
      const id = await roteiroCom([{ ponto: a, dia: 2 }]);
      const versao = await prisma.versaoRoteiro.create({
        data: {
          idRoteiro: id,
          motivo: "edicao",
          idAutor: dono.usuario.id,
          dados: {
            nome: "Antigo",
            descricao: null,
            cidade: null,
            dataInicio: null,
            dataFim: null,
            itens: [
              { idPonto: a.id, ordem: 0, observacao: null },
              { idPonto: b.id, ordem: 1, observacao: null },
            ],
          },
        },
      });

      await api("POST", `/roteiros/${id}/versoes/${versao.id}/restaurar`, { token: dono.token });

      assert.deepEqual((await itensDe(id)).map((i) => [i.ponto.nome, i.dia]), [["A", 1], ["B", 1]]);
    });
  });

  describe("otimizar a ordem das paradas", () => {
    it("reordena o dia pelo caminho mais curto, mantendo a primeira parada como partida", async () => {
      const pontos = [await naLinha("Partida", 0), await naLinha("Longe", 30), await naLinha("Perto", 10), await naLinha("Meio", 20)];
      const id = await roteiroCom(pontos.map((ponto) => ({ ponto })));

      const r = await api("POST", `/roteiros/${id}/otimizar`, { token: dono.token, json: {} });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.alterado, true);
      assert.equal(r.corpo.dias[0].alterado, true);
      assert.ok(r.corpo.dias[0].metrosDepois < r.corpo.dias[0].metrosAntes);
      assert.deepEqual((await itensDe(id)).map((i) => i.ponto.nome), ["Partida", "Perto", "Meio", "Longe"]);
    });

    it("não grava nada (nem nova versão) quando a ordem já é a melhor", async () => {
      const pontos = [await naLinha("A", 0), await naLinha("B", 10), await naLinha("C", 20)];
      const id = await roteiroCom(pontos.map((ponto) => ({ ponto })));
      const antes = await prisma.versaoRoteiro.count({ where: { idRoteiro: id } });

      const r = await api("POST", `/roteiros/${id}/otimizar`, { token: dono.token, json: {} });

      assert.equal(r.corpo.alterado, false);
      assert.equal(await prisma.versaoRoteiro.count({ where: { idRoteiro: id } }), antes);
    });

    it("pode otimizar só um dia, deixando os outros como estão", async () => {
      const dia1 = [await naLinha("1-A", 0), await naLinha("1-B", 30), await naLinha("1-C", 10), await naLinha("1-D", 20)];
      const dia2 = [await naLinha("2-A", 0.5), await naLinha("2-B", 31), await naLinha("2-C", 11), await naLinha("2-D", 21)];
      const id = await roteiroCom([...dia1.map((ponto) => ({ ponto, dia: 1 })), ...dia2.map((ponto) => ({ ponto, dia: 2 }))]);

      const r = await api("POST", `/roteiros/${id}/otimizar`, { token: dono.token, json: { dia: 2 } });

      assert.equal(r.corpo.dias.length, 1);
      assert.equal(r.corpo.dias[0].dia, 2);

      const nomes = (await itensDe(id)).map((i) => i.ponto.nome);

      assert.deepEqual(nomes.slice(0, 4), ["1-A", "1-B", "1-C", "1-D"], "o dia 1 não muda");
      assert.deepEqual(nomes.slice(4), ["2-A", "2-C", "2-D", "2-B"]);
    });

    it("registra a ação no log e a versão anterior permite desfazer", async () => {
      const pontos = [await naLinha("A", 0), await naLinha("B", 30), await naLinha("C", 10), await naLinha("D", 20)];
      const id = await roteiroCom(pontos.map((ponto) => ({ ponto })));

      await api("POST", `/roteiros/${id}/otimizar`, { token: dono.token, json: {} });

      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "otimizar_roteiro", idEntidade: id } }));

      const versoes = (await api("GET", `/roteiros/${id}/versoes`, { token: dono.token })).corpo.dados as { id: number; motivo: string }[];
      await api("POST", `/roteiros/${id}/versoes/${versoes.find((v) => v.motivo === "otimizar")!.id}/restaurar`, { token: dono.token });

      assert.deepEqual((await itensDe(id)).map((i) => i.ponto.nome), ["A", "B", "C", "D"]);
    });

    it("valida o pedido e o acesso", async () => {
      const a = await naLinha("A", 0);
      const id = await roteiroCom([{ ponto: a }]);
      const intruso = await criarUsuario();

      assert.equal((await api("POST", `/roteiros/${id}/otimizar`, { token: dono.token, json: { dia: 0 } })).status, 400);
      assert.equal((await api("POST", `/roteiros/${id}/otimizar`, { token: dono.token, json: { dia: 5 } })).status, 404, "dia sem paradas");
      assert.equal((await api("POST", `/roteiros/${id}/otimizar`, { token: intruso.token, json: {} })).status, 404);
      assert.equal((await api("POST", `/roteiros/${id}/otimizar`, { json: {} })).status, 401);
      assert.equal((await api("POST", "/roteiros/abc/otimizar", { token: dono.token, json: {} })).status, 400);
    });
  });
});
