import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

describe("planejamento da viagem: notas, orçamento e checklist", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let dono: Awaited<ReturnType<typeof criarUsuario>>;
  let intruso: Awaited<ReturnType<typeof criarUsuario>>;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    dono = await criarUsuario();
    intruso = await criarUsuario();
  });

  after(async () => {
    await servidor.fechar();
  });

  async function roteiroComParadas(n = 2) {
    const pontos = [];
    for (let i = 0; i < n; i++) pontos.push(await criarPonto({ nome: `Ponto ${i + 1}` }));

    const r = await api("POST", "/roteiros", {
      token: dono.token,
      json: { nome: "Viagem", pontos: pontos.map((p, i) => ({ idPonto: p.id, dia: i + 1 })) },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const detalhe = await api("GET", `/roteiros/${r.corpo.id}`, { token: dono.token });
    return { id: r.corpo.id as number, itens: detalhe.corpo.itens as { id: number; dia: number; custoCentavos: number | null }[] };
  }

  const detalhe = async (id: number, token = dono.token) => (await api("GET", `/roteiros/${id}`, { token })).corpo;

  describe("custo por parada e orçamento", () => {
    it("grava e limpa observação e custo de uma parada, e o resumo soma por dia", async () => {
      const { id, itens } = await roteiroComParadas();

      const r1 = await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, {
        token: dono.token,
        json: { custoCentavos: 4590, observacao: "Comprar ingresso antes" },
      });
      assert.equal(r1.status, 200);
      assert.equal(r1.corpo.custoCentavos, 4590);

      await api("PATCH", `/roteiros/${id}/itens/${itens[1].id}`, { token: dono.token, json: { custoCentavos: 10000 } });
      await api("PATCH", `/roteiros/${id}/anotacoes`, { token: dono.token, json: { orcamentoCentavos: 20000 } });

      const d = await detalhe(id);

      assert.equal(d.itens[0].observacao, "Comprar ingresso antes");
      assert.equal(d.orcamento.totalCentavos, 14590);
      assert.deepEqual(d.orcamento.porDia, { 1: 4590, 2: 10000 });
      assert.equal(d.orcamento.orcamentoCentavos, 20000);
      assert.equal(d.orcamento.restanteCentavos, 5410);
      assert.equal(d.orcamento.paradasSemCusto, 0);

      // null limpa o custo (volta a contar como "sem custo informado") e só ele muda.
      await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: dono.token, json: { custoCentavos: null } });
      const depois = await detalhe(id);

      assert.equal(depois.itens[0].custoCentavos, null);
      assert.equal(depois.itens[0].observacao, "Comprar ingresso antes", "a observação não enviada permanece");
      assert.equal(depois.orcamento.paradasSemCusto, 1);
    });

    it("indica quando os custos estouram o orçamento", async () => {
      const { id, itens } = await roteiroComParadas(1);

      await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: dono.token, json: { custoCentavos: 30000 } });
      await api("PATCH", `/roteiros/${id}/anotacoes`, { token: dono.token, json: { orcamentoCentavos: 25000 } });

      assert.equal((await detalhe(id)).orcamento.restanteCentavos, -5000);
    });

    it("aceita custo e dia já ao adicionar a parada e ao criar o roteiro", async () => {
      const [a, b] = [await criarPonto({ nome: "A" }), await criarPonto({ nome: "B" })];
      const criado = await api("POST", "/roteiros", {
        token: dono.token,
        json: { nome: "Com custos", pontos: [{ idPonto: a.id, custoCentavos: 1500 }] },
      });
      assert.equal(criado.status, 201);

      await api("POST", `/roteiros/${criado.corpo.id}/itens`, { token: dono.token, json: { idPonto: b.id, custoCentavos: 2500 } });

      assert.equal((await detalhe(criado.corpo.id)).orcamento.totalCentavos, 4000);
    });

    it("valida os valores: sem negativos, sem decimais, sem exagero e sem corpo vazio", async () => {
      const { id, itens } = await roteiroComParadas(1);
      const patch = (json: unknown) => api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: dono.token, json });

      assert.equal((await patch({ custoCentavos: -1 })).status, 400);
      assert.equal((await patch({ custoCentavos: 10.5 })).status, 400);
      assert.equal((await patch({ custoCentavos: 100_000_001 })).status, 400);
      assert.equal((await patch({})).status, 400);
      assert.equal((await patch({ observacao: "x".repeat(501) })).status, 400);
    });

    it("só o dono mexe; paradas de outro roteiro e roteiros alheios dão 404", async () => {
      const { id, itens } = await roteiroComParadas();
      const outro = await roteiroComParadas(1);

      assert.equal((await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: intruso.token, json: { custoCentavos: 1 } })).status, 404);
      assert.equal((await api("PATCH", `/roteiros/${id}/itens/${outro.itens[0].id}`, { token: dono.token, json: { custoCentavos: 1 } })).status, 404);
      assert.equal((await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { json: { custoCentavos: 1 } })).status, 401);
    });

    it("os custos entram no retrato do histórico e voltam ao restaurar", async () => {
      const { id, itens } = await roteiroComParadas();
      await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: dono.token, json: { custoCentavos: 7000 } });

      // Uma alteração qualquer gera a versão com o custo de agora.
      await api("PUT", `/roteiros/${id}`, { token: dono.token, json: { nome: "Outro nome" } });
      await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: dono.token, json: { custoCentavos: 1 } });

      const versoes = (await api("GET", `/roteiros/${id}/versoes`, { token: dono.token })).corpo.dados as { id: number }[];
      await api("POST", `/roteiros/${id}/versoes/${versoes[0].id}/restaurar`, { token: dono.token });

      assert.equal((await detalhe(id)).itens[0].custoCentavos, 7000);
    });
  });

  describe("notas e orçamento do roteiro", () => {
    it("salva, edita e limpa as notas e o orçamento, sem poluir o histórico de versões", async () => {
      const { id } = await roteiroComParadas(1);

      const r = await api("PATCH", `/roteiros/${id}/anotacoes`, {
        token: dono.token,
        json: { notas: "Levar protetor solar.\nReservar o jantar.", orcamentoCentavos: 150000 },
      });

      assert.equal(r.status, 200);
      assert.equal((await detalhe(id)).notas, "Levar protetor solar.\nReservar o jantar.");

      await api("PATCH", `/roteiros/${id}/anotacoes`, { token: dono.token, json: { notas: "   " } });
      assert.equal((await detalhe(id)).notas, null, "texto em branco limpa");

      await api("PATCH", `/roteiros/${id}/anotacoes`, { token: dono.token, json: { orcamentoCentavos: null } });
      assert.equal((await detalhe(id)).orcamento.restanteCentavos, null);

      assert.equal(await prisma.versaoRoteiro.count({ where: { idRoteiro: id } }), 0);
    });

    it("valida tamanho e acesso", async () => {
      const { id } = await roteiroComParadas(1);
      const patch = (json: unknown, token = dono.token) => api("PATCH", `/roteiros/${id}/anotacoes`, { token, json });

      assert.equal((await patch({ notas: "x".repeat(5001) })).status, 400);
      assert.equal((await patch({})).status, 400);
      assert.equal((await patch({ orcamentoCentavos: -5 })).status, 400);
      assert.equal((await patch({ notas: "oi" }, intruso.token)).status, 404);
    });

    it("notas, orçamento e custos não aparecem no roteiro público", async () => {
      const { id, itens } = await roteiroComParadas(1);
      await api("PATCH", `/roteiros/${id}/anotacoes`, { token: dono.token, json: { notas: "segredo", orcamentoCentavos: 999 } });
      await api("PATCH", `/roteiros/${id}/itens/${itens[0].id}`, { token: dono.token, json: { custoCentavos: 123 } });
      await api("POST", `/roteiros/${id}/checklist`, { token: dono.token, json: { texto: "privado" } });
      const { corpo } = await api("PATCH", `/roteiros/${id}/compartilhar`, { token: dono.token, json: { publico: true } });

      const publico = (await api("GET", `/roteiros/publico/${corpo.slugPublico}`)).texto;

      for (const proibido of ["segredo", "orcamento", "custoCentavos", "privado", "checklist", "notas"]) {
        assert.ok(!publico.includes(proibido), `não deveria expor "${proibido}"`);
      }
    });
  });

  describe("checklist", () => {
    it("adiciona, marca, edita e remove itens, mantendo a ordem de criação", async () => {
      const { id } = await roteiroComParadas(1);
      const adicionar = (texto: string) => api("POST", `/roteiros/${id}/checklist`, { token: dono.token, json: { texto } });

      const a = (await adicionar("Passaporte")).corpo;
      const b = (await adicionar("Carregador")).corpo;
      await adicionar("Reservar hotel");

      assert.equal(a.feito, false);
      assert.deepEqual((await detalhe(id)).checklist.map((i: { texto: string }) => i.texto), ["Passaporte", "Carregador", "Reservar hotel"]);

      const marcado = await api("PATCH", `/roteiros/${id}/checklist/${a.id}`, { token: dono.token, json: { feito: true } });
      assert.equal(marcado.corpo.feito, true);

      await api("PATCH", `/roteiros/${id}/checklist/${b.id}`, { token: dono.token, json: { texto: "Carregador e adaptador" } });
      assert.equal((await detalhe(id)).checklist[1].texto, "Carregador e adaptador");

      assert.equal((await api("DELETE", `/roteiros/${id}/checklist/${a.id}`, { token: dono.token })).status, 204);
      assert.equal((await detalhe(id)).checklist.length, 2);
      assert.equal((await api("DELETE", `/roteiros/${id}/checklist/${a.id}`, { token: dono.token })).status, 404);
    });

    it("valida o texto, limita a 100 itens e isola por dono", async () => {
      const { id } = await roteiroComParadas(1);
      const post = (json: unknown, token = dono.token) => api("POST", `/roteiros/${id}/checklist`, { token, json });

      assert.equal((await post({ texto: "   " })).status, 400);
      assert.equal((await post({ texto: "x".repeat(201) })).status, 400);
      assert.equal((await post({})).status, 400);
      assert.equal((await post({ texto: "oi" }, intruso.token)).status, 404);

      await prisma.itemChecklist.createMany({
        data: Array.from({ length: 100 }, (_, i) => ({ idRoteiro: id, texto: `item ${i}`, ordem: i })),
      });

      assert.equal((await post({ texto: "o 101º" })).status, 409);

      const existente = (await prisma.itemChecklist.findFirst({ where: { idRoteiro: id } }))!;
      const patch = (json: unknown, token = dono.token) => api("PATCH", `/roteiros/${id}/checklist/${existente.id}`, { token, json });

      assert.equal((await patch({})).status, 400);
      assert.equal((await patch({ feito: "sim" })).status, 400);
      assert.equal((await patch({ feito: true }, intruso.token)).status, 404);
      assert.equal((await api("DELETE", `/roteiros/${id}/checklist/${existente.id}`, { token: intruso.token })).status, 404);
    });

    it("a checklist some junto com o roteiro e vai no download de dados da conta", async () => {
      const { id } = await roteiroComParadas(1);
      await api("POST", `/roteiros/${id}/checklist`, { token: dono.token, json: { texto: "Guarda-chuva" } });
      await api("PATCH", `/roteiros/${id}/anotacoes`, { token: dono.token, json: { notas: "minha anotação" } });

      const exportado = (await api("GET", "/auth/me/dados", { token: dono.token })).texto;

      assert.ok(exportado.includes("Guarda-chuva"));
      assert.ok(exportado.includes("minha anotação"));

      await api("DELETE", `/roteiros/${id}`, { token: dono.token });

      assert.equal(await prisma.itemChecklist.count({ where: { idRoteiro: id } }), 0);
    });
  });
});
