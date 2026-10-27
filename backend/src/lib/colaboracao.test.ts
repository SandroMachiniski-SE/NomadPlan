import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nivelExigido, papelPermite } from "./colaboracao";

describe("papelPermite", () => {
  it("dono pode tudo, editor edita e consulta, leitor só consulta", () => {
    assert.equal(papelPermite("DONO", "dono"), true);
    assert.equal(papelPermite("EDITOR", "dono"), false);
    assert.equal(papelPermite("EDITOR", "edicao"), true);
    assert.equal(papelPermite("LEITOR", "edicao"), false);
    assert.equal(papelPermite("LEITOR", "leitura"), true);
  });
});

describe("nivelExigido", () => {
  it("consultas pedem leitura", () => {
    for (const rota of ["/", "/versoes", "/itens"]) {
      assert.equal(nivelExigido("GET", rota), "leitura", rota);
    }
  });

  it("o que altera o roteiro pede edição", () => {
    const casos: [string, string][] = [
      ["PUT", "/"],
      ["POST", "/itens"],
      ["PUT", "/itens/organizar"],
      ["POST", "/itens/reordenar"],
      ["PATCH", "/itens/5"],
      ["DELETE", "/itens/9"],
      ["POST", "/otimizar"],
      ["PATCH", "/anotacoes"],
      ["POST", "/checklist"],
      ["PATCH", "/checklist/3"],
      ["DELETE", "/checklist/3"],
      ["POST", "/versoes/2/restaurar"],
    ];

    for (const [metodo, rota] of casos) {
      assert.equal(nivelExigido(metodo, rota), "edicao", `${metodo} ${rota}`);
    }
  });

  it("excluir, compartilhar o link público e convidar pedem o dono", () => {
    assert.equal(nivelExigido("DELETE", "/"), "dono");
    assert.equal(nivelExigido("PATCH", "/compartilhar"), "dono");
    assert.equal(nivelExigido("POST", "/convites"), "dono");
    assert.equal(nivelExigido("DELETE", "/convites/4"), "dono");
    assert.equal(nivelExigido("GET", "/convites"), "dono");
  });

  it("a gestão de colaboradores é conferida na própria rota (qualquer participante pode sair)", () => {
    assert.equal(nivelExigido("DELETE", "/colaboradores/7"), "leitura");
    assert.equal(nivelExigido("PATCH", "/colaboradores/7"), "leitura");
  });

  it("ignora barra final", () => {
    assert.equal(nivelExigido("DELETE", "//"), "dono");
    assert.equal(nivelExigido("POST", "/itens/"), "edicao");
  });
});
