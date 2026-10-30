import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  codificarBase32,
  codigoTotp,
  decodificarBase32,
  gerarSegredoTotp,
  passoDoTempo,
  urlOtpauth,
  verificarTotp,
} from "./totp";

// Segredo ASCII "12345678901234567890" do apêndice B da RFC 6238, em base32.
const SEGREDO_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("codifica e decodifica sem perder dados", () => {
    const original = Buffer.from("12345678901234567890");

    assert.equal(codificarBase32(original), SEGREDO_RFC);
    assert.deepEqual(decodificarBase32(SEGREDO_RFC), original);
  });

  it("recusa caracteres fora do alfabeto", () => {
    assert.throws(() => decodificarBase32("ABC1!"), /inválido/);
  });
});

describe("TOTP (vetores de teste da RFC 6238)", () => {
  // A RFC lista códigos de 8 dígitos; os de 6 são os 6 últimos.
  const vetores: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];

  for (const [segundos, esperado] of vetores) {
    it(`gera ${esperado} em T=${segundos}s`, () => {
      assert.equal(codigoTotp(SEGREDO_RFC, passoDoTempo(segundos * 1000)), esperado);
    });
  }
});

describe("verificarTotp", () => {
  it("aceita o código do passo atual e devolve o passo", () => {
    const t = 1_700_000_000_000;
    const codigo = codigoTotp(SEGREDO_RFC, passoDoTempo(t));

    assert.equal(verificarTotp(SEGREDO_RFC, codigo, t), passoDoTempo(t));
  });

  it("tolera um passo de diferença de relógio, mas não dois", () => {
    const t = 1_700_000_000_000;
    const anterior = codigoTotp(SEGREDO_RFC, passoDoTempo(t) - 1);
    const muitoAntigo = codigoTotp(SEGREDO_RFC, passoDoTempo(t) - 2);

    assert.equal(verificarTotp(SEGREDO_RFC, anterior, t), passoDoTempo(t) - 1);
    assert.equal(verificarTotp(SEGREDO_RFC, muitoAntigo, t), null);
  });

  it("recusa código errado ou em formato inválido", () => {
    const t = 1_700_000_000_000;

    assert.equal(verificarTotp(SEGREDO_RFC, "000000", t), null);
    assert.equal(verificarTotp(SEGREDO_RFC, "12345", t), null);
    assert.equal(verificarTotp(SEGREDO_RFC, "abcdef", t), null);
  });
});

describe("segredo e URL otpauth", () => {
  it("gera segredos base32 únicos de 32 caracteres", () => {
    const a = gerarSegredoTotp();
    const b = gerarSegredoTotp();

    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notEqual(a, b);
  });

  it("monta a URL no formato lido pelos aplicativos autenticadores", () => {
    const url = urlOtpauth("maria@exemplo.com", SEGREDO_RFC);

    assert.ok(url.startsWith("otpauth://totp/NomadPlan%3Amaria%40exemplo.com?"));
    assert.ok(url.includes(`secret=${SEGREDO_RFC}`));
    assert.ok(url.includes("issuer=NomadPlan"));
  });
});
