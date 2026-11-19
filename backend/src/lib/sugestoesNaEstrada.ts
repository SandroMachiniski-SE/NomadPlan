import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { CORREDOR_KM } from "./corredor";

// Sugestões no caminho da viagem de carro: lugares publicados do gosto da pessoa (os interesses do
// roteiro) a até 20 km do traçado de cada dia de estrada. São só sugestões: não entram na agenda
// nem mudam os dias. O desvio é em linha reta até a estrada, não o caminho de acesso ao lugar.

export const MAX_SUGESTOES_POR_TRECHO = 5;

export interface SugestaoNaEstrada {
  id: number;
  nome: string;
  cidade: string;
  categoria: string;
  /** Km da perna em que o lugar fica (a projeção dele na estrada). */
  kmNaPerna: number;
  desvioKm: number;
}

const umaCasa = (valor: number) => Math.round(valor * 10) / 10;

/**
 * Os lugares do gosto da pessoa no pedaço da rota entre as duas frações, os mais perto da estrada
 * primeiro. Os das cidades em `excluirCidades` (a saída e a chegada da perna) ficam de fora.
 */
export async function sugerirNaEstrada(
  idRota: number,
  fracaoInicio: number,
  fracaoFim: number,
  interesses: string[],
  excluirCidades: string[] = [],
): Promise<SugestaoNaEstrada[]> {
  // Hospedagem é assunto do pernoite, não sugestão de passeio.
  const categorias = [...new Set(interesses.map((i) => i.trim().toLowerCase()))].filter((c) => c && c !== "hospedagem");

  if (categorias.length === 0 || fracaoFim <= fracaoInicio) return [];

  const cidadesFora = excluirCidades.map((c) => c.trim().toLowerCase());

  const linhas = await prisma.$queryRaw<SugestaoNaEstrada[]>`
    WITH rota AS (
      SELECT tracado, metros, ST_Length(tracado::geography) AS comprimento,
             ST_LineSubstring(tracado, ${fracaoInicio}, ${fracaoFim}) AS pedaco
      FROM rota_em_cache
      WHERE id = ${idRota}
    ),
    perto AS (
      SELECT p.id, p.nome, p.cidade, p.categoria,
             ST_LineLocatePoint(rota.tracado, p.geom::geometry) AS fracao,
             ST_Distance(p.geom, rota.pedaco::geography) / 1000 AS desvio_km
      FROM ponto_turistico p, rota
      WHERE p.status = 'PUBLICADO'
        AND p.geom IS NOT NULL
        AND lower(p.categoria) IN (${Prisma.join(categorias)})
        AND lower(p.cidade) <> ALL(${cidadesFora}::text[])
        AND ST_DWithin(p.geom, rota.pedaco::geography, ${CORREDOR_KM * 1000})
    )
    SELECT perto.id, perto.nome, perto.cidade, perto.categoria, perto.desvio_km AS "desvioKm",
           ST_Length(ST_LineSubstring(rota.tracado, 0, perto.fracao)::geography)
             * (rota.metros / NULLIF(rota.comprimento, 0)) / 1000 AS "kmNaPerna"
    FROM perto, rota
    WHERE perto.fracao > ${fracaoInicio} AND perto.fracao <= ${fracaoFim}
    ORDER BY perto.desvio_km, perto.fracao, perto.id
    LIMIT ${MAX_SUGESTOES_POR_TRECHO}
  `;

  return linhas.map((s) => ({ ...s, kmNaPerna: umaCasa(Number(s.kmNaPerna)), desvioKm: umaCasa(Number(s.desvioKm)) }));
}
