import "../ambiente";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { importarMunicipios, municipioMaisProximo, procurarMunicipio } from "../../lib/municipios";
import { criarCliente, criarMunicipio, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";
import { instalarMapasFalsos, municipioNominatim } from "../mapasFalsos";

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

describe("rotas de cidades com os municípios", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  after(async () => {
    await servidor.fechar();
  });

  it("a busca devolve o código IBGE do município", async () => {
    await criarMunicipio(JOINVILLE);
    mapas = instalarMapasFalsos({
      nominatim: () => ({ corpo: [municipioNominatim("Joinville", "SC", -26.3045, -48.8487)] }),
    });

    const r = await api("GET", "/cidades/buscar?q=Joinville");

    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados[0].codigoIbge, 4209102);
  });

  it("sem Nominatim, procura na tabela de municípios", async () => {
    await criarMunicipio({ codigoIbge: 3509502, cidade: "Campinas", uf: "SP", latitude: -22.9053, longitude: -47.0659 });
    mapas = instalarMapasFalsos({ nominatim: () => ({ status: 503, corpo: {} }) });

    const r = await api("GET", "/cidades/buscar?q=Campinas");

    assert.equal(r.status, 200);
    assert.equal(r.corpo.semServidorDeMapas, true);
    const campinas = r.corpo.dados.find((c: { cidade: string }) => c.cidade === "Campinas");
    assert.deepEqual(
      { codigoIbge: campinas.codigoIbge, uf: campinas.uf, latitude: campinas.latitude },
      { codigoIbge: 3509502, uf: "SP", latitude: -22.9053 },
    );
  });

  it("POST /cidades/perto devolve o município mais próximo", async () => {
    await criarMunicipio(JOINVILLE);
    await criarMunicipio(BRASILIA);

    const r = await api("POST", "/cidades/perto", { json: { latitude: -26.31, longitude: -48.84 } });

    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ...JOINVILLE });
  });

  it("POST /cidades/perto fora do Brasil responde 404", async () => {
    await criarMunicipio(JOINVILLE);

    const r = await api("POST", "/cidades/perto", { json: { latitude: 48.85, longitude: 2.35 } });

    assert.equal(r.status, 404);
    assert.equal(r.corpo.erro, "Não encontramos um município do Brasil perto de você.");
  });

  it("POST /cidades/perto valida as coordenadas", async () => {
    const r = await api("POST", "/cidades/perto", { json: { latitude: 120, longitude: -48 } });

    assert.equal(r.status, 400);
  });
});
