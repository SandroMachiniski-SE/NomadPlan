import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { StatusPonto } from "@prisma/client";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

describe("roteiros (RF11, RF12, RF13, RF25, RF26)", () => {
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

  async function novoRoteiro(json: Record<string, unknown> = {}, token = dono.token) {
    const r = await api("POST", "/roteiros", { token, json: { nome: "Fim de semana", ...json } });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    return r.corpo as { id: number; itens: { id: number; idPonto: number; ordem: number }[] };
  }

  describe("CRUD e isolamento entre usuários", () => {
    it("exige login em todas as rotas privadas", async () => {
      for (const [metodo, caminho] of [
        ["GET", "/roteiros"],
        ["POST", "/roteiros"],
        ["GET", "/roteiros/1"],
        ["PUT", "/roteiros/1"],
        ["DELETE", "/roteiros/1"],
        ["POST", "/roteiros/gerar"],
      ] as const) {
        assert.equal((await api(metodo, caminho)).status, 401, `${metodo} ${caminho}`);
      }
    });

    it("cria, lista, lê, edita e exclui o próprio roteiro, tudo com registro no log", async () => {
      const criado = await novoRoteiro({ descricao: "Roteiro de teste", cidade: "Joinville" });

      const lista = await api("GET", "/roteiros", { token: dono.token });
      assert.equal(lista.corpo.total, 1);
      assert.equal(lista.corpo.dados[0]._count.itens, 0);

      const detalhe = await api("GET", `/roteiros/${criado.id}`, { token: dono.token });
      assert.equal(detalhe.corpo.nome, "Fim de semana");

      const editado = await api("PUT", `/roteiros/${criado.id}`, { token: dono.token, json: { nome: "Novo nome" } });
      assert.equal(editado.corpo.nome, "Novo nome");
      assert.equal(editado.corpo.descricao, "Roteiro de teste", "campos não enviados permanecem");

      assert.equal((await api("DELETE", `/roteiros/${criado.id}`, { token: dono.token })).status, 204);
      assert.equal((await api("GET", `/roteiros/${criado.id}`, { token: dono.token })).status, 404);

      const acoes = (await prisma.logAuditoria.findMany({ where: { entidade: "roteiro" } })).map((l) => l.acao).sort();
      assert.deepEqual(acoes, ["atualizar", "criar", "excluir"]);
    });

    it("um usuário não enxerga nem mexe no roteiro de outro (404)", async () => {
      const criado = await novoRoteiro();
      const intruso = await criarUsuario();
      const ponto = await criarPonto();

      assert.equal((await api("GET", "/roteiros", { token: intruso.token })).corpo.total, 0);
      assert.equal((await api("GET", `/roteiros/${criado.id}`, { token: intruso.token })).status, 404);
      assert.equal((await api("PUT", `/roteiros/${criado.id}`, { token: intruso.token, json: { nome: "X" } })).status, 404);
      assert.equal((await api("DELETE", `/roteiros/${criado.id}`, { token: intruso.token })).status, 404);
      assert.equal((await api("POST", `/roteiros/${criado.id}/itens`, { token: intruso.token, json: { idPonto: ponto.id } })).status, 404);
      assert.equal((await api("PATCH", `/roteiros/${criado.id}/compartilhar`, { token: intruso.token, json: {} })).status, 404);
      assert.equal((await api("GET", `/roteiros/${criado.id}/versoes`, { token: intruso.token })).status, 404);
    });

    it("valida nome e datas, inclusive ao editar só uma das datas", async () => {
      assert.equal((await api("POST", "/roteiros", { token: dono.token, json: { nome: "" } })).status, 400);
      assert.equal(
        (await api("POST", "/roteiros", { token: dono.token, json: { nome: "X", dataInicio: "2026-12-10", dataFim: "2026-12-01" } })).status,
        400,
      );

      const criado = await novoRoteiro({ dataInicio: "2026-12-10", dataFim: "2026-12-20" });

      const fimAntesDoInicio = await api("PUT", `/roteiros/${criado.id}`, { token: dono.token, json: { dataFim: "2026-12-01" } });
      assert.equal(fimAntesDoInicio.status, 400, "a data nova precisa respeitar a que já estava salva");

      assert.equal((await api("PUT", `/roteiros/${criado.id}`, { token: dono.token, json: { dataFim: "2026-12-30" } })).status, 200);
    });

    it("trata identificador inválido", async () => {
      assert.equal((await api("GET", "/roteiros/abc", { token: dono.token })).status, 400);
    });
  });

  describe("paradas", () => {
    it("adiciona pontos publicados em ordem, recusa repetido (409) e ponto não publicado (404)", async () => {
      const roteiro = await novoRoteiro();
      const a = await criarPonto({ nome: "A" });
      const b = await criarPonto({ nome: "B" });
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO });

      const r1 = await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: a.id, observacao: "Chegar cedo" } });
      const r2 = await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: b.id } });

      assert.equal(r1.status, 201);
      assert.equal(r1.corpo.ordem, 0);
      assert.equal(r1.corpo.observacao, "Chegar cedo");
      assert.equal(r2.corpo.ordem, 1);

      const repetido = await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: a.id } });
      assert.equal(repetido.status, 409);
      assert.equal(repetido.corpo.erro, "Este ponto já está no roteiro.");

      assert.equal((await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: rascunho.id } })).status, 404);
      assert.equal((await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: 0 } })).status, 400);
    });

    it("reordena exigindo exatamente os itens atuais", async () => {
      const roteiro = await novoRoteiro();
      const pontos = [await criarPonto({ nome: "A" }), await criarPonto({ nome: "B" }), await criarPonto({ nome: "C" })];

      for (const ponto of pontos) {
        await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: ponto.id } });
      }

      const itens = (await api("GET", `/roteiros/${roteiro.id}`, { token: dono.token })).corpo.itens as { id: number; ponto: { nome: string } }[];
      const invertidos = [...itens].reverse().map((i) => i.id);

      assert.equal((await api("POST", `/roteiros/${roteiro.id}/itens/reordenar`, { token: dono.token, json: { idsItensEmOrdem: invertidos } })).status, 204);

      const depois = (await api("GET", `/roteiros/${roteiro.id}`, { token: dono.token })).corpo.itens as { ponto: { nome: string } }[];
      assert.deepEqual(depois.map((i) => i.ponto.nome), ["C", "B", "A"]);

      assert.equal((await api("POST", `/roteiros/${roteiro.id}/itens/reordenar`, { token: dono.token, json: { idsItensEmOrdem: invertidos.slice(1) } })).status, 400);
      assert.equal((await api("POST", `/roteiros/${roteiro.id}/itens/reordenar`, { token: dono.token, json: { idsItensEmOrdem: [...invertidos, 9999] } })).status, 400);
    });

    it("remove uma parada e responde 404 se ela não está no roteiro", async () => {
      const roteiro = await novoRoteiro();
      const ponto = await criarPonto();
      await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: ponto.id } });

      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/itens/${ponto.id}`, { token: dono.token })).status, 204);
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/itens/${ponto.id}`, { token: dono.token })).status, 404);
    });
  });

  describe("criação já com paradas (salvar roteiro sugerido)", () => {
    it("grava o roteiro e todas as paradas de uma vez, na ordem enviada", async () => {
      const a = await criarPonto({ nome: "A" });
      const b = await criarPonto({ nome: "B" });

      const criado = await novoRoteiro({ pontos: [{ idPonto: b.id, observacao: "Primeiro" }, { idPonto: a.id }] });

      assert.deepEqual(criado.itens.map((i) => [i.idPonto, i.ordem]), [[b.id, 0], [a.id, 1]]);
    });

    it("se algum ponto não existe ou não está publicado, nada é criado", async () => {
      const a = await criarPonto();
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO });

      const r = await api("POST", "/roteiros", {
        token: dono.token,
        json: { nome: "Parcial", pontos: [{ idPonto: a.id }, { idPonto: rascunho.id }] },
      });

      assert.equal(r.status, 404);
      assert.equal(await prisma.roteiro.count(), 0);
      assert.equal(await prisma.itemRoteiro.count(), 0);
    });

    it("recusa pontos repetidos na lista", async () => {
      const a = await criarPonto();
      const r = await api("POST", "/roteiros", { token: dono.token, json: { nome: "X", pontos: [{ idPonto: a.id }, { idPonto: a.id }] } });

      assert.equal(r.status, 400);
    });
  });

  describe("compartilhamento (RF13)", () => {
    it("gera um link público que funciona sem login, mantém o mesmo link e pode ser desligado", async () => {
      const roteiro = await novoRoteiro({ nome: "Para compartilhar" });
      const ponto = await criarPonto({ nome: "Praça" });
      await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: ponto.id } });

      const privado = await api("GET", `/roteiros/${roteiro.id}`, { token: dono.token });
      assert.equal(privado.corpo.publico, false);

      const ligado = await api("PATCH", `/roteiros/${roteiro.id}/compartilhar`, { token: dono.token, json: { publico: true } });
      assert.equal(ligado.status, 200);
      assert.equal(ligado.corpo.publico, true);
      assert.ok(ligado.corpo.slugPublico);

      const publico = await api("GET", `/roteiros/publico/${ligado.corpo.slugPublico}`);
      assert.equal(publico.status, 200);
      assert.equal(publico.corpo.nome, "Para compartilhar");
      assert.equal(publico.corpo.usuario.nome, dono.usuario.nome);
      assert.equal(publico.corpo.itens[0].ponto.nome, "Praça");
      assert.equal(publico.corpo.idUsuario, undefined, "não expõe o id do dono");
      assert.equal(publico.corpo.usuario.email, undefined, "não expõe o e-mail do dono");

      const novamente = await api("PATCH", `/roteiros/${roteiro.id}/compartilhar`, { token: dono.token, json: { publico: true } });
      assert.equal(novamente.corpo.slugPublico, ligado.corpo.slugPublico);

      const desligado = await api("PATCH", `/roteiros/${roteiro.id}/compartilhar`, { token: dono.token, json: { publico: false } });
      assert.equal(desligado.corpo.publico, false);
      assert.equal((await api("GET", `/roteiros/publico/${ligado.corpo.slugPublico}`)).status, 404);
    });

    it("link inexistente dá 404", async () => {
      assert.equal((await api("GET", "/roteiros/publico/nao-existe")).status, 404);
    });
  });

  describe("histórico de versões (RF26)", () => {
    it("guarda um retrato antes de cada alteração e permite voltar atrás", async () => {
      const a = await criarPonto({ nome: "A" });
      const b = await criarPonto({ nome: "B" });
      const roteiro = await novoRoteiro({ nome: "Original" });

      await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: a.id } });
      await api("PUT", `/roteiros/${roteiro.id}`, { token: dono.token, json: { nome: "Mudei o nome" } });
      await api("POST", `/roteiros/${roteiro.id}/itens`, { token: dono.token, json: { idPonto: b.id } });

      const historico = await api("GET", `/roteiros/${roteiro.id}/versoes`, { token: dono.token });
      assert.equal(historico.corpo.total, 3);
      assert.deepEqual(
        historico.corpo.dados.map((v: { motivo: string }) => v.motivo),
        ["adicionar_ponto", "edicao", "adicionar_ponto"],
      );

      // A versão mais antiga é o roteiro vazio, com o nome original.
      const maisAntiga = historico.corpo.dados[2];
      assert.equal(maisAntiga.dados.nome, "Original");
      assert.equal(maisAntiga.dados.itens.length, 0);

      const r = await api("POST", `/roteiros/${roteiro.id}/versoes/${maisAntiga.id}/restaurar`, { token: dono.token });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.roteiro.nome, "Original");
      assert.equal(r.corpo.roteiro.itens.length, 0);
      assert.equal(r.corpo.pontosIndisponiveis, 0);

      assert.equal(
        await prisma.versaoRoteiro.count({ where: { idRoteiro: roteiro.id, motivo: "antes_de_restaurar" } }),
        1,
        "restaurar também é reversível",
      );
    });

    it("ao restaurar, pontos que deixaram de estar publicados não voltam e são contados", async () => {
      const a = await criarPonto({ nome: "A" });
      const b = await criarPonto({ nome: "B" });
      const roteiro = await novoRoteiro({ pontos: [{ idPonto: a.id }, { idPonto: b.id }] });

      await api("PUT", `/roteiros/${roteiro.id}`, { token: dono.token, json: { nome: "Outro" } });
      const versao = await prisma.versaoRoteiro.findFirstOrThrow({ where: { idRoteiro: roteiro.id } });
      await prisma.pontoTuristico.update({ where: { id: b.id }, data: { status: StatusPonto.REJEITADO } });

      const r = await api("POST", `/roteiros/${roteiro.id}/versoes/${versao.id}/restaurar`, { token: dono.token });

      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo.roteiro.itens.map((i: { idPonto: number }) => i.idPonto), [a.id]);
      assert.equal(r.corpo.pontosIndisponiveis, 1);
    });

    it("versão de outro roteiro dá 404 e o histórico é limitado a 50 versões", async () => {
      const roteiro = await novoRoteiro();
      const outro = await novoRoteiro({ nome: "Outro" });
      await api("PUT", `/roteiros/${outro.id}`, { token: dono.token, json: { nome: "x" } });
      const versaoDoOutro = await prisma.versaoRoteiro.findFirstOrThrow({ where: { idRoteiro: outro.id } });

      assert.equal((await api("POST", `/roteiros/${roteiro.id}/versoes/${versaoDoOutro.id}/restaurar`, { token: dono.token })).status, 404);

      for (let i = 0; i < 55; i += 1) {
        await api("PUT", `/roteiros/${roteiro.id}`, { token: dono.token, json: { nome: `Nome ${i}` } });
      }
      assert.equal(await prisma.versaoRoteiro.count({ where: { idRoteiro: roteiro.id } }), 50);
    });
  });

  describe("geração de roteiro personalizado (RF12, RF25, RB07)", () => {
    // Segunda-feira 10h (local) fixa, para o resultado não depender de quando o teste roda.
    const SEGUNDA_10H = new Date(2026, 9, 26, 10, 0, 0).toISOString();

    it("monta um roteiro com horários estimados em ordem, dentro do tempo disponível", async () => {
      await criarPonto({ nome: "Museu", categoria: "Cultura", longitude: -48.84 });
      await criarPonto({ nome: "Parque", categoria: "Natureza", longitude: -48.83 });
      await criarPonto({ nome: "Outra cidade", cidade: "Blumenau" });

      const r = await api("POST", "/roteiros/gerar", {
        token: dono.token,
        json: { cidade: "joinville", horasDisponiveis: 6, dataHoraInicio: SEGUNDA_10H },
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.fallbackUsado, false);
      assert.deepEqual(r.corpo.pontos.map((p: { nome: string }) => p.nome).sort(), ["Museu", "Parque"]);

      const chegadas = r.corpo.pontos.map((p: { chegadaEstimada: string }) => new Date(p.chegadaEstimada).getTime());
      assert.deepEqual([...chegadas].sort((x, y) => x - y), chegadas);
      assert.deepEqual(r.corpo.pontos.map((p: { ordem: number }) => p.ordem), [0, 1]);
      assert.equal(r.corpo.pontos[0].duracaoVisitaMin, 90);
    });

    it("prioriza os interesses do perfil quando o pedido não informa interesses", async () => {
      await criarPonto({ nome: "Museu", categoria: "Cultura" });
      await criarPonto({ nome: "Parque", categoria: "Natureza" });
      await api("PUT", "/auth/me", { token: dono.token, json: { interesses: ["Cultura"] } });

      const r = await api("POST", "/roteiros/gerar", {
        token: dono.token,
        json: { cidade: "Joinville", horasDisponiveis: 1.5, dataHoraInicio: SEGUNDA_10H },
      });

      assert.deepEqual(r.corpo.pontos.map((p: { nome: string }) => p.nome), ["Museu"]);
    });

    it("favorece lugares que atendem às preferências de acessibilidade do perfil", async () => {
      await criarPonto({ nome: "Sem acessibilidade", categoria: "Cultura", acessibilidade: null });
      await criarPonto({ nome: "Acessível", categoria: "Cultura", acessibilidade: "Rampa de acesso e elevador" });
      await api("PUT", "/auth/me", { token: dono.token, json: { preferenciasAcessibilidade: ["mobilidade_reduzida"] } });

      const r = await api("POST", "/roteiros/gerar", {
        token: dono.token,
        json: { cidade: "Joinville", horasDisponiveis: 1.5, dataHoraInicio: SEGUNDA_10H },
      });

      assert.deepEqual(r.corpo.pontos.map((p: { nome: string }) => p.nome), ["Acessível"]);
    });

    it("explica quando deixa um ponto de fora por estar fechado no horário previsto (RB07)", async () => {
      await criarPonto({ nome: "Aberto", categoria: "Natureza" });
      await criarPonto({ nome: "Feira da tarde", categoria: "Cultura", horarioFuncionamento: "Seg-Sex 20h-23h" });

      const r = await api("POST", "/roteiros/gerar", {
        token: dono.token,
        json: { cidade: "Joinville", horasDisponiveis: 3, interesses: ["Cultura"], dataHoraInicio: SEGUNDA_10H },
      });

      assert.deepEqual(r.corpo.pontos.map((p: { nome: string }) => p.nome), ["Aberto"]);
      assert.match(r.corpo.avisos[0], /Feira da tarde: estaria fechado/);
    });

    it("acha a cidade escrita sem acento ou com a UF", async () => {
      await criarPonto({ nome: "Mercado Público", cidade: "Florianópolis" });

      for (const cidade of ["Florianopolis", "florianópolis, SC", "Florianópolis - SC"]) {
        const r = await api("POST", "/roteiros/gerar", {
          token: dono.token,
          json: { cidade, horasDisponiveis: 1.5, dataHoraInicio: SEGUNDA_10H },
        });

        assert.deepEqual(r.corpo.pontos.map((p: { nome: string }) => p.nome), ["Mercado Público"], cidade);
      }
    });

    it("diz quais cidades existem quando a pedida ainda não tem pontos", async () => {
      await criarPonto({ cidade: "Joinville" });
      await criarPonto({ cidade: "Blumenau" });
      await criarPonto({ cidade: "Pomerode", status: StatusPonto.RASCUNHO });

      const r = await api("POST", "/roteiros/gerar", {
        token: dono.token,
        json: { cidade: "Jaraguá do Sul", horasDisponiveis: 3, dataHoraInicio: SEGUNDA_10H },
      });

      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo.pontos, []);
      assert.equal(r.corpo.avisos[0], 'Ainda não há pontos cadastrados em "Jaraguá do Sul". Cidades disponíveis: Blumenau, Joinville.');
    });

    it("sem horário de início, não devolve roteiro vazio só porque agora é madrugada", async () => {
      await criarPonto({ nome: "Museu", horarioFuncionamento: "Seg-Dom 9h-23h" });

      const r = await api("POST", "/roteiros/gerar", { token: dono.token, json: { cidade: "Joinville", horasDisponiveis: 3 } });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.pontos.length, 1, "o início padrão cai em horário comercial");
      assert.ok(new Date(r.corpo.inicio).getHours() >= 9 && new Date(r.corpo.inicio).getHours() < 17);
    });

    it("cidade sem pontos devolve lista vazia, e a validação rejeita pedido inválido", async () => {
      const vazio = await api("POST", "/roteiros/gerar", { token: dono.token, json: { cidade: "Atlântida" } });
      assert.equal(vazio.status, 200);
      assert.deepEqual(vazio.corpo.pontos, []);

      assert.equal((await api("POST", "/roteiros/gerar", { token: dono.token, json: {} })).status, 400);
      assert.equal((await api("POST", "/roteiros/gerar", { token: dono.token, json: { cidade: "X", horasDisponiveis: 99 } })).status, 400);
    });

    it("conta o roteiro gerado nas métricas de uso", async () => {
      const { descarregarMetricas } = require("../../lib/metricasUso") as typeof import("../../lib/metricasUso.js");
      await descarregarMetricas();
      await prisma.metricaDiaria.deleteMany();

      await api("POST", "/roteiros/gerar", { token: dono.token, json: { cidade: "Joinville" } });
      await descarregarMetricas();

      assert.equal((await prisma.metricaDiaria.findFirst({ where: { tipo: "roteiro_gerado" } }))?.total, 1);
    });
  });
});
