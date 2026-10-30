import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TipoConta } from "@prisma/client";
import prisma from "../../lib/prisma";
import { criarCliente, criarUsuario, iniciarServidor, limparBanco, SENHA_DE_TESTE, type ServidorDeTeste } from "../suporte";

// Este arquivo é o único que exercita os limites de taxa reais (RB10, AF01). Cada
// teste usa um IP próprio (via X-Forwarded-For, com TRUST_PROXY ligado) para que os
// contadores em memória de um não contaminem os outros.
delete process.env.RATE_LIMIT_OFF;
process.env.TRUST_PROXY = "1";

async function aguardar<T>(consulta: () => Promise<T | null | undefined | false>, tentativas = 40): Promise<T> {
  for (let i = 0; i < tentativas; i++) {
    const resultado = await consulta();
    if (resultado) return resultado as T;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("condição não atendida a tempo");
}

describe("limites de taxa", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let contadorIp = 0;
  const novoIp = () => ({ "X-Forwarded-For": `10.20.30.${++contadorIp}` });

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

  describe("login (AF01)", () => {
    it("bloqueia a conta após 3 senhas erradas, mesmo com a senha certa depois, e orienta a recuperar a senha", async () => {
      const { usuario } = await criarUsuario();
      const headers = novoIp();

      for (let i = 0; i < 3; i++) {
        const r = await api("POST", "/auth/login", { headers, json: { email: usuario.email, senha: "errada" } });
        assert.equal(r.status, 401, `tentativa ${i + 1}`);
      }

      const bloqueada = await api("POST", "/auth/login", { headers, json: { email: usuario.email, senha: SENHA_DE_TESTE } });

      assert.equal(bloqueada.status, 429);
      assert.match(bloqueada.corpo.erro, /Tente novamente em \d+ minutos? ou recupere a senha/);
      assert.ok(bloqueada.corpo.tentarNovamenteEmMinutos >= 1 && bloqueada.corpo.tentarNovamenteEmMinutos <= 15);
      assert.ok(bloqueada.headers.get("ratelimit-limit") || bloqueada.headers.get("ratelimit"), "cabeçalhos padrão do rate limit");
    });

    it("o bloqueio vale para a conta, não para outra pessoa no mesmo IP", async () => {
      const alvo = await criarUsuario();
      const outra = await criarUsuario();
      const headers = novoIp();

      for (let i = 0; i < 3; i++) {
        await api("POST", "/auth/login", { headers, json: { email: alvo.usuario.email, senha: "errada" } });
      }

      assert.equal((await api("POST", "/auth/login", { headers, json: { email: alvo.usuario.email, senha: "errada" } })).status, 429);
      assert.equal((await api("POST", "/auth/login", { headers, json: { email: outra.usuario.email, senha: SENHA_DE_TESTE } })).status, 200);
    });

    it("trocar de IP não livra quem ataca a mesma conta", async () => {
      const { usuario } = await criarUsuario();

      for (let i = 0; i < 3; i++) {
        await api("POST", "/auth/login", { headers: novoIp(), json: { email: usuario.email, senha: "errada" } });
      }

      const r = await api("POST", "/auth/login", { headers: novoIp(), json: { email: usuario.email, senha: SENHA_DE_TESTE } });
      assert.equal(r.status, 429);
    });

    it("o e-mail é comparado sem diferenciar maiúsculas e espaços", async () => {
      const { usuario } = await criarUsuario();
      const headers = novoIp();
      const variantes = [usuario.email, usuario.email.toUpperCase(), ` ${usuario.email} `];

      for (const email of variantes) {
        await api("POST", "/auth/login", { headers, json: { email, senha: "errada" } });
      }

      assert.equal((await api("POST", "/auth/login", { headers, json: { email: usuario.email, senha: SENHA_DE_TESTE } })).status, 429);
    });

    it("logins bem-sucedidos não consomem o limite", async () => {
      const { usuario } = await criarUsuario();
      const headers = novoIp();

      for (let i = 0; i < 12; i++) {
        const r = await api("POST", "/auth/login", { headers, json: { email: usuario.email, senha: SENHA_DE_TESTE } });
        assert.equal(r.status, 200, `login ${i + 1}`);
      }

      assert.equal((await api("POST", "/auth/login", { headers, json: { email: usuario.email, senha: "errada" } })).status, 401);
    });

    it("limite por IP: passadas 10 falhas contra contas diferentes, o endereço fica bloqueado", async () => {
      const headers = novoIp();

      for (let i = 0; i < 10; i++) {
        const r = await api("POST", "/auth/login", { headers, json: { email: `ninguem${i}@exemplo.com`, senha: "errada" } });
        assert.equal(r.status, 401, `falha ${i + 1}`);
      }

      assert.equal((await api("POST", "/auth/login", { headers, json: { email: "ninguem99@exemplo.com", senha: "errada" } })).status, 429);
      assert.equal(
        (await api("POST", "/auth/login", { headers: novoIp(), json: { email: "ninguem0@exemplo.com", senha: "errada" } })).status,
        401,
        "outro endereço não é afetado",
      );

      const bloqueio = await aguardar(() => prisma.logAuditoria.findFirst({ where: { acao: "login_bloqueado" } }));
      assert.equal((bloqueio.detalhes as { escopo: string }).escopo, "ip");
    });

    it("registra falhas e bloqueios no log de segurança sem guardar o e-mail digitado", async () => {
      const { usuario } = await criarUsuario();
      const headers = novoIp();

      for (let i = 0; i < 4; i++) {
        await api("POST", "/auth/login", { headers, json: { email: usuario.email, senha: "errada" } });
      }

      const falhas = await prisma.logAuditoria.findMany({ where: { acao: "login_falhou" } });
      assert.equal(falhas.length, 3);
      assert.ok(falhas.every((f) => f.idUsuario === usuario.id));
      assert.ok(!JSON.stringify(falhas).includes(usuario.email));

      const bloqueio = await aguardar(() => prisma.logAuditoria.findFirst({ where: { acao: "login_bloqueado" } }));
      assert.equal((bloqueio.detalhes as { escopo: string }).escopo, "conta");
      assert.equal(await prisma.logAuditoria.count({ where: { acao: "login_bloqueado" } }), 1, "só o primeiro bloqueio é registrado");
    });

    it("três bloqueios na mesma hora geram alerta de força bruta e avisam os administradores", async () => {
      const admin = await criarUsuario({ tipoConta: TipoConta.ADMIN });
      const alvos = await Promise.all([criarUsuario(), criarUsuario(), criarUsuario()]);

      for (const alvo of alvos) {
        const headers = novoIp();
        for (let i = 0; i < 4; i++) {
          await api("POST", "/auth/login", { headers, json: { email: alvo.usuario.email, senha: "errada" } });
        }
        await aguardar(async () => (await prisma.logAuditoria.count({ where: { acao: "login_bloqueado" } })) > 0);
      }

      await aguardar(() => prisma.logAuditoria.findFirst({ where: { acao: "alerta_forca_bruta" } }));
      const notificacao = await aguardar(() =>
        prisma.notificacao.findFirst({ where: { idUsuario: admin.usuario.id, mensagem: { contains: "força bruta" } } }),
      );

      assert.equal(await prisma.logAuditoria.count({ where: { acao: "alerta_forca_bruta" } }), 1, "um único alerta por hora");
      assert.equal(notificacao.link, "/admin");
    });
  });

  describe("criação de contas (RB10)", () => {
    it("aceita 10 cadastros por endereço e bloqueia o 11º", async () => {
      const headers = novoIp();
      const dados = (i: number) => ({ nome: `Pessoa ${i}`, email: `limite${i}@exemplo.com`, senha: "uma-senha-forte-1", aceitouPolitica: true });

      for (let i = 0; i < 10; i++) {
        assert.equal((await api("POST", "/auth/registrar", { headers, json: dados(i) })).status, 201, `cadastro ${i + 1}`);
      }

      const r = await api("POST", "/auth/registrar", { headers, json: dados(11) });
      assert.equal(r.status, 429);
      assert.match(r.corpo.erro, /Muitas contas criadas/);
      assert.equal(await prisma.usuario.count({ where: { email: "limite11@exemplo.com" } }), 0);

      assert.equal((await api("POST", "/auth/registrar", { headers: novoIp(), json: dados(12) })).status, 201);
    });
  });

  describe("recuperação de senha", () => {
    it("limita pedidos de e-mail e tentativas de token em conjunto: 10 por endereço", async () => {
      const headers = novoIp();

      for (let i = 0; i < 6; i++) {
        assert.equal((await api("POST", "/auth/esqueci-senha", { headers, json: { email: `x${i}@exemplo.com` } })).status, 200);
      }
      for (let i = 0; i < 4; i++) {
        const r = await api("POST", "/auth/redefinir-senha", { headers, json: { token: "invalido", novaSenha: "outra-senha-forte-1" } });
        assert.notEqual(r.status, 429, `tentativa ${i + 1}`);
      }

      const r = await api("POST", "/auth/esqueci-senha", { headers, json: { email: "outro@exemplo.com" } });
      assert.equal(r.status, 429);
      assert.match(r.corpo.erro, /recuperação de senha/);
    });
  });

  describe("contribuições (RB10)", () => {
    it("sugestões e avaliações dividem o limite de 20 por 15 minutos", async () => {
      const { token } = await criarUsuario();
      const headers = novoIp();

      for (let i = 0; i < 20; i++) {
        const r = await api("POST", "/pontos/1/sugestoes", { token, headers, json: {} });
        assert.notEqual(r.status, 429, `requisição ${i + 1}`);
      }

      const sugestao = await api("POST", "/pontos/1/sugestoes", { token, headers, json: {} });
      const avaliacao = await api("POST", "/pontos/1/avaliacoes", { token, headers, json: { nota: 5 } });

      assert.equal(sugestao.status, 429);
      assert.equal(avaliacao.status, 429);
      assert.match(sugestao.corpo.erro, /Muitas contribuições/);

      const outro = await api("POST", "/pontos/1/sugestoes", { token, headers: novoIp(), json: {} });
      assert.notEqual(outro.status, 429);
    });
  });
});
