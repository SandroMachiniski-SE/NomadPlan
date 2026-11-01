import "../ambiente";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { buscarRota, ErroRota } from "../../lib/rotas";
import { criarMunicipio, limparBanco } from "../suporte";
import { instalarMapasFalsos, rotaOsrm } from "../mapasFalsos";

const JOINVILLE = { codigoIbge: 4209102, cidade: "Joinville", uf: "SC", latitude: -26.3, longitude: -48.85 };
const BRASILIA = { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.78, longitude: -47.93 };

// Traçado simples entre as duas cidades (três pontos), a 80 km/h.
const TRACADO: [number, number][] = [
  [-48.85, -26.3],
  [-48.4, -21],
  [-47.93, -15.78],
];

const DIA_MS = 24 * 60 * 60 * 1000;

describe("rotas de carro", () => {
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;

  beforeEach(async () => {
    await limparBanco();
    await criarMunicipio(JOINVILLE);
    await criarMunicipio(BRASILIA);
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  const chamadasAoOsrm = () => mapas!.chamadas.filter((c) => c.servico === "osrm");

  async function envelhecer(dias: number) {
    await prisma.$executeRaw`UPDATE rota_em_cache SET buscada_em = ${new Date(Date.now() - dias * DIA_MS)}`;
  }

  it("busca no OSRM uma vez e depois usa o cache", async () => {
    mapas = instalarMapasFalsos({ osrm: () => ({ corpo: rotaOsrm(TRACADO) }) });

    const primeira = await buscarRota(JOINVILLE, BRASILIA);
    const segunda = await buscarRota(JOINVILLE, BRASILIA);

    assert.equal(chamadasAoOsrm().length, 1);
    assert.equal(segunda.id, primeira.id);
    assert.equal(segunda.vencida, false);
    assert.equal(segunda.metros, primeira.metros);
    assert.deepEqual(segunda.perfil[0], [0, 0]);
    // O perfil soma as anotações; o total do OSRM vem arredondado para segundos inteiros.
    assert.ok(Math.abs(segunda.perfil[segunda.perfil.length - 1][1] - primeira.segundos) < 1);
  });

  it("rota com mais de 90 dias é buscada de novo", async () => {
    mapas = instalarMapasFalsos({ osrm: () => ({ corpo: rotaOsrm(TRACADO) }) });

    await buscarRota(JOINVILLE, BRASILIA);
    await envelhecer(91);
    await buscarRota(JOINVILLE, BRASILIA);

    assert.equal(chamadasAoOsrm().length, 2);
    assert.equal(await prisma.rotaEmCache.count(), 1);
  });

  it("OSRM fora do ar usa a rota vencida", async () => {
    mapas = instalarMapasFalsos({ osrm: () => ({ corpo: rotaOsrm(TRACADO) }) });
    await buscarRota(JOINVILLE, BRASILIA);
    await envelhecer(100);
    mapas.desinstalar();

    mapas = instalarMapasFalsos({ osrm: () => ({ status: 503, corpo: {} }) });
    const rota = await buscarRota(JOINVILLE, BRASILIA);

    assert.equal(rota.vencida, true);
    assert.ok(rota.metros > 1_000_000);
  });

  it("OSRM fora do ar sem cache dá ErroRota", async () => {
    mapas = instalarMapasFalsos({ osrm: () => ({ status: 503, corpo: {} }) });

    await assert.rejects(buscarRota(JOINVILLE, BRASILIA), ErroRota);
  });

  it("a URL leva lon,lat das duas cidades e pede as anotações", async () => {
    mapas = instalarMapasFalsos({ osrm: () => ({ corpo: rotaOsrm(TRACADO) }) });

    await buscarRota(JOINVILLE, BRASILIA);

    const [chamada] = chamadasAoOsrm();
    assert.ok(chamada.url.includes("/route/v1/driving/-48.85,-26.3;-47.93,-15.78"), chamada.url);
    assert.ok(chamada.url.includes("annotations=distance,duration"), chamada.url);
  });
});
