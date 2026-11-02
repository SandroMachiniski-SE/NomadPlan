import "../ambiente";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import type { Municipio } from "../../lib/municipios";
import { criarCliente, criarMunicipio, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";
import { instalarMapasFalsos, rotaOsrm } from "../mapasFalsos";

// Segunda-feira 9h (local) fixa.
const INICIO = new Date(2026, 9, 26, 9, 0, 0).toISOString();
const KM_POR_GRAU = 111.2;

const JOINVILLE: Municipio = { codigoIbge: 4209102, cidade: "Joinville", uf: "SC", latitude: -26.3045, longitude: -48.8487 };
const BRASILIA: Municipio = { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.7795, longitude: -47.9297 };

/** Município sintético no km informado de uma estrada reta no meridiano 48° O que começa na lat −26. */
function noKm(codigoIbge: number, cidade: string, km: number, desvioKm = 2): Municipio {
  const latitude = -26 + km / KM_POR_GRAU;

  return { codigoIbge, cidade, uf: "GO", latitude, longitude: -48 + desvioKm / (111.32 * Math.cos((latitude * Math.PI) / 180)) };
}

/** Resposta do OSRM para uma estrada reta de `totalKm`, com um ponto a cada ~50 km, a 80 km/h. */
function estradaReta(totalKm: number) {
  const pontos = Math.ceil(totalKm / 50);
  const coordenadas = Array.from({ length: pontos + 1 }, (_, i): [number, number] => [-48, -26 + (totalKm * (i / pontos)) / KM_POR_GRAU]);

  return rotaOsrm(coordenadas);
}

describe("viagem de carro no gerador de roteiro", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;
  // Hotéis e atrações por cidade candidata, devolvidos pelo Overpass falso.
  let ofertas: { municipio: Municipio; hoteis: number; atracoes: number }[] = [];
  // Estrada de cada destino, achado pelas coordenadas na URL do OSRM.
  let estradas: { destino: Municipio; responder: () => { status?: number; corpo: unknown } }[] = [];

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    ofertas = [];
    estradas = [];
    mapas = instalarMapasFalsos({
      osrm: (url) => {
        // O banco devolve as coordenadas com 15 dígitos: compara com tolerância.
        const [lon, lat] = (/;(-?[\d.]+),(-?[\d.]+)\?/.exec(url) ?? []).slice(1).map(Number);
        const estrada = estradas.find(({ destino }) => Math.abs(destino.longitude - lon) < 1e-9 && Math.abs(destino.latitude - lat) < 1e-9);
        return estrada?.responder() ?? { status: 500, corpo: {} };
      },
      overpass: () => ({
        corpo: {
          elements: ofertas.flatMap(({ municipio, hoteis, atracoes }, i) => [
            ...Array.from({ length: hoteis }, (_, j) => ({
              type: "node",
              id: (i + 1) * 1000 + j,
              lat: municipio.latitude + 0.001,
              lon: municipio.longitude,
              tags: { name: `Hotel ${municipio.cidade} ${j + 1}`, tourism: "hotel" },
            })),
            ...Array.from({ length: atracoes }, (_, j) => ({
              type: "node",
              id: (i + 1) * 1000 + 500 + j,
              lat: municipio.latitude - 0.001,
              lon: municipio.longitude,
              tags: { name: `Museu ${municipio.cidade} ${j + 1}`, tourism: "museum" },
            })),
          ]),
        },
      }),
    });
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  after(async () => {
    await servidor.fechar();
  });

  // A última estrada combinada para um destino vale (find acha a primeira da lista).
  const naEstrada = (destino: Municipio, responder: () => { status?: number; corpo: unknown }) =>
    estradas.unshift({ destino, responder });

  async function comCasa(municipio: Municipio | null) {
    const pessoa = await criarUsuario();

    if (municipio) {
      await prisma.usuario.update({ where: { id: pessoa.usuario.id }, data: { codigoMunicipioBase: municipio.codigoIbge } });
    }

    return pessoa;
  }

  async function prepararBrasilia() {
    await criarMunicipio(JOINVILLE);
    await criarMunicipio(BRASILIA);

    for (let i = 0; i < 12; i += 1) {
      await criarPonto({ nome: `Brasília ${i}`, cidade: "Brasília", latitude: -15.78 - i * 0.002, longitude: -47.93 });
    }

    const a = await criarMunicipio(noKm(1000010, "Cidade A", 498));
    const a2 = await criarMunicipio(noKm(1000011, "Cidade A2", 520));
    const b = await criarMunicipio(noKm(1000012, "Cidade B", 1001));
    ofertas = [
      { municipio: a, hoteis: 6, atracoes: 3 },
      { municipio: a2, hoteis: 2, atracoes: 0 },
      { municipio: b, hoteis: 5, atracoes: 2 },
    ];
    naEstrada(BRASILIA, () => ({ corpo: estradaReta(1501) }));
  }

  const gerar = (token: string, json: Record<string, unknown>) =>
    api("POST", "/roteiros/gerar", { token, json: { horasDisponiveis: 6, dataHoraInicio: INICIO, ...json } });

  it("Joinville → Brasília 4 dias, alvo 500: 2 noites, dia 3 de estrada e Brasília do dia 4 ao 7", async () => {
    await prepararBrasilia();
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 4 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const [ida] = r.corpo.viagemDeCarro.pernas;
    assert.deepEqual(
      ida.trechos.map((t: { dia: number; noite: number | null; ocupaODia: boolean }) => [t.dia, t.noite, t.ocupaODia]),
      [
        [1, 1, true],
        [2, 2, true],
        [3, null, true],
      ],
    );
    assert.deepEqual(
      ida.trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Cidade A", "Cidade B", null],
    );
    assert.equal(ida.trechos[0].pernoite.totalHospedagens, 6);
    assert.ok(ida.trechos[0].alternativas.length >= 1 && ida.trechos[0].alternativas.length <= 3);
    assert.equal(ida.trechos[0].de, "Joinville/SC");
    assert.equal(ida.trechos[2].para, "Brasília/DF");
    assert.ok(ida.trechos[0].tracado.length >= 2);
    assert.deepEqual(
      r.corpo.dias.map((d: { dia: number }) => d.dia),
      [4, 5, 6, 7],
    );
    assert.ok(r.corpo.pontos.every((p: { dia: number }) => p.dia >= 4));
    assert.equal(r.corpo.viagemDeCarro.origem.codigoIbge, 4209102);
  });

  it("sem casa e sem origem dá 400 'Informe de onde você sai.'", async () => {
    await prepararBrasilia();
    const { token } = await comCasa(null);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 2 }], viagemDeCarro: {} });

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Informe de onde você sai.");

    const comOrigem = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 2 }], viagemDeCarro: { origem: 4209102 } });
    assert.equal(comOrigem.status, 200);
  });

  it("casa igual à 1ª cidade: nenhum dia de estrada e nenhuma chamada ao OSRM", async () => {
    await criarMunicipio(JOINVILLE);
    await criarPonto({ nome: "Museu de Joinville", cidade: "Joinville" });
    await criarPonto({ nome: "Parque de Joinville", cidade: "Joinville", latitude: -26.31 });
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Joinville", dias: 2 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo.viagemDeCarro.pernas, []);
    assert.equal(mapas!.chamadas.filter((c) => c.servico === "osrm").length, 0);
    assert.deepEqual(
      r.corpo.dias.map((d: { dia: number }) => d.dia),
      [1, 2],
    );
  });

  it("etapa ambígua sem UF dá 400 'Informe a UF de Bom Jesus.'", async () => {
    await criarMunicipio(JOINVILLE);
    await criarMunicipio({ codigoIbge: 4302402, cidade: "Bom Jesus", uf: "RS", latitude: -28.67, longitude: -50.43 });
    await criarMunicipio({ codigoIbge: 2201903, cidade: "Bom Jesus", uf: "PI", latitude: -9.07, longitude: -44.36 });
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Bom Jesus", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Informe a UF de Bom Jesus.");
  });

  it("etapa sem município dá 400 'Não encontrei o município Cidade Inexistente.'", async () => {
    await criarMunicipio(JOINVILLE);
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Cidade Inexistente", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Não encontrei o município Cidade Inexistente.");
  });

  it("a escolha da noite 1 troca a cidade e a decisão esticar=false acrescenta uma noite", async () => {
    await criarMunicipio(JOINVILLE);
    const destino = await criarMunicipio(noKm(1000020, "Destino", 1120, 0));
    await criarPonto({ nome: "Atração do Destino", cidade: "Destino", latitude: destino.latitude, longitude: destino.longitude });
    const c500 = await criarMunicipio(noKm(1000021, "Km 500", 500));
    const c470 = await criarMunicipio(noKm(1000022, "Km 470", 470));
    const c1000 = await criarMunicipio(noKm(1000023, "Km 1000", 1000));
    ofertas = [
      { municipio: c500, hoteis: 8, atracoes: 2 },
      { municipio: c470, hoteis: 3, atracoes: 0 },
      { municipio: c1000, hoteis: 4, atracoes: 1 },
    ];
    naEstrada(destino, () => ({ corpo: estradaReta(1120) }));
    const { token } = await comCasa(JOINVILLE);
    const etapas = [{ cidade: "Destino/GO", dias: 1 }];

    const padrao = (await gerar(token, { etapas, viagemDeCarro: {} })).corpo.viagemDeCarro.pernas[0];
    assert.deepEqual(
      padrao.trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Km 500", null],
    );
    assert.equal(padrao.decisao.esticar, true);
    assert.ok(Math.abs(padrao.decisao.metrosEsticando - 620_000) < 2000, `${padrao.decisao.metrosEsticando}`);

    const trocada = (
      await gerar(token, {
        etapas,
        viagemDeCarro: { escolhas: [{ perna: 0, noite: 1, codigoIbge: c470.codigoIbge }], decisoes: [{ perna: 0, esticar: false }] },
      })
    ).corpo.viagemDeCarro.pernas[0];
    assert.deepEqual(
      trocada.trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Km 470", "Km 1000", null],
    );
    assert.equal(trocada.decisao.esticar, false);
  });

  it("kmPorDia, horasPorDia, consumo e preço fora da faixa dão 400", async () => {
    await criarMunicipio(JOINVILLE);
    const { token } = await comCasa(JOINVILLE);
    const etapas = [{ cidade: "Joinville", dias: 1 }];

    for (const viagemDeCarro of [
      { kmPorDia: 1001 },
      { kmPorDia: 149 },
      { horasPorDia: 1 },
      { horasPorDia: 15 },
      { consumoKmPorLitro: 2 },
      { consumoKmPorLitro: 41 },
      { precoLitroCentavos: 99 },
      { precoLitroCentavos: 2001 },
    ]) {
      assert.equal((await gerar(token, { etapas, viagemDeCarro })).status, 400, JSON.stringify(viagemDeCarro));
    }
  });

  it("viagem curta sem nenhuma noite traz o aviso 'Nenhuma perna passa de um dia de estrada.'", async () => {
    await criarMunicipio(JOINVILLE);
    const perto = await criarMunicipio(noKm(1000030, "Cidade Perto", 180, 0));
    await criarPonto({ nome: "Praia Perto", cidade: "Cidade Perto", latitude: perto.latitude, longitude: perto.longitude });
    naEstrada(perto, () => ({ corpo: estradaReta(180) }));
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Cidade Perto/GO", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const [ida] = r.corpo.viagemDeCarro.pernas;
    assert.deepEqual(
      ida.trechos.map((t: { dia: number; ocupaODia: boolean }) => [t.dia, t.ocupaODia]),
      [[1, false]],
    );
    assert.ok(r.corpo.viagemDeCarro.avisos.includes("Nenhuma perna passa de um dia de estrada."));
    assert.equal(r.corpo.dias[0].viagem.de, "Joinville/SC");
    assert.equal(r.corpo.dias[0].viagem.minutos, Math.round(ida.segundos / 60));
  });

  it("mais de 21 dias dá 400 com a explicação", async () => {
    await criarMunicipio(JOINVILLE);
    const longe = await criarMunicipio(noKm(1000040, "Muito Longe", 3000, 0));
    naEstrada(longe, () => ({ corpo: estradaReta(3000) }));
    const { token } = await comCasa(JOINVILLE);

    // 19 noites de estrada (de 150 em 150 km) + a chegada descontada do 1º dia + 3 dias na cidade = 22.
    const r = await gerar(token, { etapas: [{ cidade: "Muito Longe/GO", dias: 3 }], viagemDeCarro: { kmPorDia: 150 } });

    assert.equal(r.status, 400);
    assert.equal(
      r.corpo.erro,
      "Com 150 km por dia a viagem passa de 21 dias; aumente os km por dia ou diminua os dias nas cidades.",
    );
  });

  it("sem estrada dá 422 com as duas cidades", async () => {
    await criarMunicipio(JOINVILLE);
    const noronha = await criarMunicipio({ codigoIbge: 2605459, cidade: "Fernando de Noronha", uf: "PE", latitude: -3.84, longitude: -32.41 });
    naEstrada(noronha, () => ({ status: 400, corpo: { code: "NoRoute" } }));
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Fernando de Noronha", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 422);
    assert.equal(r.corpo.erro, "Não há estrada entre Joinville/SC e Fernando de Noronha/PE.");
  });

  it("OSRM fora do ar sem cache dá 503", async () => {
    await prepararBrasilia();
    naEstrada(BRASILIA, () => ({ status: 503, corpo: {} }));
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 503);
    assert.equal(r.corpo.erro, "Não consegui calcular a rota agora; tente de novo em alguns minutos.");
  });

  it("sem viagemDeCarro a resposta é a de hoje, com viagemDeCarro null", async () => {
    await criarPonto({ nome: "Museu de Joinville", cidade: "Joinville" });
    const { token } = await comCasa(null);

    const r = await gerar(token, { cidade: "Joinville" });

    assert.equal(r.status, 200);
    assert.equal(r.corpo.viagemDeCarro, null);
    assert.ok(r.corpo.pontos.length > 0);
  });
});
