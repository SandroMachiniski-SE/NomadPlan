import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { converterMunicipiosDoIbge, separarUf } from "./municipios";

describe("converterMunicipiosDoIbge", () => {
  it("troca o código da UF pela sigla e mantém o nome com acento", () => {
    const [m] = converterMunicipiosDoIbge(
      [{ codigo_ibge: 5300108, nome: "Brasília", latitude: -15.7795, longitude: -47.9297, codigo_uf: 53 }],
      [{ codigo_uf: 53, uf: "DF" }],
    );

    assert.deepEqual(m, { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.7795, longitude: -47.9297 });
  });

  it("descarta município de UF desconhecida", () => {
    const lista = converterMunicipiosDoIbge(
      [{ codigo_ibge: 9999999, nome: "Lugar Nenhum", latitude: 0, longitude: 0, codigo_uf: 99 }],
      [{ codigo_uf: 53, uf: "DF" }],
    );

    assert.deepEqual(lista, []);
  });
});

describe("separarUf", () => {
  for (const texto of ["Brasília, DF", "Brasília/DF", "Brasília - df", " Brasília ,DF "]) {
    it(`separa "${texto}"`, () => {
      assert.deepEqual(separarUf(texto), { nome: "Brasília", uf: "DF" });
    });
  }

  it("sem UF", () => {
    assert.deepEqual(separarUf("Joinville"), { nome: "Joinville", uf: null });
  });

  it("sigla que não é UF fica no nome", () => {
    assert.deepEqual(separarUf("Santa Cruz, XX"), { nome: "Santa Cruz, XX", uf: null });
  });
});
