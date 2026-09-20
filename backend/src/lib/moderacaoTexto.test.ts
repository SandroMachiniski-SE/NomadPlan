import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conteudoSuspeito } from "./moderacaoTexto";

describe("conteudoSuspeito", () => {
  it("não marca texto vazio ou ausente", () => {
    assert.equal(conteudoSuspeito(null), false);
    assert.equal(conteudoSuspeito(undefined), false);
    assert.equal(conteudoSuspeito(""), false);
  });

  it("não marca um comentário normal", () => {
    assert.equal(conteudoSuspeito("Lugar lindo, vista incrível e atendimento ótimo."), false);
  });

  it("marca links (comum em spam)", () => {
    assert.equal(conteudoSuspeito("Confira em https://exemplo.com/oferta"), true);
    assert.equal(conteudoSuspeito("visite www.exemplo.com"), true);
  });

  it("marca palavrões independentemente de maiúsculas", () => {
    assert.equal(conteudoSuspeito("Que LIXO de lugar"), true);
  });
});
