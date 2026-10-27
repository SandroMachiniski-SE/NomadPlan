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

describe("contribuições dos usuários", () => {
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

  const arquivos = (sub: string) => {
    const pasta = path.join(PASTA_UPLOADS_TESTE, sub);
    return fs.existsSync(pasta) ? fs.readdirSync(pasta) : [];
  };

  describe("sugestões de edição (RF05, RB04, AF05, RF23)", () => {
    const sugerir = (token: string, idPonto: number, campos: Record<string, string>, mensagem?: string) =>
      api("POST", `/pontos/${idPonto}/sugestoes`, { token, json: { camposPropostos: campos, mensagem } });

    it("sugestão de usuário comum vai para a fila e não altera o ponto", async () => {
      const { token } = await criarUsuario();
      const ponto = await criarPonto({ horarioFuncionamento: "9h-18h" });

      const r = await sugerir(token, ponto.id, { horarioFuncionamento: "8h-20h" }, "Mudou o horário");

      assert.equal(r.status, 201);
      assert.equal(r.corpo.status, "PENDENTE");
      assert.equal(r.corpo.aplicadaAutomaticamente, undefined);
      assert.equal((await prisma.pontoTuristico.findUnique({ where: { id: ponto.id } }))?.horarioFuncionamento, "9h-18h");
    });

    it("exige login e só aceita campos permitidos, com valores preenchidos", async () => {
      const { token } = await criarUsuario();
      const ponto = await criarPonto();

      assert.equal((await api("POST", `/pontos/${ponto.id}/sugestoes`, { json: { camposPropostos: { nome: "x" } } })).status, 401);
      assert.equal((await sugerir(token, ponto.id, { status: "PUBLICADO" })).status, 400);
      assert.equal((await sugerir(token, ponto.id, { idResponsavel: "1" })).status, 400);
      assert.equal((await sugerir(token, ponto.id, { nome: "" })).status, 400);
      assert.equal((await sugerir(token, ponto.id, {})).status, 400);
    });

    it("só se sugere sobre ponto publicado", async () => {
      const { token } = await criarUsuario();
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO });

      assert.equal((await sugerir(token, rascunho.id, { nome: "Novo" })).status, 404);
    });

    it("usuário de confiança (reputação 5+) tem a sugestão aplicada na hora e ganha reputação", async () => {
      const { usuario, token } = await criarUsuario({ reputacao: 5 });
      const ponto = await criarPonto({ horarioFuncionamento: "9h-18h" });

      const r = await sugerir(token, ponto.id, { horarioFuncionamento: "8h-20h" });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.aplicadaAutomaticamente, true);
      assert.equal(r.corpo.motivoAplicacao, "reputacao");

      const depois = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } });
      assert.equal(depois.horarioFuncionamento, "8h-20h");
      assert.equal(depois.versao, 2);
      assert.equal(await prisma.versaoPonto.count({ where: { idPonto: ponto.id } }), 1);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).reputacao, 7);
    });

    it("conteúdo suspeito nunca é aplicado sozinho, nem de usuário de confiança, e avisa a moderação (AF05)", async () => {
      const { token } = await criarUsuario({ reputacao: 50 });
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ descricao: "Original" });

      const comLink = await sugerir(token, ponto.id, { siteOficial: "https://golpe.example/oferta" });
      const comPalavrao = await sugerir(token, ponto.id, { descricao: "Esse lugar é uma merda" });
      const naMensagem = await sugerir(token, ponto.id, { descricao: "Texto ok" }, "veja www.promo.example");

      for (const r of [comLink, comPalavrao, naMensagem]) {
        assert.equal(r.status, 201);
        assert.equal(r.corpo.status, "PENDENTE");
        assert.equal(r.corpo.retidaParaModeracao, true);
        assert.equal(r.corpo.aviso, "Sua sugestão será analisada.");
        assert.equal(r.corpo.motivoRetencao, "conteudo_suspeito");
      }

      const depois = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } });
      assert.equal(depois.descricao, "Original");
      assert.equal(depois.siteOficial, null);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: moderador.usuario.id } }), 3);
    });

    it("o dono verificado do ponto tem a sugestão aplicada, sem ganhar reputação; o não verificado vai para a fila", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const verificado = await criarPonto({ idResponsavel: dono.usuario.id, seloVerificado: true, faixaPreco: "$" });
      const comum = await criarPonto({ idResponsavel: dono.usuario.id, faixaPreco: "$" });

      const a = await sugerir(dono.token, verificado.id, { faixaPreco: "$$" });
      const b = await sugerir(dono.token, comum.id, { faixaPreco: "$$" });

      assert.equal(a.corpo.motivoAplicacao, "dono_verificado");
      assert.equal((await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: verificado.id } })).faixaPreco, "$$");
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: dono.usuario.id } })).reputacao, 0);
      assert.equal(b.corpo.status, "PENDENTE");
    });

    it("a mesma mudança proposta por dois usuários diferentes se confirma e é aplicada (RF23)", async () => {
      const ana = await criarUsuario();
      const bia = await criarUsuario();
      const ponto = await criarPonto({ horarioFuncionamento: "9h-18h" });

      const primeira = await sugerir(ana.token, ponto.id, { horarioFuncionamento: "Seg-Sex 8h-20h" });
      assert.equal(primeira.corpo.status, "PENDENTE");

      const segunda = await sugerir(bia.token, ponto.id, { horarioFuncionamento: "  seg-sex  8H-20h " });

      assert.equal(segunda.status, 201);
      assert.equal(segunda.corpo.aplicadaAutomaticamente, true);
      assert.equal(segunda.corpo.motivoAplicacao, "confirmacoes");

      assert.equal(
        (await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } })).horarioFuncionamento,
        "  seg-sex  8H-20h ".trim(),
      );

      const estados = await prisma.sugestaoEdicao.findMany({ where: { idPonto: ponto.id } });
      assert.ok(estados.every((s) => s.status === "APROVADA"));

      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuario.id } })).reputacao, 2);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: bia.usuario.id } })).reputacao, 2);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: ana.usuario.id } }), 1);
    });

    it("a mesma pessoa sugerindo duas vezes não conta como confirmação", async () => {
      const ana = await criarUsuario();
      const ponto = await criarPonto({ horarioFuncionamento: "9h-18h" });

      await sugerir(ana.token, ponto.id, { horarioFuncionamento: "8h-20h" });
      const repetida = await sugerir(ana.token, ponto.id, { horarioFuncionamento: "8h-20h" });

      assert.equal(repetida.corpo.status, "PENDENTE");
      assert.equal((await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } })).horarioFuncionamento, "9h-18h");
    });

    it("propostas diferentes não se confirmam entre si", async () => {
      const ana = await criarUsuario();
      const bia = await criarUsuario();
      const ponto = await criarPonto({ horarioFuncionamento: "9h-18h" });

      await sugerir(ana.token, ponto.id, { horarioFuncionamento: "8h-20h" });
      const outra = await sugerir(bia.token, ponto.id, { horarioFuncionamento: "10h-22h" });

      assert.equal(outra.corpo.status, "PENDENTE");
      assert.equal(await prisma.sugestaoEdicao.count({ where: { status: "PENDENTE" } }), 2);
    });

    it("a moderação lista as pendentes e vê o motivo da retenção; usuário comum não lista", async () => {
      const autor = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto();
      await sugerir(autor.token, ponto.id, { descricao: "http://spam.example" });

      assert.equal((await api("GET", "/sugestoes", { token: autor.token })).status, 403);

      const r = await api("GET", "/sugestoes", { token: moderador.token });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.total, 1);
      assert.equal(r.corpo.dados[0].motivoRetencao, "conteudo_suspeito");
    });

    it("aprovar aplica a mudança, versiona, premia o autor e avisa; segunda aprovação dá 409", async () => {
      const autor = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ telefoneContato: "111" });
      await sugerir(autor.token, ponto.id, { telefoneContato: "222" });
      const sugestao = await prisma.sugestaoEdicao.findFirstOrThrow({ where: { idPonto: ponto.id } });

      const r = await api("POST", `/sugestoes/${sugestao.id}/aprovar`, { token: moderador.token });

      assert.equal(r.status, 200);
      const depois = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } });
      assert.equal(depois.telefoneContato, "222");
      assert.equal(depois.versao, 2);
      assert.equal(await prisma.versaoPonto.count({ where: { idPonto: ponto.id } }), 1);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: autor.usuario.id } })).reputacao, 2);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: autor.usuario.id } }), 1);
      assert.equal((await api("POST", `/sugestoes/${sugestao.id}/aprovar`, { token: moderador.token })).status, 409);
    });

    it("rejeitar exige motivo e não altera o ponto", async () => {
      const autor = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto({ telefoneContato: "111" });
      await sugerir(autor.token, ponto.id, { telefoneContato: "222" });
      const sugestao = await prisma.sugestaoEdicao.findFirstOrThrow({ where: { idPonto: ponto.id } });

      assert.equal((await api("POST", `/sugestoes/${sugestao.id}/rejeitar`, { token: moderador.token, json: {} })).status, 400);
      assert.equal(
        (await api("POST", `/sugestoes/${sugestao.id}/rejeitar`, { token: moderador.token, json: { motivo: "Sem fonte" } })).status,
        200,
      );
      assert.equal((await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } })).telefoneContato, "111");
    });

    it("só o dono e a moderação veem as sugestões de um ponto", async () => {
      const dono = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const outro = await criarUsuario();
      const ponto = await criarPonto({ idResponsavel: dono.usuario.id });

      assert.equal((await api("GET", `/pontos/${ponto.id}/sugestoes`, { token: dono.token })).status, 200);
      assert.equal((await api("GET", `/pontos/${ponto.id}/sugestoes`, { token: outro.token })).status, 403);
    });
  });

  describe("avaliações (RF14, RF15)", () => {
    const avaliar = (token: string, idPonto: number, json: Record<string, unknown>) =>
      api("POST", `/pontos/${idPonto}/avaliacoes`, { token, json });

    it("publica na hora uma avaliação normal e dá reputação ao autor", async () => {
      const { usuario, token } = await criarUsuario();
      const ponto = await criarPonto();

      const r = await avaliar(token, ponto.id, { nota: 5, comentario: "Lugar lindo" });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.status, "APROVADA");
      assert.equal(r.corpo.retidaParaModeracao, false);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).reputacao, 1);

      const lista = await api("GET", `/pontos/${ponto.id}/avaliacoes`);
      assert.equal(lista.corpo.total, 1);
      assert.equal(lista.corpo.media, 5);
      assert.equal(lista.corpo.dados[0].autor.nome, usuario.nome);
    });

    it("valida a nota (1 a 5), exige login e só avalia ponto publicado", async () => {
      const { token } = await criarUsuario();
      const ponto = await criarPonto();
      const rascunho = await criarPonto({ status: StatusPonto.RASCUNHO });

      assert.equal((await api("POST", `/pontos/${ponto.id}/avaliacoes`, { json: { nota: 5 } })).status, 401);
      assert.equal((await avaliar(token, ponto.id, { nota: 0 })).status, 400);
      assert.equal((await avaliar(token, ponto.id, { nota: 6 })).status, 400);
      assert.equal((await avaliar(token, ponto.id, { nota: 3.5 })).status, 400);
      assert.equal((await avaliar(token, rascunho.id, { nota: 4 })).status, 404);
    });

    it("não deixa avaliar duas vezes, mesmo com requisições simultâneas (trava do banco)", async () => {
      const { token } = await criarUsuario();
      const ponto = await criarPonto();

      const respostas = await Promise.all(Array.from({ length: 6 }, () => avaliar(token, ponto.id, { nota: 4 })));

      assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409, 409, 409, 409, 409]);
      assert.equal(await prisma.avaliacao.count({ where: { idPonto: ponto.id } }), 1);
    });

    it("segura para moderação o comentário suspeito: não aparece, não dá reputação e avisa a equipe", async () => {
      const { usuario, token } = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto();

      const r = await avaliar(token, ponto.id, { nota: 1, comentario: "Acesse http://golpe.example" });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.status, "PENDENTE");
      assert.equal(r.corpo.retidaParaModeracao, true);
      assert.equal(r.corpo.motivoRetencao, "conteudo_suspeito");
      assert.equal((await api("GET", `/pontos/${ponto.id}/avaliacoes`)).corpo.total, 0);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).reputacao, 0);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: moderador.usuario.id } }), 1);
    });

    it("ignora um endereço de foto externo enviado no JSON (só vale foto enviada de verdade)", async () => {
      const { token } = await criarUsuario();
      const ponto = await criarPonto();

      const r = await avaliar(token, ponto.id, { nota: 5, fotoUrl: "https://rastreador.example/pixel.png" });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.fotoUrl, null);
    });

    it("moderação aprova (publica, premia e avisa o autor) ou rejeita (motivo, aviso)", async () => {
      const autor = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto();
      await avaliar(autor.token, ponto.id, { nota: 2, comentario: "www.spam.example" });
      const avaliacao = await prisma.avaliacao.findFirstOrThrow({ where: { idPonto: ponto.id } });

      assert.equal((await api("GET", "/avaliacoes", { token: autor.token })).status, 403);
      assert.equal((await api("GET", "/avaliacoes", { token: moderador.token })).corpo.total, 1);

      assert.equal((await api("POST", `/avaliacoes/${avaliacao.id}/rejeitar`, { token: moderador.token, json: {} })).status, 400);

      const aprovada = await api("POST", `/avaliacoes/${avaliacao.id}/aprovar`, { token: moderador.token });
      assert.equal(aprovada.status, 200);
      assert.equal((await api("GET", `/pontos/${ponto.id}/avaliacoes`)).corpo.total, 1);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: autor.usuario.id } })).reputacao, 1);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: autor.usuario.id } }), 1);
      assert.equal((await api("POST", `/avaliacoes/${avaliacao.id}/aprovar`, { token: moderador.token })).status, 409);
    });

    it("rejeitar avisa o autor com o motivo", async () => {
      const autor = await criarUsuario();
      const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
      const ponto = await criarPonto();
      await avaliar(autor.token, ponto.id, { nota: 1, comentario: "http://spam.example" });
      const avaliacao = await prisma.avaliacao.findFirstOrThrow({ where: { idPonto: ponto.id } });

      const r = await api("POST", `/avaliacoes/${avaliacao.id}/rejeitar`, {
        token: moderador.token,
        json: { motivo: "Contém propaganda" },
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.status, "REJEITADA");

      const aviso = await prisma.notificacao.findFirstOrThrow({ where: { idUsuario: autor.usuario.id } });
      assert.match(aviso.mensagem, /Contém propaganda/);
      assert.equal((await api("GET", `/pontos/${ponto.id}/avaliacoes`)).corpo.total, 0);
    });

    describe("com foto", () => {
      const avaliarComFoto = (token: string, idPonto: number, nota: number, conteudo: Buffer, tipo = "image/png") => {
        const form = formularioComArquivo("foto", conteudo, "foto.png", tipo);
        form.append("nota", String(nota));
        form.append("comentario", "Com foto");

        return api("POST", `/pontos/${idPonto}/avaliacoes`, { token, form });
      };

      it("fica retida para revisão humana e a foto só aparece depois de aprovada", async () => {
        const autor = await criarUsuario();
        const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
        const ponto = await criarPonto();

        const r = await avaliarComFoto(autor.token, ponto.id, 5, PNG_MINIMO);

        assert.equal(r.status, 201);
        assert.equal(r.corpo.status, "PENDENTE");
        assert.equal(r.corpo.motivoRetencao, "foto_anexada");
        assert.match(r.corpo.fotoUrl, /^\/uploads\/avaliacoes\/.+\.png$/);
        assert.equal((await api("GET", `/pontos/${ponto.id}/avaliacoes`)).corpo.total, 0);

        await api("POST", `/avaliacoes/${r.corpo.id}/aprovar`, { token: moderador.token });

        const lista = await api("GET", `/pontos/${ponto.id}/avaliacoes`);
        assert.equal(lista.corpo.total, 1);
        assert.equal((await fetch(`${servidor.base}${lista.corpo.dados[0].fotoUrl}`)).status, 200);
      });

      it("recusa foto que não é imagem de verdade e não cria a avaliação nem deixa arquivo", async () => {
        const autor = await criarUsuario();
        const ponto = await criarPonto();

        const r = await avaliarComFoto(autor.token, ponto.id, 5, Buffer.from("<html>nao sou imagem</html>"));

        assert.equal(r.status, 415);
        assert.equal(await prisma.avaliacao.count(), 0);
        assert.deepEqual(arquivos("avaliacoes"), []);
      });

      it("avaliação repetida com foto dá 409 e apaga o arquivo enviado", async () => {
        const autor = await criarUsuario();
        const ponto = await criarPonto();

        await avaliar(autor.token, ponto.id, { nota: 4 });
        const r = await avaliarComFoto(autor.token, ponto.id, 5, PNG_MINIMO);

        assert.equal(r.status, 409);
        assert.deepEqual(arquivos("avaliacoes"), []);
      });

      it("dados inválidos com foto não deixam arquivo órfão", async () => {
        const autor = await criarUsuario();
        const ponto = await criarPonto();

        const r = await avaliarComFoto(autor.token, ponto.id, 9, PNG_MINIMO);

        assert.equal(r.status, 400);
        assert.deepEqual(arquivos("avaliacoes"), []);
      });

      it("rejeitar a avaliação apaga a foto do disco", async () => {
        const autor = await criarUsuario();
        const moderador = await criarUsuario({ tipoConta: TipoConta.MODERADOR });
        const ponto = await criarPonto();

        const r = await avaliarComFoto(autor.token, ponto.id, 3, PNG_MINIMO);
        assert.equal(arquivos("avaliacoes").length, 1);

        await api("POST", `/avaliacoes/${r.corpo.id}/rejeitar`, { token: moderador.token, json: { motivo: "Imprópria" } });

        assert.deepEqual(arquivos("avaliacoes"), []);
        assert.equal((await prisma.avaliacao.findUniqueOrThrow({ where: { id: r.corpo.id } })).fotoUrl, null);
      });
    });
  });
});
