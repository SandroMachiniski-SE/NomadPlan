import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analisarCsv, linhasParaObjetos, objetosParaCsv } from "./csv";

describe("analisarCsv", () => {
  it("separa linhas e campos simples", () => {
    assert.deepEqual(analisarCsv("a,b,c\n1,2,3"), [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("aceita CRLF e ignora linhas em branco", () => {
    assert.deepEqual(analisarCsv("a,b\r\n\r\n1,2\r\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("mantém vírgulas, quebras de linha e aspas escapadas dentro de aspas", () => {
    const linhas = analisarCsv('nome,descricao\n"Café, Bar","Ele disse ""oi""\nna porta"');

    assert.deepEqual(linhas[1], ["Café, Bar", 'Ele disse "oi"\nna porta']);
  });
});

describe("linhasParaObjetos", () => {
  it("usa o cabeçalho como chaves e completa colunas faltantes", () => {
    const objetos = linhasParaObjetos([
      ["nome", "cidade"],
      [" Mirante ", "Joinville"],
      ["Museu"],
    ]);

    assert.deepEqual(objetos, [
      { nome: "Mirante", cidade: "Joinville" },
      { nome: "Museu", cidade: "" },
    ]);
  });

  it("devolve lista vazia sem linhas", () => {
    assert.deepEqual(linhasParaObjetos([]), []);
  });
});

describe("objetosParaCsv", () => {
  it("escapa vírgulas, aspas e quebras de linha e trata nulos", () => {
    const csv = objetosParaCsv(
      ["nome", "obs"],
      [
        { nome: "Café, Bar", obs: 'Disse "oi"' },
        { nome: "Museu", obs: null },
      ],
    );

    assert.equal(csv, 'nome,obs\n"Café, Bar","Disse ""oi"""\nMuseu,');
  });

  it("faz ida e volta sem perder dados", () => {
    const original = [{ nome: 'A "b", c', cidade: "Joinville" }];
    const volta = linhasParaObjetos(analisarCsv(objetosParaCsv(["nome", "cidade"], original)));

    assert.deepEqual(volta, original);
  });
});
