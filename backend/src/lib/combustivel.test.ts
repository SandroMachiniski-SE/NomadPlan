import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimarCombustivel } from "./combustivel";

describe("estimarCombustivel", () => {
  it("502 km a 12 km/l e R$ 6,29: 41,8 l e R$ 262,92", () => {
    assert.deepEqual(estimarCombustivel(502, 12, 629), { litros: 41.8, custoCentavos: 26292 });
  });

  it("sem consumo ou sem preço: null", () => {
    assert.equal(estimarCombustivel(502, null, 629), null);
    assert.equal(estimarCombustivel(502, 12, null), null);
  });

  it("trecho de zero km não gasta nada", () => {
    assert.deepEqual(estimarCombustivel(0, 12, 629), { litros: 0, custoCentavos: 0 });
  });
});
