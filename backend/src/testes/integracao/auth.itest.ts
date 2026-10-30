import "../ambiente";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { TipoConta } from "@prisma/client";
import prisma from "../../lib/prisma";
import { gerarTokenRedefinicaoSenha } from "../../lib/auth";
import { codigoTotp, passoDoTempo } from "../../lib/totp";
import {
  criarCliente,
  criarPonto,
  criarUsuario,
  iniciarServidor,
  limparBanco,
  SENHA_DE_TESTE,
  type ServidorDeTeste,
} from "../suporte";

const DADOS_VALIDOS = {
  nome: "Maria Souza",
  senha: "uma-senha-forte-1",
  aceitouPolitica: true,
};

describe("autenticação e contas", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let n = 0;
  const emailNovo = () => `maria${++n}@exemplo.com`;

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

  describe("cadastro", () => {
    it("cria a conta com consentimento registrado e devolve um token que funciona", async () => {
      const email = emailNovo();
      const r = await api("POST", "/auth/registrar", { json: { ...DADOS_VALIDOS, email } });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.usuario.email, email);
      assert.equal(r.corpo.usuario.tipoConta, "VISITANTE");
      assert.ok(r.corpo.usuario.consentimentoEm, "o consentimento deve ser gravado");
      assert.equal(r.corpo.usuario.senhaHash, undefined, "nunca devolver o hash da senha");

      const me = await api("GET", "/auth/me", { token: r.corpo.token });
      assert.equal(me.status, 200);
      assert.equal(me.corpo.email, email);
    });

    it("exige o aceite da política de privacidade", async () => {
      const semAceite = await api("POST", "/auth/registrar", {
        json: { nome: "Maria", email: emailNovo(), senha: "uma-senha-forte-1" },
      });
      const recusado = await api("POST", "/auth/registrar", {
        json: { ...DADOS_VALIDOS, email: emailNovo(), aceitouPolitica: false },
      });

      assert.equal(semAceite.status, 400);
      assert.match(semAceite.corpo.erro, /Política de Privacidade/);
      assert.equal(recusado.status, 400);
      assert.equal(await prisma.usuario.count(), 0);
    });

    it("recusa e-mail repetido, ignorando maiúsculas", async () => {
      const email = emailNovo();
      await api("POST", "/auth/registrar", { json: { ...DADOS_VALIDOS, email } });
      const r = await api("POST", "/auth/registrar", { json: { ...DADOS_VALIDOS, email: email.toUpperCase() } });

      assert.equal(r.status, 409);
    });

    it("valida senha curta e e-mail inválido", async () => {
      const curta = await api("POST", "/auth/registrar", {
        json: { ...DADOS_VALIDOS, email: emailNovo(), senha: "1234567" },
      });
      const invalido = await api("POST", "/auth/registrar", {
        json: { ...DADOS_VALIDOS, email: "isto-nao-e-email" },
      });

      assert.equal(curta.status, 400);
      assert.equal(invalido.status, 400);
    });

    it("não permite criar conta já como moderador ou administrador", async () => {
      for (const tipoConta of ["ADMIN", "MODERADOR"]) {
        const r = await api("POST", "/auth/registrar", {
          json: { ...DADOS_VALIDOS, email: emailNovo(), tipoConta },
        });

        assert.equal(r.status, 400, tipoConta);
      }
    });
  });

  describe("login", () => {
    it("entra com a senha certa e registra o acesso no log", async () => {
      const { usuario } = await criarUsuario({ email: "joao@exemplo.com" });
      const r = await api("POST", "/auth/login", { json: { email: "JOAO@exemplo.com", senha: SENHA_DE_TESTE } });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.usuario.id, usuario.id);
      assert.ok(r.corpo.token);

      const log = await prisma.logAuditoria.findFirst({ where: { acao: "login_ok", idUsuario: usuario.id } });
      assert.ok(log, "login bem-sucedido deve ir para o log");
    });

    it("dá a mesma resposta para senha errada e e-mail inexistente", async () => {
      await criarUsuario({ email: "joao@exemplo.com" });

      const senhaErrada = await api("POST", "/auth/login", { json: { email: "joao@exemplo.com", senha: "errada-errada" } });
      const inexistente = await api("POST", "/auth/login", { json: { email: "ninguem@exemplo.com", senha: "errada-errada" } });

      assert.equal(senhaErrada.status, 401);
      assert.equal(inexistente.status, 401);
      assert.equal(senhaErrada.corpo.erro, inexistente.corpo.erro);
      assert.match(senhaErrada.corpo.erro, /E-mail ou senha inválidos/);
    });

    it("registra a falha no log de segurança com o IP, sem guardar o e-mail digitado", async () => {
      await api("POST", "/auth/login", { json: { email: "segredo-no-campo-errado@exemplo.com", senha: "x" } });

      const log = await prisma.logAuditoria.findFirst({ where: { acao: "login_falhou" } });

      assert.ok(log);
      assert.ok((log.detalhes as { ip?: string }).ip);
      assert.ok(!JSON.stringify(log).includes("segredo-no-campo-errado"));
    });

    it("recusa conta desativada com 403", async () => {
      await criarUsuario({ email: "inativo@exemplo.com", ativo: false });
      const r = await api("POST", "/auth/login", { json: { email: "inativo@exemplo.com", senha: SENHA_DE_TESTE } });

      assert.equal(r.status, 403);
    });

    it("valida o formato do corpo", async () => {
      const r = await api("POST", "/auth/login", { json: { email: "nao-e-email", senha: "" } });

      assert.equal(r.status, 400);
    });
  });

  describe("sessão sempre conferida no banco", () => {
    it("derruba na hora o token de uma conta desativada", async () => {
      const { usuario, token } = await criarUsuario();
      assert.equal((await api("GET", "/auth/me", { token })).status, 200);

      await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });

      const r = await api("GET", "/auth/me", { token });
      assert.equal(r.status, 401);
      assert.match(r.corpo.erro, /não está mais ativa/);
    });

    it("usa o papel atual do banco, não o que estava gravado no token", async () => {
      const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      assert.equal((await api("GET", "/admin/usuarios", { token })).status, 200);

      await prisma.usuario.update({ where: { id: usuario.id }, data: { tipoConta: TipoConta.VISITANTE } });

      assert.equal((await api("GET", "/admin/usuarios", { token })).status, 403);
    });

    it("trata token inválido ou ausente como não autenticado", async () => {
      assert.equal((await api("GET", "/auth/me")).status, 401);
      assert.equal((await api("GET", "/auth/me", { token: "lixo.lixo.lixo" })).status, 401);
    });

    it("em rotas de autenticação opcional, token de conta desativada vira visitante anônimo", async () => {
      const { usuario, token } = await criarUsuario();
      const rascunho = await criarPonto({ status: "RASCUNHO", idResponsavel: usuario.id });

      assert.equal((await api("GET", `/pontos/${rascunho.id}`, { token })).status, 200);

      await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });

      assert.equal((await api("GET", `/pontos/${rascunho.id}`, { token })).status, 404);
    });

    it("renova a sessão devolvendo um token novo e válido", async () => {
      const { token } = await criarUsuario();
      const r = await api("POST", "/auth/renovar", { token });

      assert.equal(r.status, 200);
      assert.ok(r.corpo.token);
      assert.equal((await api("GET", "/auth/me", { token: r.corpo.token })).status, 200);
      assert.equal((await api("POST", "/auth/renovar")).status, 401);
    });
  });

  describe("perfil", () => {
    it("atualiza nome, cidade, interesses, idioma e preferências de acessibilidade", async () => {
      const { token } = await criarUsuario();
      const r = await api("PUT", "/auth/me", {
        token,
        json: {
          nome: "Novo Nome",
          cidadeBase: "Joinville",
          interesses: ["Natureza", "Cultura"],
          idioma: "en",
          preferenciasAcessibilidade: ["mobilidade_reduzida", "banheiro_adaptado"],
        },
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.nome, "Novo Nome");
      assert.equal(r.corpo.idioma, "en");
      assert.deepEqual(r.corpo.preferenciasAcessibilidade, ["mobilidade_reduzida", "banheiro_adaptado"]);

      const me = await api("GET", "/auth/me", { token });
      assert.deepEqual(me.corpo.interesses, ["Natureza", "Cultura"]);
    });

    it("recusa idioma e preferência que não existem", async () => {
      const { token } = await criarUsuario();

      assert.equal((await api("PUT", "/auth/me", { token, json: { idioma: "klingon" } })).status, 400);
      assert.equal(
        (await api("PUT", "/auth/me", { token, json: { preferenciasAcessibilidade: ["voar"] } })).status,
        400,
      );
    });

    it("não deixa o usuário mudar o próprio papel pelo perfil", async () => {
      const { usuario, token } = await criarUsuario();
      await api("PUT", "/auth/me", { token, json: { nome: "X", tipoConta: "ADMIN" } });

      const depois = await prisma.usuario.findUnique({ where: { id: usuario.id } });
      assert.equal(depois?.tipoConta, "VISITANTE");
    });

    it("registra o consentimento de quem já tinha conta antes da política", async () => {
      const { usuario, token } = await criarUsuario();
      assert.equal(usuario.consentimentoEm, null);

      const r = await api("POST", "/auth/consentimento", { token });

      assert.equal(r.status, 200);
      assert.ok(r.corpo.consentimentoEm);
    });
  });

  describe("recuperação de senha", () => {
    it("responde igual para e-mail cadastrado e não cadastrado", async () => {
      await criarUsuario({ email: "joao@exemplo.com" });
      const logs = mock.method(console, "log", () => {});

      try {
        const existente = await api("POST", "/auth/esqueci-senha", { json: { email: "joao@exemplo.com" } });
        const inexistente = await api("POST", "/auth/esqueci-senha", { json: { email: "ninguem@exemplo.com" } });

        assert.equal(existente.status, 200);
        assert.deepEqual(existente.corpo, inexistente.corpo);
        // só a conta que existe tem o link gerado
        assert.equal(logs.mock.calls.length, 1);
      } finally {
        logs.mock.restore();
      }
    });

    it("não gera link para conta desativada", async () => {
      await criarUsuario({ email: "inativo@exemplo.com", ativo: false });
      const logs = mock.method(console, "log", () => {});

      try {
        await api("POST", "/auth/esqueci-senha", { json: { email: "inativo@exemplo.com" } });
        assert.equal(logs.mock.calls.length, 0);
      } finally {
        logs.mock.restore();
      }
    });

    it("troca a senha com o link e o link só funciona uma vez", async () => {
      const { usuario } = await criarUsuario({ email: "joao@exemplo.com" });
      const token = gerarTokenRedefinicaoSenha(usuario.id, usuario.senhaHash);

      const primeiro = await api("POST", "/auth/redefinir-senha", { json: { token, novaSenha: "senha-nova-12345" } });
      const segundo = await api("POST", "/auth/redefinir-senha", { json: { token, novaSenha: "outra-senha-999" } });

      assert.equal(primeiro.status, 200);
      assert.equal(segundo.status, 400);
      assert.match(segundo.corpo.erro, /inválido ou expirado/);

      const novo = await api("POST", "/auth/login", { json: { email: "joao@exemplo.com", senha: "senha-nova-12345" } });
      const antigo = await api("POST", "/auth/login", { json: { email: "joao@exemplo.com", senha: SENHA_DE_TESTE } });
      assert.equal(novo.status, 200);
      assert.equal(antigo.status, 401);
    });

    it("recusa token adulterado, de outro tipo e senha nova curta", async () => {
      const { usuario, token: tokenLogin } = await criarUsuario();
      const valido = gerarTokenRedefinicaoSenha(usuario.id, usuario.senhaHash);

      const adulterado = await api("POST", "/auth/redefinir-senha", {
        json: { token: `${valido}x`, novaSenha: "senha-nova-12345" },
      });
      const deLogin = await api("POST", "/auth/redefinir-senha", {
        json: { token: tokenLogin, novaSenha: "senha-nova-12345" },
      });
      const curta = await api("POST", "/auth/redefinir-senha", { json: { token: valido, novaSenha: "curta" } });

      assert.equal(adulterado.status, 400);
      assert.equal(deLogin.status, 400);
      assert.equal(curta.status, 400);
    });

    it("não redefine a senha de uma conta que foi desativada depois do pedido", async () => {
      const { usuario } = await criarUsuario();
      const token = gerarTokenRedefinicaoSenha(usuario.id, usuario.senhaHash);
      await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });

      const r = await api("POST", "/auth/redefinir-senha", { json: { token, novaSenha: "senha-nova-12345" } });

      assert.equal(r.status, 400);
    });
  });

  describe("verificação em duas etapas (2FA)", () => {
    async function ativarMfa(token: string) {
      const config = await api("POST", "/auth/mfa/configurar", { token });
      assert.equal(config.status, 200);
      assert.match(config.corpo.otpauthUrl, /^otpauth:\/\/totp\//);

      // O código do passo seguinte também vale (tolerância de relógio) e deixa o passo
      // atual livre para o teste de login.
      const passo = passoDoTempo(Date.now());
      const ativar = await api("POST", "/auth/mfa/ativar", {
        token,
        json: { codigo: codigoTotp(config.corpo.segredo, passo) },
      });
      assert.equal(ativar.status, 200);

      return { segredo: config.corpo.segredo as string, passoUsado: passo };
    }

    it("guarda o segredo criptografado, não em texto puro", async () => {
      const { usuario, token } = await criarUsuario();
      const config = await api("POST", "/auth/mfa/configurar", { token });

      const gravado = await prisma.usuario.findUnique({ where: { id: usuario.id } });

      assert.ok(gravado?.mfaSegredo);
      assert.ok(!gravado.mfaSegredo.includes(config.corpo.segredo));
      assert.equal(gravado.mfaAtivo, false, "só ativa depois de provar o código");
    });

    it("não ativa com código errado", async () => {
      const { token } = await criarUsuario();
      await api("POST", "/auth/mfa/configurar", { token });
      const r = await api("POST", "/auth/mfa/ativar", { token, json: { codigo: "000000" } });

      assert.equal(r.status, 400);
    });

    it("exige o código no login depois de ativado e não aceita o mesmo código duas vezes", async () => {
      const { usuario, token } = await criarUsuario({ email: "admin@exemplo.com" });
      const { segredo, passoUsado } = await ativarMfa(token);
      const credenciais = { email: "admin@exemplo.com", senha: SENHA_DE_TESTE };

      const semCodigo = await api("POST", "/auth/login", { json: credenciais });
      assert.equal(semCodigo.status, 200);
      assert.equal(semCodigo.corpo.mfaNecessario, true);
      assert.equal(semCodigo.corpo.token, undefined, "sem o código não pode haver token");

      const errado = await api("POST", "/auth/login", { json: { ...credenciais, codigoMfa: "123456" } });
      assert.equal(errado.status, 401);

      // o passo atual já foi consumido na ativação (anti-replay): usa o seguinte
      const codigo = codigoTotp(segredo, passoUsado + 1);
      const certo = await api("POST", "/auth/login", { json: { ...credenciais, codigoMfa: codigo } });
      assert.equal(certo.status, 200);
      assert.ok(certo.corpo.token);

      const repetido = await api("POST", "/auth/login", { json: { ...credenciais, codigoMfa: codigo } });
      assert.equal(repetido.status, 401);

      const falhas = await prisma.logAuditoria.count({
        where: { acao: "login_falhou", idUsuario: usuario.id },
      });
      assert.equal(falhas, 2);
    });

    it("só desativa com a senha e um código válido", async () => {
      const { token } = await criarUsuario({ email: "admin@exemplo.com" });
      const { segredo, passoUsado } = await ativarMfa(token);

      const semSenha = await api("POST", "/auth/mfa/desativar", {
        token,
        json: { senha: "senha-errada", codigoMfa: codigoTotp(segredo, passoUsado + 1) },
      });
      assert.equal(semSenha.status, 403);

      const ok = await api("POST", "/auth/mfa/desativar", {
        token,
        json: { senha: SENHA_DE_TESTE, codigoMfa: codigoTotp(segredo, passoUsado + 1) },
      });
      assert.equal(ok.status, 200);

      const login = await api("POST", "/auth/login", { json: { email: "admin@exemplo.com", senha: SENHA_DE_TESTE } });
      assert.ok(login.corpo.token, "sem 2FA o login volta a ser só com a senha");
    });
  });

  describe("privacidade (LGPD)", () => {
    it("exporta os dados da pessoa sem expor hash de senha nem segredo do 2FA", async () => {
      const { usuario, token } = await criarUsuario({ cidadeBase: "Joinville" });
      await prisma.roteiro.create({ data: { nome: "Meu roteiro", idUsuario: usuario.id } });

      const r = await api("GET", "/auth/me/dados", { token });

      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-disposition") ?? "", /attachment/);
      assert.equal(r.corpo.perfil.cidadeBase, "Joinville");
      assert.equal(r.corpo.roteiros.length, 1);
      assert.ok(!r.texto.includes("senhaHash"));
      assert.ok(!r.texto.includes("mfaSegredo"));
    });

    it("exige a senha para excluir a conta", async () => {
      const { usuario, token } = await criarUsuario();

      const semSenha = await api("DELETE", "/auth/me", { token, json: {} });
      const errada = await api("DELETE", "/auth/me", { token, json: { senha: "senha-errada-1" } });

      assert.equal(semSenha.status, 400);
      assert.equal(errada.status, 403);
      assert.equal((await prisma.usuario.findUnique({ where: { id: usuario.id } }))?.ativo, true);
    });

    it("anonimiza a conta: some o que é pessoal e o resto do histórico permanece", async () => {
      const { usuario, token } = await criarUsuario({ email: "maria@exemplo.com", nome: "Maria Real" });
      const outro = await criarUsuario();
      const ponto = await criarPonto({ idResponsavel: usuario.id });
      const rascunho = await criarPonto({ status: "RASCUNHO", idResponsavel: usuario.id });

      await prisma.roteiro.create({ data: { nome: "Privado", idUsuario: usuario.id } });
      await prisma.notificacao.create({ data: { idUsuario: usuario.id, mensagem: "oi" } });
      await prisma.avaliacao.create({
        data: { idPonto: ponto.id, idAutor: usuario.id, nota: 5, comentario: "Lindo", status: "APROVADA" },
      });
      await api("POST", `/pontos/${ponto.id}/salvar`, { token }).catch(() => undefined);

      const r = await api("DELETE", "/auth/me", { token, json: { senha: SENHA_DE_TESTE } });
      assert.equal(r.status, 200);

      const depois = await prisma.usuario.findUnique({ where: { id: usuario.id } });
      assert.equal(depois?.nome, "Usuário removido");
      assert.equal(depois?.email, `removido-${usuario.id}@anonimo.invalid`);
      assert.equal(depois?.ativo, false);
      assert.ok(depois?.removidoEm);

      assert.equal(await prisma.roteiro.count({ where: { idUsuario: usuario.id } }), 0);
      assert.equal(await prisma.notificacao.count({ where: { idUsuario: usuario.id } }), 0);
      assert.equal(await prisma.pontoTuristico.findUnique({ where: { id: rascunho.id } }), null);
      assert.equal((await prisma.pontoTuristico.findUnique({ where: { id: ponto.id } }))?.idResponsavel, null);
      assert.equal(await prisma.avaliacao.count({ where: { idAutor: usuario.id } }), 1, "a avaliação publicada fica");

      // a conta não entra mais, nem com o token antigo nem com o e-mail antigo
      assert.equal((await api("GET", "/auth/me", { token })).status, 401);
      assert.equal(
        (await api("POST", "/auth/login", { json: { email: "maria@exemplo.com", senha: SENHA_DE_TESTE } })).status,
        401,
      );
      assert.equal((await api("GET", "/auth/me", { token: outro.token })).status, 200);

      const log = await prisma.logAuditoria.findFirst({ where: { acao: "anonimizar_conta" } });
      assert.ok(log);
    });

    it("não deixa o único administrador excluir a conta", async () => {
      const { token } = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const r = await api("DELETE", "/auth/me", { token, json: { senha: SENHA_DE_TESTE } });

      assert.equal(r.status, 409);
      assert.match(r.corpo.erro, /único administrador/);
    });

    it("permite excluir a conta de administrador quando há outro", async () => {
      const { token } = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const r = await api("DELETE", "/auth/me", { token, json: { senha: SENHA_DE_TESTE } });

      assert.equal(r.status, 200);
    });
  });
});
