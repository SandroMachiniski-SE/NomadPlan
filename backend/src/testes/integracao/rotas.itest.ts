import "../ambiente";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { buscarRota, ErroRota, gravarRotaEmCache, lerRespostaOsrm } from "../../lib/rotas";
import { candidatosDaRota, tracadoEntre } from "../../lib/corredor";
import { resumirCidades, type ResumoOsm } from "../../lib/resumoOsm";
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

// Rota sintética no meridiano 48° O, da latitude −26 à −12,5 (~1.500 km), com um ponto a cada 0,5°.
const MERIDIANO: [number, number][] = Array.from({ length: 28 }, (_, i) => [-48, -26 + i * 0.5]);
const KM_POR_GRAU = 111.2;

/** Município sintético no km informado da rota, a `desvioKm` a leste da estrada. */
function noKm(codigoIbge: number, cidade: string, km: number, desvioKm: number) {
  const latitude = -26 + km / KM_POR_GRAU;
  const longitude = -48 + desvioKm / (111.32 * Math.cos((latitude * Math.PI) / 180));

  return { codigoIbge, cidade, uf: "GO", latitude, longitude };
}

describe("corredor", () => {
  let idRota: number;
  const ORIGEM = noKm(1000001, "Origem", 0, 0);
  const DESTINO = noKm(1000002, "Destino", 1501, 0);

  beforeEach(async () => {
    await limparBanco();
    await criarMunicipio(ORIGEM);
    await criarMunicipio(DESTINO);
    await criarMunicipio(noKm(1000010, "A", 500, 5));
    await criarMunicipio(noKm(1000011, "B", 1000, 15));
    await criarMunicipio(noKm(1000012, "C", 700, 30));
    idRota = await gravarRotaEmCache(ORIGEM.codigoIbge, DESTINO.codigoIbge, lerRespostaOsrm(rotaOsrm(MERIDIANO)));
  });

  it("pega só as cidades a até 20 km da estrada, com o km de cada uma", async () => {
    const lista = await candidatosDaRota(idRota, [ORIGEM.codigoIbge, DESTINO.codigoIbge]);

    assert.deepEqual(
      lista.map((c) => c.cidade),
      ["A", "B"],
    );
    assert.ok(Math.abs(lista[0].km - 500) < 3, `km de A: ${lista[0].km}`);
    assert.ok(Math.abs(lista[0].desvioKm - 5) < 0.5, `desvio de A: ${lista[0].desvioKm}`);
    assert.ok(Math.abs(lista[1].km - 1000) < 5, `km de B: ${lista[1].km}`);
    assert.ok(lista[0].fracao > 0.3 && lista[0].fracao < 0.37, `fração de A: ${lista[0].fracao}`);
  });

  it("deixa de fora as pontas da perna", async () => {
    const lista = await candidatosDaRota(idRota, [ORIGEM.codigoIbge, DESTINO.codigoIbge, 1000010]);

    assert.deepEqual(
      lista.map((c) => c.cidade),
      ["B"],
    );
  });

  it("tracadoEntre devolve [lat, lon] do pedaço e no máximo 400 pontos", async () => {
    const pedaco = await tracadoEntre(idRota, 0, 0.5);
    const [primeiro] = pedaco;
    const ultimo = pedaco[pedaco.length - 1];

    assert.ok(pedaco.length >= 2 && pedaco.length <= 400);
    assert.ok(Math.abs(primeiro[0] + 26) < 0.01 && Math.abs(primeiro[1] + 48) < 0.01, `primeiro ${primeiro}`);
    assert.ok(Math.abs(ultimo[0] + 19.25) < 0.05, `último ${ultimo}`);
  });
});

describe("resumos das cidades", () => {
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;
  const A = { codigoIbge: 1000020, cidade: "Cidade A", uf: "GO", latitude: -20, longitude: -48 };
  const B = { codigoIbge: 1000021, cidade: "Cidade B", uf: "GO", latitude: -18, longitude: -48 };
  const RESUMO_DE_A: ResumoOsm = { hospedagens: [], atracoes: [], totalHospedagens: 3, totalAtracoes: 1 };

  beforeEach(async () => {
    await limparBanco();
    await criarMunicipio(A);
    await criarMunicipio(B);
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  async function guardarResumoDeA(diasAtras: number) {
    await prisma.$executeRaw`
      UPDATE municipio SET resumo_osm = ${JSON.stringify(RESUMO_DE_A)}::jsonb, resumo_em = ${new Date(Date.now() - diasAtras * DIA_MS)}
      WHERE codigo_ibge = ${A.codigoIbge}
    `;
  }

  it("busca só as cidades sem resumo válido e grava resumo_osm e resumo_em", async () => {
    await guardarResumoDeA(10);
    mapas = instalarMapasFalsos({
      overpass: () => ({
        corpo: { elements: [{ type: "node", id: 5, lat: -18.01, lon: -48, tags: { name: "Hotel de B", tourism: "hotel" } }] },
      }),
    });

    const resumos = await resumirCidades([A.codigoIbge, B.codigoIbge]);

    const consulta = mapas.chamadas.find((c) => c.servico === "overpass")!.corpo!;
    assert.ok(consulta.includes("around:8000,-18,-48)"), consulta);
    assert.ok(!consulta.includes("around:8000,-20,-48)"), consulta);
    assert.equal(resumos.get(A.codigoIbge)!.totalHospedagens, 3);
    assert.equal(resumos.get(B.codigoIbge)!.totalHospedagens, 1);

    const gravado = await prisma.municipio.findUnique({ where: { codigoIbge: B.codigoIbge } });
    assert.equal((gravado!.resumoOsm as unknown as ResumoOsm).hospedagens[0].nome, "Hotel de B");
    assert.ok(gravado!.resumoEm);
  });

  it("resumo vencido e Overpass fora do ar: usa o vencido", async () => {
    await guardarResumoDeA(40);
    mapas = instalarMapasFalsos({ overpass: () => ({ status: 504, corpo: {} }) });

    const resumos = await resumirCidades([A.codigoIbge]);

    assert.equal(resumos.get(A.codigoIbge)!.totalHospedagens, 3);
  });

  it("sem resumo e Overpass fora do ar: devolve null", async () => {
    mapas = instalarMapasFalsos({ overpass: () => ({ status: 504, corpo: {} }) });

    const resumos = await resumirCidades([B.codigoIbge]);

    assert.equal(resumos.get(B.codigoIbge), null);
  });
});
