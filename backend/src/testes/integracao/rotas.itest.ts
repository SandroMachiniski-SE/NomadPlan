import "../ambiente";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { buscarRota, ErroRota, gravarRotaEmCache, lerRespostaOsrm } from "../../lib/rotas";
import { candidatosDaRota, tracadoEntre } from "../../lib/corredor";
import { aquecerResumos, resumirCidades, type ResumoOsm } from "../../lib/resumoOsm";
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
    await criarMunicipio({ ...noKm(1000010, "A", 500, 5), populacao: 20_000 });
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
    // A população do IBGE vem junto: é o porte da cidade quando os hotéis ainda não foram contados.
    assert.equal(lista[0].populacao, 20_000);
    assert.equal(lista[1].populacao, null);
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
    assert.ok(consulta.includes("(-18.0719,-48.0756,-17.9281,-47.9244)"), consulta);
    assert.ok(!consulta.includes("(-20.0719,"), consulta);
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

  it("o preparo antes da banca pode esperar mais pelo Overpass", async () => {
    mapas = instalarMapasFalsos({ overpass: () => ({ corpo: { elements: [] } }) });

    await resumirCidades([B.codigoIbge], new Date(), 175_000);

    const consulta = mapas.chamadas.find((c) => c.servico === "overpass")!.corpo!;
    assert.ok(consulta.startsWith("[out:json][timeout:170];"), consulta);
  });

  it("Overpass que estoura o próprio tempo (remark) não vira zero no cache: usa o vencido", async () => {
    await guardarResumoDeA(40);
    mapas = instalarMapasFalsos({
      overpass: () => ({ corpo: { elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 26 seconds.' } }),
    });

    const resumos = await resumirCidades([A.codigoIbge, B.codigoIbge]);

    assert.equal(resumos.get(A.codigoIbge)!.totalHospedagens, 3);
    assert.equal(resumos.get(B.codigoIbge), null);
    const b = await prisma.municipio.findUnique({ where: { codigoIbge: B.codigoIbge } });
    assert.equal(b?.resumoEm, null, "nada foi gravado para B");
  });

  it("Overpass lento: responde no tempo de espera e grava o resumo quando a consulta termina", async () => {
    mapas = instalarMapasFalsos({
      overpass: () => ({
        atrasoMs: 1200,
        corpo: { elements: [{ type: "node", id: 7, lat: -18.01, lon: -48, tags: { name: "Hotel Lento", tourism: "hotel" } }] },
      }),
    });

    const inicio = Date.now();
    const agora = new Date();
    const primeira = await resumirCidades([B.codigoIbge], agora, 200);

    assert.ok(Date.now() - inicio < 1000, `esperou ${Date.now() - inicio} ms`);
    assert.equal(primeira.get(B.codigoIbge), null);

    // A consulta seguiu em segundo plano: o resumo chega ao banco e a próxima geração já o usa.
    let gravado = null;
    for (let i = 0; i < 40 && !gravado; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      gravado = (await prisma.municipio.findUnique({ where: { codigoIbge: B.codigoIbge } }))?.resumoOsm ?? null;
    }
    assert.ok(gravado, "o resumo não foi gravado");

    const segunda = await resumirCidades([B.codigoIbge], agora, 200);
    assert.equal(segunda.get(B.codigoIbge)!.hospedagens[0].nome, "Hotel Lento");
    assert.equal(mapas.chamadas.filter((c) => c.servico === "overpass").length, 1);
  });

  it("depois de uma falha, a mesma cidade não volta a esperar o Overpass por alguns minutos", async () => {
    mapas = instalarMapasFalsos({ overpass: () => ({ status: 504, corpo: {} }) });

    await resumirCidades([B.codigoIbge]);
    const inicio = Date.now();
    const segunda = await resumirCidades([B.codigoIbge]);

    assert.equal(segunda.get(B.codigoIbge), null);
    assert.ok(Date.now() - inicio < 500, `esperou ${Date.now() - inicio} ms`);
    assert.equal(mapas.chamadas.filter((c) => c.servico === "overpass").length, 1);
  });

  it("duas gerações ao mesmo tempo para a mesma cidade fazem uma consulta só", async () => {
    mapas = instalarMapasFalsos({
      overpass: () => ({
        atrasoMs: 300,
        corpo: { elements: [{ type: "node", id: 8, lat: -18.01, lon: -48, tags: { name: "Hotel Único", tourism: "hotel" } }] },
      }),
    });

    const [uma, outra] = await Promise.all([resumirCidades([B.codigoIbge]), resumirCidades([B.codigoIbge])]);

    assert.equal(uma.get(B.codigoIbge)!.totalHospedagens, 1);
    assert.equal(outra.get(B.codigoIbge)!.totalHospedagens, 1);
    assert.equal(mapas.chamadas.filter((c) => c.servico === "overpass").length, 1);
  });

  it("camping conta como hospedagem no resumo da cidade de pernoite", async () => {
    mapas = instalarMapasFalsos({
      overpass: () => ({
        corpo: { elements: [{ type: "node", id: 11, lat: -18.01, lon: -48, tags: { name: "Camping do Rio", tourism: "camp_site" } }] },
      }),
    });

    const resumos = await resumirCidades([B.codigoIbge]);

    const consulta = mapas.chamadas.find((c) => c.servico === "overpass")!.corpo!;
    assert.match(consulta, /camp_site/);
    assert.equal(resumos.get(B.codigoIbge)!.totalHospedagens, 1);
    assert.deepEqual(
      resumos.get(B.codigoIbge)!.hospedagens.map((h) => [h.nome, h.tipo]),
      [["Camping do Rio", "camp_site"]],
    );
  });

  it("sem resumo e Overpass fora do ar: devolve null", async () => {
    mapas = instalarMapasFalsos({ overpass: () => ({ status: 504, corpo: {} }) });

    const resumos = await resumirCidades([B.codigoIbge]);

    assert.equal(resumos.get(B.codigoIbge), null);
  });
});

describe("aquecer os resumos de uma região (de madrugada)", () => {
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;
  const PEQUENA = { codigoIbge: 4200001, cidade: "Pequena", uf: "SC", latitude: -27, longitude: -49, populacao: 4_000 };
  const GRANDE = { codigoIbge: 4200002, cidade: "Grande", uf: "SC", latitude: -27.5, longitude: -49.5, populacao: 120_000 };
  const CARIOCA = { codigoIbge: 3300001, cidade: "Carioca", uf: "RJ", latitude: -22.9, longitude: -43.2, populacao: 500_000 };
  const hotelPerto = (m: { latitude: number; longitude: number }, id: number) => ({
    type: "node",
    id,
    lat: m.latitude + 0.01,
    lon: m.longitude,
    tags: { name: `Hotel ${id}`, tourism: "hotel" },
  });

  beforeEach(async () => {
    await limparBanco();
    await criarMunicipio(PEQUENA);
    await criarMunicipio(GRANDE);
    await criarMunicipio(CARIOCA);
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  it("busca só as UFs pedidas, as maiores primeiro, em lotes, e pula quem já tem resumo", async () => {
    mapas = instalarMapasFalsos({
      overpass: (consulta) => ({
        corpo: { elements: consulta.includes("-27.5") ? [hotelPerto(GRANDE, 1)] : [hotelPerto(PEQUENA, 2)] },
      }),
    });

    const primeira = await aquecerResumos(["SC"], { lote: 1 });
    const segunda = await aquecerResumos(["SC"], { lote: 1 });

    const consultas = mapas.chamadas.filter((c) => c.servico === "overpass").map((c) => c.corpo!);
    assert.equal(consultas.length, 2, "a segunda passada não consulta de novo");
    assert.ok(consultas[0].includes("-27.5"), "a cidade maior vem primeiro");
    assert.deepEqual(primeira, { cidades: 2, comResumo: 2, falhas: 0 });
    assert.deepEqual(segunda, { cidades: 0, comResumo: 0, falhas: 0 });
    const carioca = await prisma.municipio.findUnique({ where: { codigoIbge: CARIOCA.codigoIbge } });
    assert.equal(carioca?.resumoEm, null, "RJ não foi pedida");
  });

  it("lote que falha é tentado de novo depois da pausa", async () => {
    let tentativas = 0;
    mapas = instalarMapasFalsos({
      overpass: () => {
        tentativas += 1;
        return tentativas === 1 ? { status: 429, corpo: {} } : { corpo: { elements: [hotelPerto(GRANDE, 3)] } };
      },
    });

    const resultado = await aquecerResumos(["SC"], { lote: 2, pausaDepoisDeFalhaMs: 10 });

    assert.deepEqual(resultado, { cidades: 2, comResumo: 2, falhas: 0 });
    assert.equal(tentativas, 2);
  });
});
