import prisma from "./prisma";

// Cidades ao longo da estrada: os municípios cuja sede fica a até 20 km do traçado de uma rota
// guardada, com o km da rota em que cada uma fica. O km é o comprimento geodésico do traçado até
// a cidade, escalado para a distância real que o OSRM mediu (o traçado simplificado é um pouco
// mais curto que a estrada).

export const CORREDOR_KM = 20;
const MAX_PONTOS_DO_TRACADO = 400;

export interface CidadeNaRota {
  codigoIbge: number;
  cidade: string;
  uf: string;
  latitude: number;
  longitude: number;
  km: number;
  /** Posição no traçado, de 0 (início) a 1 (fim): serve para recortar o pedaço de cada dia. */
  fracao: number;
  desvioKm: number;
}

export async function candidatosDaRota(idRota: number, excluir: number[]): Promise<CidadeNaRota[]> {
  return prisma.$queryRaw<CidadeNaRota[]>`
    WITH rota AS (
      SELECT tracado, metros, ST_Length(tracado::geography) AS comprimento
      FROM rota_em_cache
      WHERE id = ${idRota}
    ),
    perto AS (
      SELECT m.codigo_ibge, m.nome, m.uf, m.latitude, m.longitude,
             ST_LineLocatePoint(rota.tracado, m.geom::geometry) AS fracao,
             ST_Distance(m.geom, rota.tracado::geography) / 1000 AS desvio_km
      FROM municipio m, rota
      WHERE ST_DWithin(m.geom, rota.tracado::geography, ${CORREDOR_KM * 1000})
        AND m.codigo_ibge <> ALL(${excluir}::int[])
    )
    SELECT perto.codigo_ibge AS "codigoIbge", perto.nome AS cidade, perto.uf, perto.latitude, perto.longitude,
           perto.fracao, perto.desvio_km AS "desvioKm",
           ST_Length(ST_LineSubstring(rota.tracado, 0, perto.fracao)::geography)
             * (rota.metros / NULLIF(rota.comprimento, 0)) / 1000 AS km
    FROM perto, rota
    ORDER BY km
  `;
}

/** Pedaço do traçado entre duas frações, como [lat, lon] (para o Leaflet), com até 400 pontos. */
export async function tracadoEntre(idRota: number, fracaoInicio: number, fracaoFim: number): Promise<[number, number][]> {
  const [linha] = await prisma.$queryRaw<{ geojson: string }[]>`
    SELECT ST_AsGeoJSON(ST_LineSubstring(tracado, ${fracaoInicio}, ${fracaoFim}), 5) AS geojson
    FROM rota_em_cache
    WHERE id = ${idRota}
  `;

  if (!linha) return [];

  const geometria = JSON.parse(linha.geojson) as { type: string; coordinates: number[] | number[][] };
  const coordenadas = (geometria.type === "Point" ? [geometria.coordinates] : geometria.coordinates) as number[][];
  const pontos = coordenadas.map(([lon, lat]) => [lat, lon] as [number, number]);

  if (pontos.length <= MAX_PONTOS_DO_TRACADO) return pontos;

  // Um a cada n, sempre com o último, para o pedaço terminar onde termina o dia.
  const passo = Math.ceil(pontos.length / (MAX_PONTOS_DO_TRACADO - 1));
  const ultimo = pontos.length - 1;

  return pontos.filter((_, i) => (i % passo === 0 && i < ultimo) || i === ultimo);
}
