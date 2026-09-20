import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distanciaMetros } from "./geo";

describe("distanciaMetros (Haversine)", () => {
  it("é zero para o mesmo ponto", () => {
    assert.equal(distanciaMetros(-26.3045, -48.8487, -26.3045, -48.8487), 0);
  });

  it("é simétrica", () => {
    const ida = distanciaMetros(-26.3045, -48.8487, -27.5954, -48.548);
    const volta = distanciaMetros(-27.5954, -48.548, -26.3045, -48.8487);

    assert.ok(Math.abs(ida - volta) < 1e-6);
  });

  it("dá ~111 km para 1 grau de latitude", () => {
    const d = distanciaMetros(0, 0, 1, 0);

    assert.ok(Math.abs(d - 111_195) < 200, `distância: ${d}`);
  });

  it("estima Joinville → Florianópolis em torno de 150 km", () => {
    const d = distanciaMetros(-26.3045, -48.8487, -27.5954, -48.548) / 1000;

    assert.ok(d > 140 && d < 160, `distância: ${d} km`);
  });
});
