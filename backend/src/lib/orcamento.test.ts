import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resumirOrcamento } from "./orcamento";

describe("resumirOrcamento", () => {
  it("soma por dia e no total, contando as paradas sem custo", () => {
    const r = resumirOrcamento(
      [
        { dia: 1, custoCentavos: 2500 },
        { dia: 1, custoCentavos: 1000 },
        { dia: 2, custoCentavos: 9000 },
        { dia: 2, custoCentavos: null },
      ],
      null,
    );

    assert.equal(r.totalCentavos, 12500);
    assert.deepEqual(r.porDia, { 1: 3500, 2: 9000 });
    assert.equal(r.paradasSemCusto, 1);
    assert.equal(r.restanteCentavos, null);
  });

  it("calcula quanto ainda cabe no teto e acusa quando estoura", () => {
    const itens = [{ dia: 1, custoCentavos: 8000 }];

    assert.equal(resumirOrcamento(itens, 10000).restanteCentavos, 2000);
    assert.equal(resumirOrcamento(itens, 5000).restanteCentavos, -3000);
  });

  it("custo zero conta como informado; roteiro vazio dá tudo zerado", () => {
    assert.equal(resumirOrcamento([{ dia: 1, custoCentavos: 0 }], null).paradasSemCusto, 0);

    const vazio = resumirOrcamento([], 1000);

    assert.equal(vazio.totalCentavos, 0);
    assert.deepEqual(vazio.porDia, {});
    assert.equal(vazio.restanteCentavos, 1000);
  });
});
