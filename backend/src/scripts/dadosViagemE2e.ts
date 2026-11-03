import { StatusPonto } from "@prisma/client";
import prisma from "../lib/prisma";
import { distanciaMetros } from "../lib/geo";
import { municipioPorCodigo, type Municipio } from "../lib/municipios";
import { gravarRotaEmCache } from "../lib/rotas";
import { candidatosDaRota } from "../lib/corredor";
import type { ResumoOsm } from "../lib/resumoOsm";

// Viagem de carro nos testes de ponta a ponta, sem internet: rotas retas entre as sedes, com a
// distância "da estrada" informada, gravadas direto em rota_em_cache, e um resumo pronto para
// cada município do caminho (1 em cada 3 com hotéis). Pontos publicados nos destinos.

const VELOCIDADE_KMH = 80;
const PONTOS_NO_TRACADO = 30;

const JOINVILLE = 4209102;
const BRASILIA = 5300108;
const GOIANIA = 5208707;
// Sem pontos no E2E: a viagem para lá dispara o preparo da cidade.
const ITAJAI = 4208203;

async function gravarRota(origem: Municipio, destino: Municipio, metros: number): Promise<number> {
  const coordenadas = Array.from({ length: PONTOS_NO_TRACADO + 1 }, (_, i): [number, number] => {
    const f = i / PONTOS_NO_TRACADO;
    return [origem.longitude + (destino.longitude - origem.longitude) * f, origem.latitude + (destino.latitude - origem.latitude) * f];
  });
  const retas = coordenadas.slice(1).map(([lon, lat], i) => distanciaMetros(coordenadas[i][1], coordenadas[i][0], lat, lon));
  const escala = metros / retas.reduce((soma, d) => soma + d, 0);
  const distancias = retas.map((d) => d * escala);
  const duracoes = distancias.map((d) => d / (VELOCIDADE_KMH / 3.6));

  return gravarRotaEmCache(origem.codigoIbge, destino.codigoIbge, {
    metros,
    segundos: Math.round(duracoes.reduce((soma, d) => soma + d, 0)),
    coordenadas,
    distancias,
    duracoes,
  });
}

function resumoSintetico(m: Municipio, comHoteis: boolean): ResumoOsm {
  if (!comHoteis) return { hospedagens: [], atracoes: [], totalHospedagens: 0, totalAtracoes: 0 };

  return {
    hospedagens: [1, 2, 3].map((n) => ({
      idOsm: `node/${m.codigoIbge}${n}`,
      nome: `Hotel ${m.cidade} ${n}`,
      tipo: "hotel",
      latitude: m.latitude + 0.002 * n,
      longitude: m.longitude,
      tags: { name: `Hotel ${m.cidade} ${n}`, tourism: "hotel" },
    })),
    atracoes: [1, 2].map((n) => ({ idOsm: `way/${m.codigoIbge}${n}`, nome: `Museu de ${m.cidade} ${n}` })),
    totalHospedagens: 3,
    totalAtracoes: 2,
  };
}

async function resumirOCaminho(idRota: number, pontas: number[]) {
  const cidades = await candidatosDaRota(idRota, pontas);

  for (const [i, c] of cidades.entries()) {
    await prisma.$executeRaw`
      UPDATE municipio SET resumo_osm = ${JSON.stringify(resumoSintetico(c, i % 3 === 0))}::jsonb, resumo_em = now()
      WHERE codigo_ibge = ${c.codigoIbge}
    `;
  }
}

async function pontosNoDestino(m: Municipio) {
  for (let i = 0; i < 6; i += 1) {
    await prisma.pontoTuristico.create({
      data: {
        nome: `Atração ${i + 1} de ${m.cidade} E2E`,
        categoria: i % 2 === 0 ? "Cultura" : "Natureza",
        cidade: m.cidade,
        latitude: m.latitude - i * 0.003,
        longitude: m.longitude + i * 0.002,
        horarioFuncionamento: "Todos os dias, 24h",
        status: StatusPonto.PUBLICADO,
      },
    });
  }
}

/** Depois de carregar os municípios: rotas, resumos e pontos da viagem de carro do E2E. */
export async function prepararViagemE2e(): Promise<void> {
  const [joinville, brasilia, goiania, itajai] = await Promise.all(
    [JOINVILLE, BRASILIA, GOIANIA, ITAJAI].map((c) => municipioPorCodigo(c)),
  );

  if (!joinville || !brasilia || !goiania || !itajai) {
    throw new Error("Municípios do E2E não encontrados: importe prisma/dados/municipios.json antes.");
  }

  const ida = await gravarRota(joinville, brasilia, 1_501_000);
  const volta = await gravarRota(brasilia, joinville, 1_501_000);
  // 1.120 km: depois da 1ª noite faltam ~620 km e a chegada pede a decisão "esticar ou dormir".
  const goias = await gravarRota(joinville, goiania, 1_120_000);
  const litoral = await gravarRota(joinville, itajai, 95_000);

  await resumirOCaminho(ida, [JOINVILLE, BRASILIA]);
  await resumirOCaminho(volta, [JOINVILLE, BRASILIA]);
  await resumirOCaminho(goias, [JOINVILLE, GOIANIA]);
  await resumirOCaminho(litoral, [JOINVILLE, ITAJAI]);
  await pontosNoDestino(brasilia);
  await pontosNoDestino(goiania);
}
