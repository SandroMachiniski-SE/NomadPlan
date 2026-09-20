import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const SEGREDO_TESTE = "segredo-de-teste-apenas-para-a-suite-automatizada";

type ModuloAuth = typeof import("./auth");
let auth: ModuloAuth;

// lib/auth lê o JWT_SECRET ao ser carregada, então definimos a variável antes do import.
before(async () => {
  process.env.JWT_SECRET = SEGREDO_TESTE;
  auth = await import("./auth");
});

describe("senhas", () => {
  it("valida a senha correta e recusa a errada", async () => {
    const hash = await auth.gerarHashSenha("senha-correta-123");

    assert.equal(await auth.verificarSenhaOuFalso("senha-correta-123", hash), true);
    assert.equal(await auth.verificarSenhaOuFalso("outra-senha", hash), false);
  });

  it("recusa sempre quando a conta não existe (hash nulo), sem lançar erro", async () => {
    assert.equal(await auth.verificarSenhaOuFalso("qualquer", null), false);
    assert.equal(await auth.verificarSenhaOuFalso("qualquer", undefined), false);
  });

  it("gasta tempo de bcrypt também quando a conta não existe", async () => {
    const hash = await auth.gerarHashSenha("senha-correta-123");

    const medir = async (hashUsado: string | null) => {
      const inicio = process.hrtime.bigint();
      await auth.verificarSenhaOuFalso("senha-errada", hashUsado);
      return Number(process.hrtime.bigint() - inicio) / 1e6;
    };

    const comConta = await medir(hash);
    const semConta = await medir(null);

    // Sem o hash falso, o caminho sem conta seria quase instantâneo (< 1 ms).
    assert.ok(semConta > comConta * 0.3, `sem conta: ${semConta}ms, com conta: ${comConta}ms`);
  });
});

describe("token de login", () => {
  it("gera e verifica um token com o papel da conta", () => {
    const token = auth.gerarToken({ sub: 7, tipoConta: "ADMIN" });
    const dados = auth.verificarToken(token);

    assert.equal(dados.sub, 7);
    assert.equal(dados.tipoConta, "ADMIN");
  });

  it("recusa token assinado com outro segredo", () => {
    const falso = jwt.sign({ sub: 1, tipoConta: "ADMIN" }, "outro-segredo");

    assert.throws(() => auth.verificarToken(falso));
  });
});

describe("token de redefinição de senha", () => {
  it("devolve o id do usuário e a impressão do hash vigente", () => {
    const token = auth.gerarTokenRedefinicaoSenha(42, "hash-atual");
    const dados = auth.verificarTokenRedefinicaoSenha(token);

    assert.equal(dados.idUsuario, 42);
    assert.ok(auth.impressoesIguais(dados.impressao, auth.impressaoSenha("hash-atual")));
  });

  it("deixa de valer depois que a senha muda (uso único)", () => {
    const token = auth.gerarTokenRedefinicaoSenha(42, "hash-antigo");
    const dados = auth.verificarTokenRedefinicaoSenha(token);

    assert.equal(auth.impressoesIguais(dados.impressao, auth.impressaoSenha("hash-novo")), false);
  });

  it("não aceita um token de login no lugar do de redefinição", () => {
    const tokenLogin = auth.gerarToken({ sub: 1, tipoConta: "VISITANTE" });

    assert.throws(() => auth.verificarTokenRedefinicaoSenha(tokenLogin));
  });

  it("não aceita token de redefinição sem impressão (formato antigo)", () => {
    const antigo = jwt.sign({ sub: 1, tipo: "reset-senha" }, SEGREDO_TESTE);

    assert.throws(() => auth.verificarTokenRedefinicaoSenha(antigo));
  });
});
