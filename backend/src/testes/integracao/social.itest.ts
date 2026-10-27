import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { StatusPonto, TipoConta } from "@prisma/client";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

describe("administração, notificações, pontos salvos e recomendações", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
  });

  after(async () => {
    await servidor.fechar();
  });

  describe("administração de contas (RF19, RF27)", () => {
    it("só administrador lista as contas e altera papéis", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const alvo = await criarUsuario();

      assert.equal((await api("GET", "/admin/usuarios")).status, 401);
      assert.equal((await api("GET", "/admin/usuarios", { token: moderador.token })).status, 403);
      assert.equal((await api("GET", "/admin/usuarios", { token: admin.token })).corpo.total, 3);
      assert.equal(
        (await api("PATCH", `/admin/usuarios/${alvo.usuario.id}/papel`, { token: moderador.token, json: { tipoConta: "ADMIN" } })).status,
        403,
      );
    });

    it("altera o papel de outra conta (com efeito imediato) e registra no log", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const alvo = await criarUsuario();

      assert.equal((await api("GET", "/pontos/moderacao", { token: alvo.token })).status, 403);

      const r = await api("PATCH", `/admin/usuarios/${alvo.usuario.id}/papel`, {
        token: admin.token,
        json: { tipoConta: "MODERADOR" },
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.tipoConta, "MODERADOR");
      assert.equal((await api("GET", "/pontos/moderacao", { token: alvo.token })).status, 200, "o mesmo token já vale como moderador");
      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "alterar_papel", idEntidade: alvo.usuario.id } }));
    });

    it("não deixa mudar o próprio papel, recusa papel inexistente e responde 404 para conta inexistente", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const alvo = await criarUsuario();

      assert.equal(
        (await api("PATCH", `/admin/usuarios/${admin.usuario.id}/papel`, { token: admin.token, json: { tipoConta: "VISITANTE" } })).status,
        400,
      );
      assert.equal(
        (await api("PATCH", `/admin/usuarios/${alvo.usuario.id}/papel`, { token: admin.token, json: { tipoConta: "SUPER" } })).status,
        400,
      );
      assert.equal((await api("PATCH", "/admin/usuarios/99999/papel", { token: admin.token, json: { tipoConta: "MORADOR" } })).status, 404);
    });

    it("desativar uma conta derruba a sessão na hora e reativar devolve o acesso", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const alvo = await criarUsuario();

      assert.equal((await api("GET", "/auth/me", { token: alvo.token })).status, 200);

      const desativada = await api("PATCH", `/admin/usuarios/${alvo.usuario.id}/ativo`, { token: admin.token, json: { ativo: false } });
      assert.equal(desativada.status, 200);
      assert.equal(desativada.corpo.ativo, false);
      assert.equal((await api("GET", "/auth/me", { token: alvo.token })).status, 401);

      await api("PATCH", `/admin/usuarios/${alvo.usuario.id}/ativo`, { token: admin.token, json: { ativo: true } });
      assert.equal((await api("GET", "/auth/me", { token: alvo.token })).status, 200);

      const acoes = (await prisma.logAuditoria.findMany({ where: { idEntidade: alvo.usuario.id } })).map((l) => l.acao);
      assert.ok(acoes.includes("desativar_conta") && acoes.includes("reativar_conta"));
    });

    it("o administrador não desativa a própria conta; valida o corpo; 404 para inexistente", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });

      assert.equal((await api("PATCH", `/admin/usuarios/${admin.usuario.id}/ativo`, { token: admin.token, json: { ativo: false } })).status, 400);
      assert.equal((await api("PATCH", `/admin/usuarios/${admin.usuario.id}/ativo`, { token: admin.token, json: { ativo: "sim" } })).status, 400);
      assert.equal((await api("PATCH", "/admin/usuarios/99999/ativo", { token: admin.token, json: { ativo: false } })).status, 404);
    });

    it("lista o log de auditoria (só admin), com limite validado", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      await prisma.logAuditoria.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({ acao: `acao${i}`, entidade: "teste" })),
      });

      assert.equal((await api("GET", "/admin/auditoria", { token: moderador.token })).status, 403);
      assert.equal((await api("GET", "/admin/auditoria?limite=3", { token: admin.token })).corpo.total, 3);
      assert.equal((await api("GET", "/admin/auditoria?limite=0", { token: admin.token })).status, 400);
      assert.equal((await api("GET", "/admin/auditoria?limite=abc", { token: admin.token })).status, 400);
    });
  });

  describe("métricas (RF28, RNF26)", () => {
    it("moderadores e admins veem totais e usuários ativos; visitantes não", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const visitante = await criarUsuario();
      await criarPonto();
      await criarPonto({ status: StatusPonto.RASCUNHO });
      await prisma.logAuditoria.create({ data: { acao: "login_ok", entidade: "autenticacao", idUsuario: visitante.usuario.id } });
      await prisma.logAuditoria.create({ data: { acao: "login_ok", entidade: "autenticacao", idUsuario: visitante.usuario.id } });

      assert.equal((await api("GET", "/admin/metricas", { token: visitante.token })).status, 403);

      const r = await api("GET", "/admin/metricas", { token: admin.token });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.totalUsuarios, 2);
      assert.equal(r.corpo.totalPontos, 2);
      assert.equal(r.corpo.pontosPublicados, 1);
      assert.equal(r.corpo.usuariosAtivos7d, 1, "dois logins da mesma pessoa contam uma vez");
      assert.equal(r.corpo.usuariosAtivos30d, 1);
    });

    it("série diária de uso: dias sem evento vêm zerados e o CSV acompanha", async () => {
      const { descarregarMetricas, registrarEvento, diaLocal } =
        require("../../lib/metricasUso") as typeof import("../../lib/metricasUso.js");
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      await descarregarMetricas();
      await prisma.metricaDiaria.deleteMany();

      registrarEvento("busca", 4);
      registrarEvento("cadastro", 2);

      const r = await api("GET", "/admin/metricas/uso?dias=7", { token: admin.token });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.serie.length, 7);
      assert.equal(r.corpo.serie[6].dia, diaLocal());
      assert.equal(r.corpo.serie[6].busca, 4);
      assert.equal(r.corpo.serie[6].cadastro, 2);
      assert.equal(r.corpo.serie[0].busca, 0);

      const csv = await api("GET", "/admin/metricas/uso.csv?dias=7", { token: admin.token });
      assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
      assert.ok(csv.texto.startsWith("dia,busca,roteiro_gerado,roteiro_criado,cadastro"));
      assert.equal(csv.texto.split("\n").length, 8);
      assert.ok(csv.texto.includes(`${diaLocal()},4,`));
    });

    it("valida o período e restringe por papel", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const visitante = await criarUsuario();

      assert.equal((await api("GET", "/admin/metricas/uso?dias=0", { token: admin.token })).status, 400);
      assert.equal((await api("GET", "/admin/metricas/uso?dias=400", { token: admin.token })).status, 400);
      assert.equal((await api("GET", "/admin/metricas/uso", { token: visitante.token })).status, 403);
      assert.equal((await api("GET", "/admin/metricas/uso.csv", { token: visitante.token })).status, 403);
    });
  });

  describe("notificações (RF22)", () => {
    it("cada usuário vê só as suas, marca como lida e marca todas", async () => {
      const ana = await criarUsuario();
      const bia = await criarUsuario();
      await prisma.notificacao.createMany({
        data: [
          { idUsuario: ana.usuario.id, mensagem: "A1" },
          { idUsuario: ana.usuario.id, mensagem: "A2" },
          { idUsuario: bia.usuario.id, mensagem: "B1" },
        ],
      });

      const lista = await api("GET", "/notificacoes", { token: ana.token });
      assert.equal(lista.corpo.total, 2);
      assert.equal(lista.corpo.naoLidas, 2);

      const primeira = lista.corpo.dados[0];
      assert.equal((await api("PATCH", `/notificacoes/${primeira.id}/lida`, { token: ana.token })).status, 200);
      assert.equal((await api("PATCH", `/notificacoes/${primeira.id}/lida`, { token: bia.token })).status, 404, "não mexe na notificação de outra pessoa");

      assert.equal((await api("GET", "/notificacoes", { token: ana.token })).corpo.naoLidas, 1);

      assert.equal((await api("POST", "/notificacoes/marcar-todas-lidas", { token: ana.token })).status, 204);
      assert.equal((await api("GET", "/notificacoes", { token: ana.token })).corpo.naoLidas, 0);
      assert.equal((await api("GET", "/notificacoes", { token: bia.token })).corpo.naoLidas, 1);
    });

    it("exige login", async () => {
      assert.equal((await api("GET", "/notificacoes")).status, 401);
    });
  });

  describe("pontos salvos (RF10)", () => {
    it("salva, é idempotente, lista e remove", async () => {
      const { token } = await criarUsuario();
      const a = await criarPonto({ nome: "A" });
      const b = await criarPonto({ nome: "B" });

      assert.equal((await api("POST", `/salvos/${a.id}`, { token })).status, 201);
      assert.equal((await api("POST", `/salvos/${a.id}`, { token })).status, 201, "salvar de novo não dá erro");
      await api("POST", `/salvos/${b.id}`, { token });

      assert.deepEqual((await api("GET", "/salvos/ids", { token })).corpo.ids.sort(), [a.id, b.id].sort());

      const lista = await api("GET", "/salvos", { token });
      assert.equal(lista.corpo.total, 2);
      assert.equal(lista.corpo.dados[0].nome, "B", "o mais recente primeiro");
      assert.ok(lista.corpo.dados[0].salvoEm);

      assert.equal((await api("DELETE", `/salvos/${a.id}`, { token })).status, 204);
      assert.equal((await api("DELETE", `/salvos/${a.id}`, { token })).status, 204, "remover o que não está salvo também é ok");
      assert.equal((await api("GET", "/salvos", { token })).corpo.total, 1);
    });

    it("cada pessoa tem a sua lista; ponto não publicado não pode ser salvo e some se deixar de ser publicado", async () => {
      const ana = await criarUsuario();
      const bia = await criarUsuario();
      const ponto = await criarPonto();
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO });

      await api("POST", `/salvos/${ponto.id}`, { token: ana.token });

      assert.equal((await api("GET", "/salvos", { token: bia.token })).corpo.total, 0);
      assert.equal((await api("POST", `/salvos/${rascunho.id}`, { token: ana.token })).status, 404);
      assert.equal((await api("POST", "/salvos/abc", { token: ana.token })).status, 400);

      await prisma.pontoTuristico.update({ where: { id: ponto.id }, data: { status: StatusPonto.REJEITADO } });
      assert.equal((await api("GET", "/salvos", { token: ana.token })).corpo.total, 0);
    });

    it("exige login", async () => {
      assert.equal((await api("GET", "/salvos")).status, 401);
      assert.equal((await api("POST", "/salvos/1")).status, 401);
    });
  });

  describe("recomendações para o usuário (RF24)", () => {
    it("sugere o que usuários de gostos parecidos salvaram e você ainda não", async () => {
      const eu = await criarUsuario();
      const parecida = await criarUsuario();
      const diferente = await criarUsuario();
      const emComum = await criarPonto({ nome: "Em comum" });
      const indicacao = await criarPonto({ nome: "Indicação da pessoa parecida" });
      const alheio = await criarPonto({ nome: "Gosto de outra pessoa" });

      await api("POST", `/salvos/${emComum.id}`, { token: eu.token });
      await api("POST", `/salvos/${emComum.id}`, { token: parecida.token });
      await api("POST", `/salvos/${indicacao.id}`, { token: parecida.token });
      await api("POST", `/salvos/${alheio.id}`, { token: diferente.token });

      const r = await api("GET", "/pontos/recomendados", { token: eu.token });

      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo.dados.map((p: { nome: string }) => p.nome), ["Indicação da pessoa parecida"]);
      assert.equal(r.corpo.dados[0].motivoRecomendacao, "usuarios_semelhantes");
    });

    it("avaliações boas (4 ou 5) e roteiros também contam como sinal de gosto", async () => {
      const eu = await criarUsuario();
      const parecida = await criarUsuario();
      const comum = await criarPonto({ nome: "Comum" });
      const indicado = await criarPonto({ nome: "Indicado" });

      await prisma.avaliacao.create({ data: { idPonto: comum.id, idAutor: eu.usuario.id, nota: 5, status: "APROVADA" } });
      const roteiro = await prisma.roteiro.create({ data: { nome: "R", idUsuario: parecida.usuario.id } });
      await prisma.itemRoteiro.createMany({
        data: [
          { idRoteiro: roteiro.id, idPonto: comum.id, ordem: 0 },
          { idRoteiro: roteiro.id, idPonto: indicado.id, ordem: 1 },
        ],
      });

      const r = await api("GET", "/pontos/recomendados", { token: eu.token });

      assert.deepEqual(r.corpo.dados.map((p: { nome: string }) => p.nome), ["Indicado"]);
    });

    it("sem sinais, recomenda pelos interesses do perfil e pela cidade base, favorecendo acessibilidade", async () => {
      const eu = await criarUsuario({ interesses: ["Cultura"], cidadeBase: "Joinville" });
      await prisma.usuario.update({ where: { id: eu.usuario.id }, data: { preferenciasAcessibilidade: ["mobilidade_reduzida"] } });
      await criarPonto({ nome: "Museu sem acessibilidade", categoria: "Cultura", cidade: "Joinville" });
      await criarPonto({ nome: "Museu acessível", categoria: "Cultura", cidade: "Joinville", acessibilidade: "Rampa e elevador" });
      await criarPonto({ nome: "Parque", categoria: "Natureza", cidade: "Joinville" });
      await criarPonto({ nome: "Museu de outra cidade", categoria: "Cultura", cidade: "Blumenau" });

      const r = await api("GET", "/pontos/recomendados", { token: eu.token });

      assert.deepEqual(r.corpo.dados.map((p: { nome: string }) => p.nome), ["Museu acessível", "Museu sem acessibilidade"]);
      assert.equal(r.corpo.dados[0].motivoRecomendacao, "interesses");
    });

    it("não repete o mesmo ponto vindo de duas fontes e devolve vazio quando não há nada", async () => {
      const sozinho = await criarUsuario();
      assert.deepEqual((await api("GET", "/pontos/recomendados", { token: sozinho.token })).corpo, { total: 0, dados: [] });

      const eu = await criarUsuario({ interesses: ["Cultura"] });
      const parecida = await criarUsuario({ interesses: ["Cultura"] });
      const museu = await criarPonto({ nome: "Museu", categoria: "Cultura" });
      await api("POST", `/salvos/${museu.id}`, { token: parecida.token });

      const r = await api("GET", "/pontos/recomendados", { token: eu.token });
      const nomes = r.corpo.dados.map((p: { nome: string }) => p.nome);

      assert.deepEqual(nomes, ["Museu"]);
      assert.equal(r.corpo.dados[0].motivoRecomendacao, "usuarios_semelhantes");
    });

    it("exige login", async () => {
      assert.equal((await api("GET", "/pontos/recomendados")).status, 401);
    });
  });
});
