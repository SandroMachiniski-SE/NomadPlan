import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analisarCsv, linhasParaObjetos, neutralizarFormula, objetosParaCsv } from "./csv";

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

describe("neutralizarFormula", () => {
  it("prefixa com apóstrofo o texto que uma planilha executaria como fórmula", () => {
    assert.equal(neutralizarFormula('=HYPERLINK("http://x","clique")'), `'=HYPERLINK("http://x","clique")`);
    assert.equal(neutralizarFormula("@SUM(A1:A2)"), "'@SUM(A1:A2)");
    assert.equal(neutralizarFormula("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.equal(neutralizarFormula("-2+3+cmd"), "'-2+3+cmd");
  });

  it("não mexe em texto comum, telefones e números", () => {
    assert.equal(neutralizarFormula("Museu Nacional"), "Museu Nacional");
    assert.equal(neutralizarFormula("+55 (47) 3433-0000"), "+55 (47) 3433-0000");
    assert.equal(neutralizarFormula("-26.3045"), "-26.3045");
  });

  it("vale na exportação, só para texto", () => {
    const csv = objetosParaCsv(["nome", "latitude"], [{ nome: "=1+1", latitude: -26.3 }]);

    assert.equal(csv, ["nome,latitude", "'=1+1,-26.3"].join("\n"));
  });
});
