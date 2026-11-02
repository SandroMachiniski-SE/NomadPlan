import prisma from "./prisma";
import { AGENTE } from "./baixarCidade";
import { distanciaMetros } from "./geo";
import type { ElementoOsm } from "./osm";

// Resumo de cada cidade candidata a pernoite: quantas hospedagens e atrações há a até 8 km da
// sede, pelo Overpass (OpenStreetMap). É o que ordena as sugestões ("mais hospedagens", "ter o
// que ver"). Fica no próprio município por 30 dias; vencido, ainda serve se o Overpass falhar.

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
export const RAIO_DA_CIDADE_KM = 8;
const VALIDADE_DO_RESUMO_MS = 30 * 24 * 60 * 60 * 1000;
const TEMPO_LIMITE_MS = 30_000;
const INTERVALO_ENTRE_CONSULTAS_MS = 1000;
const MAX_HOSPEDAGENS = 40;
const MAX_ATRACOES = 10;

const TIPOS_DE_HOSPEDAGEM = new Set(["hotel", "motel", "guest_house", "hostel", "chalet", "apartment"]);
const TURISMO_ATRACAO = new Set(["attraction", "museum", "viewpoint", "gallery", "zoo", "theme_park"]);

export interface HospedagemDoResumo {
  idOsm: string;
  nome: string;
  tipo: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
}

export interface ResumoOsm {
  hospedagens: HospedagemDoResumo[];
  atracoes: { idOsm: string; nome: string }[];
  totalHospedagens: number;
  totalAtracoes: number;
}

interface CidadeParaResumo {
  codigoIbge: number;
  latitude: number;
  longitude: number;
}

const grau = (valor: number) => Number(valor.toFixed(4));

/** Retângulo (sul, oeste, norte, leste) que contém o círculo de `raioKm` em volta do ponto. */
function retangulo(latitude: number, longitude: number, raioKm: number): string {
  const dLat = raioKm / 111.32;
  const dLon = raioKm / (111.32 * Math.cos((latitude * Math.PI) / 180));

  return `${grau(latitude - dLat)},${grau(longitude - dLon)},${grau(latitude + dLat)},${grau(longitude + dLon)}`;
}

export function consultaDoResumo(cidades: { latitude: number; longitude: number }[], timeoutSegundos = 25): string {
  // Monumentos (historic) e praças (leisure=park) ficam de fora: nas regiões metropolitanas são
  // milhares e a consulta estourava o tempo limite do Overpass. Pelo mesmo motivo a busca é por
  // retângulo, bem mais rápida que "around"; o raio de 8 km é conferido depois, no código.
  const filtros = [
    `["tourism"~"^(${[...TIPOS_DE_HOSPEDAGEM, ...TURISMO_ATRACAO].join("|")})$"]`,
    `["natural"~"^(beach|waterfall)$"]`,
    `["waterway"="waterfall"]`,
  ];
  const linhas = cidades.flatMap(({ latitude, longitude }) => {
    const caixa = retangulo(latitude, longitude, RAIO_DA_CIDADE_KM);

    return filtros.map((filtro) => `  nwr${filtro}["name"](${caixa});`);
  });

  return `[out:json][timeout:${timeoutSegundos}];\n(\n${linhas.join("\n")}\n);\nout center tags;\n`;
}

function ehAtracao(tags: Record<string, string>): boolean {
  return (
    TURISMO_ATRACAO.has(tags.tourism ?? "") ||
    tags.historic !== undefined ||
    tags.leisure === "park" ||
    tags.natural === "beach" ||
    tags.natural === "waterfall" ||
    tags.waterway === "waterfall"
  );
}

/** Quantos dos dados de contato a hospedagem tem: as mais completas aparecem primeiro. */
function completude(tags: Record<string, string>): number {
  return ["phone", "website", "stars"].filter((chave) => tags[chave] || tags[`contact:${chave}`]).length;
}

function resumoVazio(): ResumoOsm {
  return { hospedagens: [], atracoes: [], totalHospedagens: 0, totalAtracoes: 0 };
}

export function distribuirElementos(
  elementos: ElementoOsm[],
  cidades: CidadeParaResumo[],
  raioKm = RAIO_DA_CIDADE_KM,
): Map<number, ResumoOsm> {
  const resumos = new Map(cidades.map((c) => [c.codigoIbge, resumoVazio()]));
  const vistos = new Set<string>();

  for (const elemento of elementos) {
    const tags = elemento.tags ?? {};
    const nome = tags.name?.trim();
    const latitude = elemento.lat ?? elemento.center?.lat;
    const longitude = elemento.lon ?? elemento.center?.lon;
    const idOsm = `${elemento.type}/${elemento.id}`;

    if (!nome || latitude === undefined || longitude === undefined || vistos.has(idOsm)) continue;

    let maisPerto: { codigo: number; metros: number } | null = null;

    for (const cidade of cidades) {
      const metros = distanciaMetros(cidade.latitude, cidade.longitude, latitude, longitude);

      if (metros <= raioKm * 1000 && (!maisPerto || metros < maisPerto.metros)) {
        maisPerto = { codigo: cidade.codigoIbge, metros };
      }
    }

    if (!maisPerto) continue;

    const resumo = resumos.get(maisPerto.codigo)!;
    vistos.add(idOsm);

    if (TIPOS_DE_HOSPEDAGEM.has(tags.tourism ?? "")) {
      resumo.totalHospedagens += 1;
      resumo.hospedagens.push({ idOsm, nome, tipo: tags.tourism, latitude, longitude, tags });
    } else if (ehAtracao(tags)) {
      resumo.totalAtracoes += 1;
      resumo.atracoes.push({ idOsm, nome });
    }
  }

  for (const resumo of resumos.values()) {
    resumo.hospedagens = resumo.hospedagens
      .sort((a, b) => completude(b.tags) - completude(a.tags) || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAX_HOSPEDAGENS);
    resumo.atracoes = resumo.atracoes.slice(0, MAX_ATRACOES);
  }

  return resumos;
}

let fila: Promise<unknown> = Promise.resolve();
let ultimaConsultaEm = 0;

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

async function consultarOverpass(cidades: CidadeParaResumo[], tempoLimiteMs: number): Promise<ElementoOsm[]> {
  // O servidor desiste 5 s antes de nós, para a resposta (mesmo vazia) ainda chegar.
  const timeoutDoServidor = Math.max(5, Math.round(tempoLimiteMs / 1000) - 5);

  return naFila(async () => {
    const resposta = await fetch(OVERPASS_URL, {
      method: "POST",
      body: new URLSearchParams({ data: consultaDoResumo(cidades, timeoutDoServidor) }),
      headers: { "User-Agent": AGENTE, Accept: "application/json" },
      signal: AbortSignal.timeout(tempoLimiteMs),
    });

    if (!resposta.ok) {
      throw new Error(`O Overpass respondeu ${resposta.status}.`);
    }

    return ((await resposta.json()) as { elements?: ElementoOsm[] }).elements ?? [];
  });
}

interface MunicipioComResumo extends CidadeParaResumo {
  resumo: ResumoOsm | null;
  resumoEm: Date | null;
}

/**
 * Resumo de cada município pedido: do cache (30 dias) ou de uma consulta só ao Overpass para
 * todos os que faltam. Se o Overpass falhar, usa o resumo vencido; sem nenhum, `null`.
 */
export async function resumirCidades(
  codigos: number[],
  agora: Date = new Date(),
  tempoLimiteMs = TEMPO_LIMITE_MS,
): Promise<Map<number, ResumoOsm | null>> {
  const resultado = new Map<number, ResumoOsm | null>();

  if (codigos.length === 0) return resultado;

  const municipios = await prisma.$queryRaw<MunicipioComResumo[]>`
    SELECT codigo_ibge AS "codigoIbge", latitude, longitude, resumo_osm AS resumo, resumo_em AS "resumoEm"
    FROM municipio
    WHERE codigo_ibge = ANY(${codigos}::int[])
  `;
  const valido = (m: MunicipioComResumo) =>
    m.resumo !== null && m.resumoEm !== null && agora.getTime() - m.resumoEm.getTime() < VALIDADE_DO_RESUMO_MS;
  const faltando = municipios.filter((m) => !valido(m));

  for (const m of municipios) {
    if (valido(m)) resultado.set(m.codigoIbge, m.resumo);
  }

  if (faltando.length === 0) return resultado;

  try {
    const resumos = distribuirElementos(await consultarOverpass(faltando, tempoLimiteMs), faltando);

    for (const [codigo, resumo] of resumos) {
      await prisma.$executeRaw`
        UPDATE municipio SET resumo_osm = ${JSON.stringify(resumo)}::jsonb, resumo_em = ${agora}
        WHERE codigo_ibge = ${codigo}
      `;
      resultado.set(codigo, resumo);
    }
  } catch (erro) {
    console.error("Overpass indisponível para o resumo das cidades:", erro instanceof Error ? erro.message : erro);

    for (const m of faltando) {
      resultado.set(m.codigoIbge, m.resumo);
    }
  }

  return resultado;
}

