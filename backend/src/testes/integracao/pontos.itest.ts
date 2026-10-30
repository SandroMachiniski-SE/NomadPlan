import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { StatusPonto, TipoConta } from "@prisma/client";
import prisma from "../../lib/prisma";
import { PASTA_UPLOADS_TESTE } from "../ambiente";
import {
  criarCliente,
  criarPonto,
  criarUsuario,
  formularioComArquivo,
  iniciarServidor,
  limparBanco,
  PNG_MINIMO,
  type ServidorDeTeste,
} from "../suporte";

const PONTO_VALIDO = {
  nome: "Mirante do Boa Vista",
  categoria: "Natureza",
  cidade: "Joinville",
  latitude: -26.3,
  longitude: -48.84,
  horarioFuncionamento: "Seg-Dom 8h-18h",
};

describe("pontos turísticos: cadastro, publicação e moderação", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    fs.rmSync(PASTA_UPLOADS_TESTE, { recursive: true, force: true });
    fs.mkdirSync(PASTA_UPLOADS_TESTE, { recursive: true });
  });

  after(async () => {
    await servidor.fechar();
  });

  describe("cadastro", () => {
    it("só contas de negócio, gestor, moderador e admin cadastram pontos", async () => {
      const visitante = await criarUsuario();
      const morador = await criarUsuario({ tipoConta: TipoConta.MORADOR });
      const negocio = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });

      assert.equal((await api("POST", "/pontos", { json: PONTO_VALIDO })).status, 401);
      assert.equal((await api("POST", "/pontos", { token: visitante.token, json: PONTO_VALIDO })).status, 403);
      assert.equal((await api("POST", "/pontos", { token: morador.token, json: PONTO_VALIDO })).status, 403);
      assert.equal((await api("POST", "/pontos", { token: negocio.token, json: PONTO_VALIDO })).status, 201);
    });

    it("cria como rascunho, com o usuário como responsável, e registra no log", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const r = await api("POST", "/pontos", { token, json: PONTO_VALIDO });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.status, "RASCUNHO");
      assert.equal(r.corpo.idResponsavel, usuario.id);
      assert.equal(r.corpo.versao, 1);
      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "criar", entidade: "ponto_turistico" } }));
    });

    it("valida os campos", async () => {
      const { token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });

      assert.equal((await api("POST", "/pontos", { token, json: { ...PONTO_VALIDO, nome: "" } })).status, 400);
      assert.equal((await api("POST", "/pontos", { token, json: { ...PONTO_VALIDO, latitude: 91 } })).status, 400);
      assert.equal((await api("POST", "/pontos", { token, json: { ...PONTO_VALIDO, longitude: -181 } })).status, 400);
      assert.equal((await api("POST", "/pontos", { token, json: { cidade: "Joinville" } })).status, 400);
    });

    it("avisa de possível duplicado pelo nome e pede confirmação (RB05)", async () => {
      const { token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      await criarPonto({ nome: "Mirante do Boa Vista", cidade: "Joinville", latitude: -26.9, longitude: -48.9 });

      const r = await api("POST", "/pontos", { token, json: { ...PONTO_VALIDO, nome: "MIRANTE DO BOA VISTA" } });

      assert.equal(r.status, 409);
      assert.equal(r.corpo.possiveisDuplicados.length, 1);

      const confirmado = await api("POST", "/pontos", {
        token,
        json: { ...PONTO_VALIDO, nome: "MIRANTE DO BOA VISTA", confirmarDuplicidade: true },
      });
      assert.equal(confirmado.status, 201);
    });

    it("avisa de duplicado também por proximidade (menos de 150 m)", async () => {
      const { token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      await criarPonto({ nome: "Outro nome", cidade: "Joinville", latitude: -26.3, longitude: -48.84 });

      const perto = await api("POST", "/pontos", { token, json: { ...PONTO_VALIDO, longitude: -48.8405 } });
      const longe = await api("POST", "/pontos", { token, json: { ...PONTO_VALIDO, nome: "Mais longe", longitude: -48.8 } });

      assert.equal(perto.status, 409);
      assert.equal(longe.status, 201);
    });

    it("não considera duplicado um ponto de outra cidade nem um rejeitado", async () => {
      const { token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      await criarPonto({ nome: PONTO_VALIDO.nome, cidade: "Blumenau", latitude: -27, longitude: -49 });
      await criarPonto({ nome: "Rejeitado", cidade: "Joinville", status: StatusPonto.REJEITADO });

      const r = await api("POST", "/pontos", { token, json: PONTO_VALIDO });
      const rejeitado = await api("POST", "/pontos", {
        token,
        json: { ...PONTO_VALIDO, nome: "Rejeitado", latitude: -26.5, longitude: -48.5 },
      });

      assert.equal(r.status, 201);
      assert.equal(rejeitado.status, 201);
    });
  });

  describe("publicação e moderação", () => {
    it("lista na mensagem os campos que faltam para publicar (AF07)", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({
        status: StatusPonto.RASCUNHO,
        idResponsavel: usuario.id,
        latitude: null,
        longitude: null,
        horarioFuncionamento: null,
      });

      const r = await api("POST", `/pontos/${ponto.id}/publicar`, { token });

      assert.equal(r.status, 400);
      assert.deepEqual(r.corpo.camposFaltantes, ["coordenadas", "horarioFuncionamento"]);
      assert.equal(r.corpo.erro, "Para publicar, preencha: coordenadas, horarioFuncionamento.");
    });

    it("envia para análise, avisa os moderadores e não deixa enviar duas vezes", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: usuario.id });

      const r = await api("POST", `/pontos/${ponto.id}/publicar`, { token });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.status, "PENDENTE_VERIFICACAO");

      assert.equal(await prisma.notificacao.count({ where: { idUsuario: moderador.usuario.id } }), 1);
      assert.equal((await api("POST", `/pontos/${ponto.id}/publicar`, { token })).status, 409);
    });

    it("só o responsável (ou admin) envia para publicação", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const outro = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });

      assert.equal((await api("POST", `/pontos/${ponto.id}/publicar`, { token: outro.token })).status, 403);
    });

    it("a fila de moderação é restrita a moderadores e administradores", async () => {
      const negocio = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      await criarPonto({ status: StatusPonto.PENDENTE_VERIFICACAO });
      await criarPonto({ status: StatusPonto.RASCUNHO });

      assert.equal((await api("GET", "/pontos/moderacao", { token: negocio.token })).status, 403);

      const r = await api("GET", "/pontos/moderacao", { token: moderador.token });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.total, 1);
    });

    it("aprovar publica, notifica o responsável e fica no log; ponto fora da fila dá 409", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const pendente = await criarPonto({ status: StatusPonto.PENDENTE_VERIFICACAO, idResponsavel: dono.usuario.id });
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO });

      const r = await api("POST", `/pontos/${pendente.id}/aprovar`, { token: moderador.token });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.status, "PUBLICADO");
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: dono.usuario.id } }), 1);
      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "aprovar", idEntidade: pendente.id } }));
      assert.equal((await api("POST", `/pontos/${rascunho.id}/aprovar`, { token: moderador.token })).status, 409);
      assert.equal((await api("POST", `/pontos/${pendente.id}/aprovar`, { token: dono.token })).status, 403);
    });

    it("rejeitar exige motivo, grava o motivo e notifica", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ status: StatusPonto.PENDENTE_VERIFICACAO, idResponsavel: dono.usuario.id });

      assert.equal((await api("POST", `/pontos/${ponto.id}/rejeitar`, { token: moderador.token, json: {} })).status, 400);

      const r = await api("POST", `/pontos/${ponto.id}/rejeitar`, {
        token: moderador.token,
        json: { motivo: "Falta endereço" },
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.status, "REJEITADO");
      assert.equal(r.corpo.motivoRejeicao, "Falta endereço");

      const notificacao = await prisma.notificacao.findFirst({ where: { idUsuario: dono.usuario.id } });
      assert.match(notificacao?.mensagem ?? "", /Falta endereço/);
    });
  });

  describe("consulta de um ponto", () => {
    it("publicado é público; rascunho só o dono e moderadores veem", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const outro = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const publicado = await criarPonto();
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });

      assert.equal((await api("GET", `/pontos/${publicado.id}`)).status, 200);
      assert.equal((await api("GET", `/pontos/${rascunho.id}`)).status, 404);
      assert.equal((await api("GET", `/pontos/${rascunho.id}`, { token: outro.token })).status, 404);
      assert.equal((await api("GET", `/pontos/${rascunho.id}`, { token: dono.token })).status, 200);
      assert.equal((await api("GET", `/pontos/${rascunho.id}`, { token: moderador.token })).status, 200);
    });

    it("trata identificador inválido e inexistente", async () => {
      assert.equal((await api("GET", "/pontos/abc")).status, 400);
      assert.equal((await api("GET", "/pontos/999999")).status, 404);
    });

    it("informa ao usuário logado se o ponto está salvo", async () => {
      const { token } = await criarUsuario();
      const ponto = await criarPonto();

      assert.equal((await api("GET", `/pontos/${ponto.id}`, { token })).corpo.salvo, false);
      await api("POST", `/salvos/${ponto.id}`, { token });
      assert.equal((await api("GET", `/pontos/${ponto.id}`, { token })).corpo.salvo, true);
      assert.equal((await api("GET", `/pontos/${ponto.id}`)).corpo.salvo, false);
    });
  });

  describe("edição, versões e conflitos (RB08, RB09, AF04)", () => {
    it("o dono edita o rascunho: sobe a versão e guarda o estado anterior", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ nome: "Antes", status: StatusPonto.RASCUNHO, idResponsavel: usuario.id });

      const r = await api("PUT", `/pontos/${ponto.id}`, { token, json: { nome: "Depois" } });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.nome, "Depois");
      assert.equal(r.corpo.versao, 2);

      const versoes = await prisma.versaoPonto.findMany({ where: { idPonto: ponto.id } });
      assert.equal(versoes.length, 1);
      assert.equal((versoes[0].dados as { nome: string }).nome, "Antes");
    });

    it("outro usuário não edita; ponto publicado não é editado pelo dono", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const outro = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });
      const publicado = await criarPonto({ idResponsavel: dono.usuario.id });

      assert.equal((await api("PUT", `/pontos/${rascunho.id}`, { token: outro.token, json: { nome: "X" } })).status, 403);
      assert.equal((await api("PUT", `/pontos/${publicado.id}`, { token: dono.token, json: { nome: "X" } })).status, 409);
    });

    it("o administrador ajusta um ponto publicado sem tirá-lo do ar", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const publicado = await criarPonto({ nome: "Antes" });

      const r = await api("PUT", `/pontos/${publicado.id}`, { token: admin.token, json: { nome: "Corrigido" } });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.status, "PUBLICADO");
      assert.equal((await api("GET", `/pontos/${publicado.id}`)).status, 200);
    });

    it("edição de um rejeitado volta a rascunho e limpa o motivo", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ status: StatusPonto.REJEITADO, idResponsavel: usuario.id });
      await prisma.pontoTuristico.update({ where: { id: ponto.id }, data: { motivoRejeicao: "ruim" } });

      const r = await api("PUT", `/pontos/${ponto.id}`, { token, json: { descricao: "Melhorei" } });

      assert.equal(r.corpo.status, "RASCUNHO");
      assert.equal(r.corpo.motivoRejeicao, null);
    });

    it("recusa a edição de quem abriu uma versão antiga e devolve o ponto atual (409)", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: usuario.id });

      await api("PUT", `/pontos/${ponto.id}`, { token, json: { nome: "Primeira edição", versaoEsperada: 1 } });
      const atrasada = await api("PUT", `/pontos/${ponto.id}`, { token, json: { nome: "Edição velha", versaoEsperada: 1 } });

      assert.equal(atrasada.status, 409);
      assert.equal(atrasada.corpo.pontoAtual.nome, "Primeira edição");
      assert.equal((await prisma.pontoTuristico.findUnique({ where: { id: ponto.id } }))?.nome, "Primeira edição");
    });

    it("de duas edições simultâneas sobre a mesma versão, só uma vence (trava atômica)", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: usuario.id });

      const respostas = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          api("PUT", `/pontos/${ponto.id}`, { token, json: { nome: `Edição ${i}`, versaoEsperada: 1 } }),
        ),
      );

      const status = respostas.map((r) => r.status).sort();
      assert.deepEqual(status, [200, 409, 409, 409, 409, 409]);
      assert.equal((await prisma.pontoTuristico.findUnique({ where: { id: ponto.id } }))?.versao, 2);
      assert.equal(await prisma.versaoPonto.count({ where: { idPonto: ponto.id } }), 1);
    });

    it("mesmo sem informar a versão, edições simultâneas não se atropelam em silêncio", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: usuario.id });

      const respostas = await Promise.all(
        Array.from({ length: 5 }, (_, i) => api("PUT", `/pontos/${ponto.id}`, { token, json: { nome: `E${i}` } })),
      );

      const ok = respostas.filter((r) => r.status === 200).length;
      const final = await prisma.pontoTuristico.findUnique({ where: { id: ponto.id } });

      assert.equal(final?.versao, 1 + ok, "cada gravação bem-sucedida soma exatamente uma versão");
      assert.equal(await prisma.versaoPonto.count({ where: { idPonto: ponto.id } }), ok);
    });

    it("lista o histórico só para o dono e moderadores", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const outro = await criarUsuario();
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });
      await api("PUT", `/pontos/${ponto.id}`, { token: dono.token, json: { nome: "Novo" } });

      assert.equal((await api("GET", `/pontos/${ponto.id}/versoes`, { token: dono.token })).corpo.total, 1);
      assert.equal((await api("GET", `/pontos/${ponto.id}/versoes`, { token: outro.token })).status, 403);
    });

    it("dono restaura versão só enquanto o ponto é rascunho; publicado exige moderador (RB09)", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ nome: "Original", status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });

      await api("PUT", `/pontos/${ponto.id}`, { token: dono.token, json: { nome: "Editado" } });
      const versao = await prisma.versaoPonto.findFirstOrThrow({ where: { idPonto: ponto.id } });

      const restaurado = await api("POST", `/pontos/${ponto.id}/versoes/${versao.id}/restaurar`, { token: dono.token });
      assert.equal(restaurado.status, 200);
      assert.equal(restaurado.corpo.nome, "Original");
      assert.equal(await prisma.versaoPonto.count({ where: { idPonto: ponto.id } }), 2, "a restauração também é versionada");

      await prisma.pontoTuristico.update({ where: { id: ponto.id }, data: { status: StatusPonto.PUBLICADO } });

      const negado = await api("POST", `/pontos/${ponto.id}/versoes/${versao.id}/restaurar`, { token: dono.token });
      assert.equal(negado.status, 403);

      const pelaModeracao = await api("POST", `/pontos/${ponto.id}/versoes/${versao.id}/restaurar`, {
        token: moderador.token,
      });
      assert.equal(pelaModeracao.status, 200);
    });
  });

  describe("imagem do ponto (RNF03, AF03)", () => {
    async function pontoDoDono() {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const ponto = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });
      return { dono, ponto };
    }

    const arquivosNaPasta = (sub: string) => {
      const pasta = path.join(PASTA_UPLOADS_TESTE, sub);
      return fs.existsSync(pasta) ? fs.readdirSync(pasta) : [];
    };

    it("aceita um PNG de verdade, serve o arquivo e usa a extensão do tipo, não a do nome", async () => {
      const { dono, ponto } = await pontoDoDono();

      const r = await api("POST", `/pontos/${ponto.id}/imagem`, {
        token: dono.token,
        form: formularioComArquivo("imagem", PNG_MINIMO, "pagina.html", "image/png"),
      });

      assert.equal(r.status, 200);
      assert.match(r.corpo.imagemUrl, /^\/uploads\/pontos\/\d+-\d+\.png$/);

      const servido = await fetch(`${servidor.base}${r.corpo.imagemUrl}`);
      assert.equal(servido.status, 200);
      assert.equal(servido.headers.get("content-type"), "image/png");
    });

    it("recusa com 413 e mensagem clara a imagem acima de 5 MB, sem deixar arquivo parcial", async () => {
      const { dono, ponto } = await pontoDoDono();
      const grande = Buffer.concat([PNG_MINIMO, Buffer.alloc(5 * 1024 * 1024 + 10)]);

      const r = await api("POST", `/pontos/${ponto.id}/imagem`, {
        token: dono.token,
        form: formularioComArquivo("imagem", grande, "grande.png", "image/png"),
      });

      assert.equal(r.status, 413);
      assert.equal(r.corpo.erro, "A imagem excede 5 MB. Reduza o tamanho e tente novamente.");
      assert.deepEqual(arquivosNaPasta("pontos"), []);
    });

    it("recusa com 415 um tipo não suportado", async () => {
      const { dono, ponto } = await pontoDoDono();

      const r = await api("POST", `/pontos/${ponto.id}/imagem`, {
        token: dono.token,
        form: formularioComArquivo("imagem", Buffer.from("texto"), "nota.txt", "text/plain"),
      });

      assert.equal(r.status, 415);
      assert.match(r.corpo.erro, /Formato não suportado/);
    });

    it("recusa com 415 e apaga um HTML/script que se declara como imagem", async () => {
      const { dono, ponto } = await pontoDoDono();

      const r = await api("POST", `/pontos/${ponto.id}/imagem`, {
        token: dono.token,
        form: formularioComArquivo("imagem", Buffer.from("<script>alert(1)</script>"), "foto.png", "image/png"),
      });

      assert.equal(r.status, 415);
      assert.deepEqual(arquivosNaPasta("pontos"), []);
      assert.equal((await prisma.pontoTuristico.findUnique({ where: { id: ponto.id } }))?.imagemUrl, null);
    });

    it("quem não pode editar o ponto nem chega a gravar arquivo", async () => {
      const { ponto } = await pontoDoDono();
      const intruso = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });

      const r = await api("POST", `/pontos/${ponto.id}/imagem`, {
        token: intruso.token,
        form: formularioComArquivo("imagem", PNG_MINIMO, "foto.png", "image/png"),
      });

      assert.equal(r.status, 403);
      assert.deepEqual(arquivosNaPasta("pontos"), []);
    });

    it("trocar a imagem apaga a anterior", async () => {
      const { dono, ponto } = await pontoDoDono();
      const enviar = () =>
        api("POST", `/pontos/${ponto.id}/imagem`, {
          token: dono.token,
          form: formularioComArquivo("imagem", PNG_MINIMO, "foto.png", "image/png"),
        });

      const primeira = await enviar();
      const segunda = await enviar();

      assert.notEqual(primeira.corpo.imagemUrl, segunda.corpo.imagemUrl);
      assert.equal(arquivosNaPasta("pontos").length, 1);
    });

    it("a imagem de um ponto publicado só o administrador troca", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const ponto = await criarPonto({ idResponsavel: dono.usuario.id });
      const form = () => formularioComArquivo("imagem", PNG_MINIMO, "foto.png", "image/png");

      assert.equal((await api("POST", `/pontos/${ponto.id}/imagem`, { token: dono.token, form: form() })).status, 409);
      assert.equal((await api("POST", `/pontos/${ponto.id}/imagem`, { token: admin.token, form: form() })).status, 200);
    });

    it("pede imagem quando o campo não vem", async () => {
      const { dono, ponto } = await pontoDoDono();
      const r = await api("POST", `/pontos/${ponto.id}/imagem`, { token: dono.token, form: new FormData() });

      assert.equal(r.status, 400);
    });
  });

  describe("selo de verificação (RB03)", () => {
    it("só o responsável, só de ponto publicado, uma solicitação pendente por vez", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const outro = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const publicado = await criarPonto({ idResponsavel: dono.usuario.id });
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO, idResponsavel: dono.usuario.id });

      assert.equal((await api("POST", `/pontos/${publicado.id}/solicitar-verificacao`, { token: outro.token, json: {} })).status, 403);
      assert.equal((await api("POST", `/pontos/${rascunho.id}/solicitar-verificacao`, { token: dono.token, json: {} })).status, 409);
      assert.equal(
        (await api("POST", `/pontos/${publicado.id}/solicitar-verificacao`, { token: dono.token, json: { comprovacao: "CNPJ" } })).status,
        201,
      );
      assert.equal((await api("POST", `/pontos/${publicado.id}/solicitar-verificacao`, { token: dono.token, json: {} })).status, 409);
    });

    it("aprovar concede o selo sem republicar um ponto que voltou a rascunho", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ idResponsavel: dono.usuario.id });

      await api("POST", `/pontos/${ponto.id}/solicitar-verificacao`, { token: dono.token, json: {} });
      await prisma.pontoTuristico.update({ where: { id: ponto.id }, data: { status: StatusPonto.RASCUNHO } });

      const solicitacao = await prisma.solicitacaoVerificacao.findFirstOrThrow({ where: { idPonto: ponto.id } });
      const r = await api("POST", `/verificacoes/${solicitacao.id}/aprovar`, { token: moderador.token });

      assert.equal(r.status, 200);

      const depois = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } });
      assert.equal(depois.seloVerificado, true);
      assert.equal(depois.status, "RASCUNHO", "o selo não pode burlar a moderação");
    });

    it("rejeitar exige motivo e notifica quem pediu", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ idResponsavel: dono.usuario.id });
      await api("POST", `/pontos/${ponto.id}/solicitar-verificacao`, { token: dono.token, json: {} });
      const solicitacao = await prisma.solicitacaoVerificacao.findFirstOrThrow({ where: { idPonto: ponto.id } });

      assert.equal((await api("POST", `/verificacoes/${solicitacao.id}/rejeitar`, { token: moderador.token, json: {} })).status, 400);
      assert.equal(
        (await api("POST", `/verificacoes/${solicitacao.id}/rejeitar`, { token: moderador.token, json: { motivo: "Sem prova" } })).status,
        200,
      );
      assert.equal((await api("POST", `/verificacoes/${solicitacao.id}/aprovar`, { token: moderador.token })).status, 409);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: dono.usuario.id } }), 1);
    });
  });
});
