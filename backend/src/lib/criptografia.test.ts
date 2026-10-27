import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cifrar, decifrar } from "./criptografia";

describe("criptografia de dados sensíveis", () => {
  const anterior = { chave: process.env.CHAVE_CRIPTOGRAFIA, jwt: process.env.JWT_SECRET };

  beforeEach(() => {
    process.env.CHAVE_CRIPTOGRAFIA = "chave-de-teste-para-a-suite";
  });

  afterEach(() => {
    process.env.CHAVE_CRIPTOGRAFIA = anterior.chave;
    process.env.JWT_SECRET = anterior.jwt;
    if (anterior.chave === undefined) delete process.env.CHAVE_CRIPTOGRAFIA;
    if (anterior.jwt === undefined) delete process.env.JWT_SECRET;
  });

  it("decifra exatamente o que foi cifrado", () => {
    assert.equal(decifrar(cifrar("JBSWY3DPEHPK3PXP")), "JBSWY3DPEHPK3PXP");
  });

  it("não deixa o texto original visível e usa um IV novo a cada vez", () => {
    const a = cifrar("segredo-secreto");
    const b = cifrar("segredo-secreto");

    assert.ok(!a.includes("segredo"));
    assert.notEqual(a, b);
  });

  it("detecta adulteração do conteúdo cifrado", () => {
    const [v, iv, etiqueta, dados] = cifrar("abc").split(".");
    const adulterado = [v, iv, etiqueta, Buffer.from("xyz").toString("base64url")].join(".");

    assert.throws(() => decifrar(adulterado));
    assert.ok(dados.length > 0);
  });

  it("não decifra com outra chave", () => {
    const cifrado = cifrar("abc");
    process.env.CHAVE_CRIPTOGRAFIA = "outra-chave";

    assert.throws(() => decifrar(cifrado));
  });

  it("deriva a chave do JWT_SECRET quando CHAVE_CRIPTOGRAFIA não existe", () => {
    delete process.env.CHAVE_CRIPTOGRAFIA;
    process.env.JWT_SECRET = "jwt-so-para-este-teste";

    assert.equal(decifrar(cifrar("abc")), "abc");
  });

  it("trata CHAVE_CRIPTOGRAFIA em branco (como no .env.example) como não definida", () => {
    process.env.CHAVE_CRIPTOGRAFIA = "";
    process.env.JWT_SECRET = "jwt-so-para-este-teste";

    assert.equal(decifrar(cifrar("abc")), "abc");
  });

  it("recusa um valor em formato desconhecido", () => {
    assert.throws(() => decifrar("texto-qualquer"), /inválido/);
  });
});
