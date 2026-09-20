import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validarSegredoJwt } from "./segredoJwt";

const SEGREDO_FORTE = "a3f9c1d27b5e48a0916cd2e7f4b8a1035d6e9c2b7f01a4d8";

describe("validarSegredoJwt", () => {
  it("exige que o segredo exista em qualquer ambiente", () => {
    assert.throws(() => validarSegredoJwt(undefined, "development"), /obrigatória/);
    assert.throws(() => validarSegredoJwt("", "production"), /obrigatória/);
  });

  it("aceita qualquer segredo não vazio em desenvolvimento", () => {
    assert.equal(validarSegredoJwt("dev-only-change-me", "development"), "dev-only-change-me");
    assert.equal(validarSegredoJwt("curto", undefined), "curto");
  });

  it("recusa segredo curto em produção", () => {
    assert.throws(() => validarSegredoJwt("abc123", "production"), /fraco para produção/);
  });

  it("recusa em produção o valor de exemplo do .env.example", () => {
    assert.throws(
      () => validarSegredoJwt("troque-por-um-segredo-forte-em-producao", "production"),
      /fraco para produção/,
    );
  });

  it("aceita segredo longo e aleatório em produção", () => {
    assert.equal(validarSegredoJwt(SEGREDO_FORTE, "production"), SEGREDO_FORTE);
  });
});
