import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lerDestinos } from "./destinos";
import { lerMunicipios } from "./municipios";

describe("lista de destinos preparados de antemão", () => {
  const destinos = lerDestinos();
  const municipios = lerMunicipios();

  it("cada destino é um município do IBGE, sem repetir", () => {
    const naoAchados = destinos.filter((d) => !municipios.some((m) => m.cidade === d.cidade && m.uf === d.uf));
    const chaves = destinos.map((d) => `${d.cidade}/${d.uf}`);

    assert.deepEqual(naoAchados, []);
    assert.equal(new Set(chaves).size, chaves.length);
  });

  it("tem a capital de cada uma das 27 UFs e começa pelos destinos da apresentação", () => {
    const ufs = new Set(municipios.map((m) => m.uf));

    assert.equal(ufs.size, 27);
    assert.ok([...ufs].every((uf) => destinos.some((d) => d.uf === uf)));
    assert.deepEqual(
      destinos.slice(0, 3).map((d) => d.cidade),
      ["Brasília", "Goiânia", "Rio de Janeiro"],
    );
  });
});
