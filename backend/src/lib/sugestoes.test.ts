import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mesmaProposta, sugestaoSuspeita } from "./sugestoes";

describe("sugestaoSuspeita", () => {
  it("aceita uma sugestão normal", () => {
    assert.equal(sugestaoSuspeita({ horarioFuncionamento: "Seg-Sex 9h-18h" }, "Mudou o horário"), false);
  });

  it("marca link em qualquer campo ou na mensagem", () => {
    assert.equal(sugestaoSuspeita({ siteOficial: "https://golpe.com" }), true);
    assert.equal(sugestaoSuspeita({ descricao: "Veja www.promo.com" }), true);
    assert.equal(sugestaoSuspeita({ nome: "Ok" }, "acesse http://spam.com"), true);
  });

  it("marca linguagem imprópria", () => {
    assert.equal(sugestaoSuspeita({ descricao: "Lugar de merda" }), true);
  });
});

describe("mesmaProposta", () => {
  it("considera iguais valores que só diferem em espaços e maiúsculas", () => {
    assert.equal(
      mesmaProposta({ horarioFuncionamento: "Seg-Sex  9h-18h" }, { horarioFuncionamento: " seg-sex 9h-18H " }),
      true,
    );
  });

  it("diferencia valores, campos e quantidade de campos", () => {
    assert.equal(mesmaProposta({ faixaPreco: "$" }, { faixaPreco: "$$" }), false);
    assert.equal(mesmaProposta({ faixaPreco: "$" }, { acessibilidade: "$" }), false);
    assert.equal(mesmaProposta({ faixaPreco: "$" }, { faixaPreco: "$", acessibilidade: "rampa" }), false);
  });
});
