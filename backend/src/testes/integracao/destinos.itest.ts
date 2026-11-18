import "../ambiente";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { pontosDaCidade } from "../../lib/cidadesSobDemanda";
import { prepararDestinos } from "../../lib/destinos";
import { criarMunicipio, criarPonto, limparBanco } from "../suporte";
import { instalarMapasFalsos } from "../mapasFalsos";

const PRONTO = { codigoIbge: 5200101, cidade: "Destino Pronto", uf: "GO", latitude: -16.5, longitude: -49.5 };
const NOVO = { codigoIbge: 5200102, cidade: "Destino Novo", uf: "GO", latitude: -17.5, longitude: -50.5 };

/** Museus do OpenStreetMap em volta do destino novo, como o Overpass devolveria. */
const museusDoNovo = (quantos: number) =>
  Array.from({ length: quantos }, (_, i) => ({
    type: "node",
    id: 9000 + i,
    lat: NOVO.latitude + i * 0.001,
    lon: NOVO.longitude,
    tags: { name: `Museu Novo ${i + 1}`, tourism: "museum" },
  }));

describe("preparar os destinos de antemão", () => {
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;

  beforeEach(async () => {
    await limparBanco();
    await criarMunicipio(PRONTO);
    await criarMunicipio(NOVO);
    for (let i = 0; i < 3; i += 1) {
      await criarPonto({ nome: `Lugar pronto ${i}`, cidade: PRONTO.cidade, latitude: PRONTO.latitude, longitude: PRONTO.longitude + i * 0.001 });
    }
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  it("prepara um de cada vez os que não têm lugares, pula os que têm e não quebra com cidade inexistente", async () => {
    mapas = instalarMapasFalsos({ overpass: () => ({ corpo: { elements: museusDoNovo(4) } }) });

    const resultado = await prepararDestinos(
      [
        { cidade: PRONTO.cidade, uf: "GO" },
        { cidade: NOVO.cidade, uf: "GO" },
        { cidade: "Cidade Inexistente", uf: "GO" },
      ],
      { minimoDePontos: 3, pausaEntreCidadesMs: 0 },
    );

    assert.deepEqual(resultado, { preparados: 1, pulados: 1, falhas: ["Cidade Inexistente/GO"] });
    assert.equal(await pontosDaCidade(NOVO.cidade, NOVO.latitude, NOVO.longitude), 4);
  });

  it("destino que falha (servidor ocupado) é tentado de novo depois da pausa", async () => {
    let chamadas = 0;
    mapas = instalarMapasFalsos({
      overpass: () => {
        chamadas += 1;
        return chamadas === 1 ? { status: 504, corpo: {} } : { corpo: { elements: museusDoNovo(2) } };
      },
    });

    const resultado = await prepararDestinos([{ cidade: NOVO.cidade, uf: "GO" }], {
      pausaDepoisDeFalhaMs: 10,
      pausaEntreCidadesMs: 0,
    });

    assert.deepEqual(resultado, { preparados: 1, pulados: 0, falhas: [] });
    assert.equal(await pontosDaCidade(NOVO.cidade, NOVO.latitude, NOVO.longitude), 2);
  });

  it("depois de 3 falhas segue para o próximo e conta a falha", async () => {
    mapas = instalarMapasFalsos({ overpass: () => ({ status: 429, corpo: {} }) });

    const resultado = await prepararDestinos([{ cidade: NOVO.cidade, uf: "GO" }], {
      pausaDepoisDeFalhaMs: 1,
      pausaEntreCidadesMs: 0,
    });

    assert.deepEqual(resultado, { preparados: 0, pulados: 0, falhas: ["Destino Novo/GO"] });
    assert.equal(mapas.chamadas.filter((c) => c.servico === "overpass").length, 3);
  });
});
