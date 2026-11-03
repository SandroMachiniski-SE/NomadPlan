import type { Municipio } from "../lib/municipios";
import { criarMunicipio, criarPonto } from "./suporte";
import { instalarMapasFalsos, rotaOsrm, type RespostaDeMapa } from "./mapasFalsos";

// Viagem de carro de mentira para os testes de integração: estradas retas no meridiano 48° O
// (começando na latitude −26), municípios sintéticos ao longo delas e um Overpass que devolve
// hotéis e atrações perto das cidades combinadas.

const KM_POR_GRAU = 111.2;

export const JOINVILLE: Municipio = { codigoIbge: 4209102, cidade: "Joinville", uf: "SC", latitude: -26.3045, longitude: -48.8487 };
export const BRASILIA: Municipio = { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.7795, longitude: -47.9297 };

/** Município sintético no km informado da estrada, a `desvioKm` a leste dela. */
export function noKm(codigoIbge: number, cidade: string, km: number, desvioKm = 2): Municipio {
  const latitude = -26 + km / KM_POR_GRAU;

  return { codigoIbge, cidade, uf: "GO", latitude, longitude: -48 + desvioKm / (111.32 * Math.cos((latitude * Math.PI) / 180)) };
}

/** Resposta do OSRM para uma estrada reta de `totalKm`, com um ponto a cada ~50 km, a 80 km/h. */
export function estradaReta(totalKm: number) {
  const pontos = Math.ceil(totalKm / 50);
  const coordenadas = Array.from({ length: pontos + 1 }, (_, i): [number, number] => [-48, -26 + (totalKm * (i / pontos)) / KM_POR_GRAU]);

  return rotaOsrm(coordenadas);
}

export interface Oferta {
  municipio: Municipio;
  hoteis: number;
  atracoes: number;
}

export function instalarViagemFalsa() {
  const estado = {
    ofertas: [] as Oferta[],
    estradas: [] as { destino: Municipio; responder: () => RespostaDeMapa }[],
    overpassFora: false,
    // Atraso das respostas do Overpass (preparos de cidade que ficam "preparando" por um tempo).
    atrasoDoOverpassMs: 0,
  };

  const mapas = instalarMapasFalsos({
    osrm: (url) => {
      // O banco devolve as coordenadas com 15 dígitos: compara com tolerância.
      const [lon, lat] = (/;(-?[\d.]+),(-?[\d.]+)\?/.exec(url) ?? []).slice(1).map(Number);
      const estrada = estado.estradas.find(
        ({ destino }) => Math.abs(destino.longitude - lon) < 1e-9 && Math.abs(destino.latitude - lat) < 1e-9,
      );

      return estrada?.responder() ?? { status: 500, corpo: {} };
    },
    overpass: () => ({
      ...(estado.overpassFora ? { status: 504 } : {}),
      atrasoMs: estado.atrasoDoOverpassMs,
      corpo: {
        elements: estado.ofertas.flatMap(({ municipio, hoteis, atracoes }, i) => [
          ...Array.from({ length: hoteis }, (_, j) => ({
            type: "node",
            id: (i + 1) * 1000 + j,
            lat: municipio.latitude + 0.001,
            lon: municipio.longitude,
            tags: { name: `Hotel ${municipio.cidade} ${j + 1}`, tourism: "hotel", phone: "+55 62 3000-0000" },
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

  return {
    mapas,
    estado,
    /** A última estrada combinada para um destino vale. */
    naEstrada(destino: Municipio, responder: () => RespostaDeMapa) {
      estado.estradas.unshift({ destino, responder });
    },
    chamadas(servico: "osrm" | "overpass") {
      return mapas.chamadas.filter((c) => c.servico === servico);
    },
    desinstalar: () => mapas.desinstalar(),
  };
}

export type ViagemFalsa = ReturnType<typeof instalarViagemFalsa>;

/**
 * Joinville → Brasília por uma estrada de 1.501 km com as cidades A (km 498, 6 hotéis),
 * A2 (km 520, 2 hotéis) e B (km 1.001, 5 hotéis), e 12 pontos publicados em Brasília.
 */
export async function prepararBrasilia(viagem: ViagemFalsa) {
  await criarMunicipio(JOINVILLE);
  await criarMunicipio(BRASILIA);

  for (let i = 0; i < 12; i += 1) {
    await criarPonto({ nome: `Brasília ${i}`, cidade: "Brasília", latitude: -15.78 - i * 0.002, longitude: -47.93 });
  }

  const a = await criarMunicipio(noKm(1000010, "Cidade A", 498));
  const a2 = await criarMunicipio(noKm(1000011, "Cidade A2", 520));
  const b = await criarMunicipio(noKm(1000012, "Cidade B", 1001));

  viagem.estado.ofertas.push({ municipio: a, hoteis: 6, atracoes: 3 }, { municipio: a2, hoteis: 2, atracoes: 0 }, { municipio: b, hoteis: 5, atracoes: 2 });
  viagem.naEstrada(BRASILIA, () => ({ corpo: estradaReta(1501) }));

  return { a, a2, b };
}
