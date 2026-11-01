import "../ambiente";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { importarMunicipios, municipioMaisProximo, procurarMunicipio } from "../../lib/municipios";
import { criarMunicipio, limparBanco } from "../suporte";

const JOINVILLE = { codigoIbge: 4209102, cidade: "Joinville", uf: "SC", latitude: -26.3045, longitude: -48.8487 };
const BRASILIA = { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.7795, longitude: -47.9297 };

describe("municípios do IBGE", () => {
  beforeEach(async () => {
    await limparBanco();
  });

  it("importa de novo sem duplicar e atualiza o nome", async () => {
    await importarMunicipios([JOINVILLE, BRASILIA]);
    await importarMunicipios([{ ...JOINVILLE, cidade: "Joinville (nova)" }, BRASILIA]);

    assert.equal(await prisma.municipio.count(), 2);
    assert.equal((await prisma.municipio.findUnique({ where: { codigoIbge: 4209102 } }))?.nome, "Joinville (nova)");
  });

  it("procura pelo nome sem acento e com UF", async () => {
    await criarMunicipio(BRASILIA);

    assert.equal((await procurarMunicipio("brasilia/df"))[0].codigoIbge, 5300108);
    assert.equal((await procurarMunicipio("Brasilia")).length, 1);
    assert.equal((await procurarMunicipio("Brasília, GO")).length, 0);
  });

  it("homônimos de UFs diferentes voltam os dois sem UF e um com UF", async () => {
    await criarMunicipio({ codigoIbge: 4302402, cidade: "Bom Jesus", uf: "RS", latitude: -28.6697, longitude: -50.4295 });
    await criarMunicipio({ codigoIbge: 2201903, cidade: "Bom Jesus", uf: "PI", latitude: -9.0712, longitude: -44.3586 });

    assert.equal((await procurarMunicipio("Bom Jesus")).length, 2);
    assert.deepEqual(
      (await procurarMunicipio("Bom Jesus - RS")).map((m) => m.codigoIbge),
      [4302402],
    );
  });

  it("nome terminado em palavra de duas letras não perde o fim", async () => {
    await criarMunicipio({ codigoIbge: 4123709, cidade: "Santa Fé", uf: "PR", latitude: -23.04, longitude: -51.8 });
    await criarMunicipio({ codigoIbge: 4123501, cidade: "Santa Helena", uf: "PR", latitude: -24.86, longitude: -54.33 });
    await criarMunicipio({ codigoIbge: 2207793, cidade: "Pedro II", uf: "PI", latitude: -4.42, longitude: -41.46 });

    assert.deepEqual((await procurarMunicipio("Santa Fe")).map((m) => m.cidade), ["Santa Fé"]);
    assert.deepEqual((await procurarMunicipio("Pedro II")).map((m) => m.cidade), ["Pedro II"]);
    assert.equal((await procurarMunicipio("Santa")).length, 0);
  });

  it("acha a sede mais próxima de uma coordenada", async () => {
    await criarMunicipio(JOINVILLE);
    await criarMunicipio(BRASILIA);

    // ~3 km ao sul da sede de Joinville.
    const perto = await municipioMaisProximo(-26.3315, -48.8487);

    assert.equal(perto?.codigoIbge, 4209102);
    assert.ok(perto!.distanciaKm > 2 && perto!.distanciaKm < 4, `distância ${perto?.distanciaKm}`);
  });
});
