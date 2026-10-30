import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarCidade } from "./cidades";

describe("normalizarCidade", () => {
  it("ignora acentos, maiúsculas e espaços a mais", () => {
    assert.equal(normalizarCidade("Florianópolis"), "florianopolis");
    assert.equal(normalizarCidade("  FLORIANOPOLIS "), "florianopolis");
    assert.equal(normalizarCidade("Balneário   Camboriú"), "balneario camboriu");
  });

  it("tira a UF e o país, do jeito que as pessoas costumam escrever", () => {
    for (const texto of ["Joinville, SC", "Joinville - SC", "Joinville/SC", "Joinville (SC)", "Joinville SC", "Joinville – SC", "Joinville, Santa Catarina", "Joinville, SC, Brasil"]) {
      assert.equal(normalizarCidade(texto), "joinville", texto);
    }
  });

  it("não corta nomes de cidade que terminam em palavra curta de verdade", () => {
    assert.equal(normalizarCidade("Rio do Sul"), "rio do sul");
    assert.equal(normalizarCidade("São Bento do Sul"), "sao bento do sul");
    assert.equal(normalizarCidade("Ita"), "ita");
  });
});
