import prisma from "./prisma";
import { AGENTE } from "./baixarCidade";
import type { Municipio } from "./municipios";

// Rota de carro entre duas cidades, pelo OSRM (roteador do OpenStreetMap). A primeira consulta
// fica guardada no banco por 90 dias (rota_em_cache), com o traçado simplificado e o perfil de
// tempo: quantos segundos se leva até cada ponto da estrada, de 5 em 5 km. É o perfil que diz
// onde terminam "7 horas ao volante" e quanto tempo leva cada dia de estrada.

const OSRM_URL = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
const TEMPO_LIMITE_MS = 15_000;
const INTERVALO_ENTRE_CONSULTAS_MS = 1000;
const VALIDADE_DA_ROTA_MS = 90 * 24 * 60 * 60 * 1000;
export const PERFIL_A_CADA_KM = 5;
// ~500 m: o traçado serve para achar cidades num corredor de 20 km e para desenhar o mapa.
const TOLERANCIA_DO_TRACADO = 0.005;

export type PerfilDaRota = [km: number, segundos: number][];

export interface Rota {
  id: number;
  metros: number;
  segundos: number;
  perfil: PerfilDaRota;
  /** A rota passou dos 90 dias e o OSRM não respondeu: é a que estava guardada. */
  vencida: boolean;
}

export interface RespostaOsrmLida {
  metros: number;
  segundos: number;
  /** [lon, lat], como no GeoJSON. */
  coordenadas: [number, number][];
  /** Metros e segundos de cada trecho entre duas coordenadas seguidas. */
  distancias: number[];
  duracoes: number[];
}

export class ErroRota extends Error {}

export class SemEstrada extends Error {}

const arredondar = (valor: number, casas: number) => Math.round(valor * 10 ** casas) / 10 ** casas;

/** [km, segundos] acumulados: começa em [0, 0], um par a cada `aCadaKm` e o par final. */
export function montarPerfil(distancias: number[], duracoes: number[], aCadaKm = PERFIL_A_CADA_KM): PerfilDaRota {
  const perfil: PerfilDaRota = [[0, 0]];
  let metros = 0;
  let segundos = 0;
  let proximo = aCadaKm;

  distancias.forEach((distancia, i) => {
    metros += distancia;
    segundos += duracoes[i] ?? 0;

    if (metros / 1000 >= proximo) {
      perfil.push([arredondar(metros / 1000, 3), arredondar(segundos, 1)]);

      while (metros / 1000 >= proximo) proximo += aCadaKm;
    }
  });

  const [kmFinal] = perfil[perfil.length - 1];

  if (arredondar(metros / 1000, 3) > kmFinal) {
    perfil.push([arredondar(metros / 1000, 3), arredondar(segundos, 1)]);
  }

  return perfil;
}

/** Segundos de direção do início da rota até o km informado (interpolado no perfil). */
export function segundosAte(perfil: PerfilDaRota, km: number): number {
  if (km <= 0) return 0;

  for (let i = 1; i < perfil.length; i += 1) {
    const [kmFim, sFim] = perfil[i];

    if (km <= kmFim) {
      const [kmInicio, sInicio] = perfil[i - 1];

      return kmFim === kmInicio ? sFim : sInicio + ((km - kmInicio) / (kmFim - kmInicio)) * (sFim - sInicio);
    }
  }

  return perfil[perfil.length - 1][1];
}

/** Até que km se chega dirigindo `segundos` a partir de `kmInicial` (no máximo, o fim da rota). */
export function kmApos(perfil: PerfilDaRota, kmInicial: number, segundos: number): number {
  const alvo = segundosAte(perfil, kmInicial) + segundos;

  for (let i = 1; i < perfil.length; i += 1) {
    const [kmFim, sFim] = perfil[i];

    if (alvo <= sFim) {
      const [kmInicio, sInicio] = perfil[i - 1];

      return sFim === sInicio ? kmFim : kmInicio + ((alvo - sInicio) / (sFim - sInicio)) * (kmFim - kmInicio);
    }
  }

  return perfil[perfil.length - 1][0];
}

interface RotaDoOsrm {
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: [number, number][] };
  legs?: { annotation?: { distance?: number[]; duration?: number[] } }[];
}

export function lerRespostaOsrm(corpo: unknown): RespostaOsrmLida {
  const resposta = (typeof corpo === "object" && corpo !== null ? corpo : {}) as { code?: string; routes?: RotaDoOsrm[] };

  if (resposta.code === "NoRoute") {
    throw new SemEstrada("O OSRM não achou estrada entre as cidades.");
  }

  const rota = resposta.routes?.[0];
  const coordenadas = rota?.geometry?.coordinates;

  if (resposta.code !== "Ok" || !rota || !coordenadas || coordenadas.length < 2) {
    throw new ErroRota(`Resposta inesperada do OSRM (${resposta.code ?? "sem código"}).`);
  }

  const legs = rota.legs ?? [];

  return {
    metros: Math.round(rota.distance ?? 0),
    segundos: Math.round(rota.duration ?? 0),
    coordenadas,
    distancias: legs.flatMap((leg) => leg.annotation?.distance ?? []),
    duracoes: legs.flatMap((leg) => leg.annotation?.duration ?? []),
  };
}

/** Grava (ou troca) a rota de origem → destino e devolve o id do registro. */
export async function gravarRotaEmCache(
  origem: number,
  destino: number,
  dados: RespostaOsrmLida,
  agora: Date = new Date(),
): Promise<number> {
  const perfil = JSON.stringify(montarPerfil(dados.distancias, dados.duracoes));
  const tracado = JSON.stringify({ type: "LineString", coordinates: dados.coordenadas });

  const [{ id }] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO rota_em_cache (codigo_origem, codigo_destino, metros, segundos, tracado, perfil, buscada_em)
    VALUES (
      ${origem}, ${destino}, ${dados.metros}, ${dados.segundos},
      ST_Simplify(ST_SetSRID(ST_GeomFromGeoJSON(${tracado}), 4326), ${TOLERANCIA_DO_TRACADO}),
      ${perfil}::jsonb, ${agora}
    )
    ON CONFLICT (codigo_origem, codigo_destino) DO UPDATE SET
      metros = EXCLUDED.metros,
      segundos = EXCLUDED.segundos,
      tracado = EXCLUDED.tracado,
      perfil = EXCLUDED.perfil,
      buscada_em = EXCLUDED.buscada_em
    RETURNING id
  `;

  return id;
}

let fila: Promise<unknown> = Promise.resolve();
let ultimaConsultaEm = 0;

/** Uma consulta por vez, com intervalo: o servidor público pede uso leve. */
function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(async () => {
    const espera = ultimaConsultaEm + INTERVALO_ENTRE_CONSULTAS_MS - Date.now();

    if (espera > 0) {
      await new Promise((resolver) => setTimeout(resolver, espera));
    }

    ultimaConsultaEm = Date.now();

    return tarefa();
  });

  fila = resultado.catch(() => undefined);

  return resultado;
}

async function consultarOsrm(origem: Municipio, destino: Municipio): Promise<RespostaOsrmLida> {
  const url =
    `${OSRM_URL}/route/v1/driving/${origem.longitude},${origem.latitude};${destino.longitude},${destino.latitude}` +
    "?overview=full&geometries=geojson&annotations=distance,duration";

  return naFila(async () => {
    let resposta: Response;

    try {
      resposta = await fetch(url, {
        headers: { "User-Agent": AGENTE, Accept: "application/json" },
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (erro) {
      throw new ErroRota(`Falha ao consultar o OSRM: ${erro instanceof Error ? erro.message : erro}`);
    }

    // O OSRM responde 400 com code "NoRoute" quando não há estrada: o corpo diz o que houve.
    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok && (corpo as { code?: string } | null)?.code !== "NoRoute") {
      throw new ErroRota(`O OSRM respondeu ${resposta.status}.`);
    }

    return lerRespostaOsrm(corpo);
  });
}

interface RotaGuardada {
  id: number;
  metros: number;
  segundos: number;
  perfil: PerfilDaRota;
  buscadaEm: Date;
}

/** Rota de carro de origem → destino: do cache (90 dias) ou do OSRM, que então é guardada. */
export async function buscarRota(origem: Municipio, destino: Municipio, agora: Date = new Date()): Promise<Rota> {
  const [guardada] = await prisma.$queryRaw<RotaGuardada[]>`
    SELECT id, metros, segundos, perfil, buscada_em AS "buscadaEm"
    FROM rota_em_cache
    WHERE codigo_origem = ${origem.codigoIbge} AND codigo_destino = ${destino.codigoIbge}
  `;

  if (guardada && agora.getTime() - guardada.buscadaEm.getTime() < VALIDADE_DA_ROTA_MS) {
    return { id: guardada.id, metros: guardada.metros, segundos: guardada.segundos, perfil: guardada.perfil, vencida: false };
  }

  try {
    const dados = await consultarOsrm(origem, destino);
    const id = await gravarRotaEmCache(origem.codigoIbge, destino.codigoIbge, dados, agora);

    return {
      id,
      metros: dados.metros,
      segundos: dados.segundos,
      perfil: montarPerfil(dados.distancias, dados.duracoes),
      vencida: false,
    };
  } catch (erro) {
    if (erro instanceof SemEstrada || !guardada) {
      throw erro;
    }

    console.error("OSRM indisponível; usando a rota guardada:", erro instanceof Error ? erro.message : erro);

    return { id: guardada.id, metros: guardada.metros, segundos: guardada.segundos, perfil: guardada.perfil, vencida: true };
  }
}
