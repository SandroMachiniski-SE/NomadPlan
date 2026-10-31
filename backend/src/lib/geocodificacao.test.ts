import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cidadesDoNominatim } from "./geocodificacao";

const municipio = (nome: string, uf: string, extra: Record<string, unknown> = {}) => ({
  name: nome,
  lat: "-29.38",
  lon: "-50.87",
  category: "boundary",
  type: "administrative",
  addresstype: "town",
  address: { town: nome, "ISO3166-2-lvl4": `BR-${uf}`, country_code: "br" },
  ...extra,
});

describe("cidadesDoNominatim", () => {
  it("devolve nome, UF e centro dos municípios", () => {
    assert.deepEqual(cidadesDoNominatim([municipio("Gramado", "RS")]), [
      { cidade: "Gramado", uf: "RS", latitude: -29.38, longitude: -50.87 },
    ]);
  });

  it("ignora bairros, distritos, lugares fora do Brasil e resultados sem UF", () => {
    const resultados = [
      municipio("Gramado", "SP", { addresstype: "suburb" }),
      municipio("Gramado", "RS", { addresstype: "city_district" }),
      municipio("Gramado", "RS", { address: { town: "Gramado", country_code: "ar", "ISO3166-2-lvl4": "BR-RS" } }),
      municipio("Gramado", "RS", { address: { town: "Gramado", country_code: "br" } }),
      municipio("Gramado", "RS", { category: "place", type: "village" }),
      municipio("Sem Coordenada", "RS", { lat: "x" }),
    ];

    assert.deepEqual(cidadesDoNominatim(resultados), []);
  });

  it("não repete a mesma cidade, mas mantém cidades de mesmo nome em estados diferentes", () => {
    const lista = cidadesDoNominatim([
      municipio("Bom Jesus", "SC"),
      municipio("bom jesus", "SC"),
      municipio("Bom Jesus", "RS"),
    ]);

    assert.deepEqual(
      lista.map((c) => `${c.cidade}/${c.uf}`),
      ["Bom Jesus/SC", "Bom Jesus/RS"],
    );
  });
});
