import { AGENTE } from "./baixarCidade";
import { normalizarCidade } from "./cidades";

// Busca de municípios brasileiros pelo nome, no Nominatim (a busca de endereços do
// OpenStreetMap), para o usuário escolher qualquer cidade do país. A política de uso do
// serviço público pede: identificar-se (User-Agent), no máximo 1 consulta por segundo e
// guardar as respostas. Por isso as consultas entram em fila com intervalo e os
// resultados ficam em memória por um tempo.

const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const INTERVALO_ENTRE_CONSULTAS_MS = 1100;
const VALIDADE_DO_CACHE_MS = 60 * 60 * 1000;
const MAXIMO_NO_CACHE = 500;
const TEMPO_LIMITE_MS = 8000;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface CidadeEncontrada {
  cidade: string;
  uf: string;
  latitude: number;
  longitude: number;
}

interface ResultadoNominatim {
  lat?: string;
  lon?: string;
  name?: string;
  category?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string>;
}

const TIPOS_DE_MUNICIPIO = new Set(["city", "town", "village", "municipality"]);

/** Fica só com os municípios do Brasil (sem bairros, distritos nem ruas) e sem repetições. */
export function cidadesDoNominatim(resultados: ResultadoNominatim[]): CidadeEncontrada[] {
  const vistas = new Set<string>();
  const cidades: CidadeEncontrada[] = [];

  for (const r of resultados) {
    const uf = /^BR-([A-Z]{2})$/.exec(r.address?.["ISO3166-2-lvl4"] ?? "")?.[1];
    const latitude = Number(r.lat);
    const longitude = Number(r.lon);
    const nome = r.name?.trim();

    if (
      !uf ||
      !nome ||
      r.address?.country_code !== "br" ||
      r.category !== "boundary" ||
      r.type !== "administrative" ||
      !TIPOS_DE_MUNICIPIO.has(r.addresstype ?? "") ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      continue;
    }

    const chave = `${normalizarCidade(nome)}|${uf}`;

    if (vistas.has(chave)) {
      continue;
    }

    vistas.add(chave);
    cidades.push({ cidade: nome, uf, latitude, longitude });
  }

  return cidades;
}

export class ErroGeocodificacao extends Error {}

const cache = new Map<string, { guardadoEm: number; cidades: CidadeEncontrada[] }>();
let fila: Promise<unknown> = Promise.resolve();
let ultimaConsultaEm = 0;

/** Executa uma consulta por vez, com o intervalo que o serviço público exige. */
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

export async function buscarCidadesNoBrasil(texto: string): Promise<CidadeEncontrada[]> {
  const chave = normalizarCidade(texto);
  const guardado = cache.get(chave);

  if (guardado && Date.now() - guardado.guardadoEm < VALIDADE_DO_CACHE_MS) {
    return guardado.cidades;
  }

  const cidades = await naFila(async () => {
    const url = new URL(NOMINATIM_URL);
    url.search = new URLSearchParams({
      q: texto,
      countrycodes: "br",
      format: "jsonv2",
      addressdetails: "1",
      limit: "10",
      "accept-language": "pt-BR",
      featuretype: "settlement",
    }).toString();

    let resposta: Response;

    try {
      resposta = await fetch(url, {
        headers: { "User-Agent": AGENTE, Accept: "application/json" },
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (erro) {
      throw new ErroGeocodificacao(`Falha ao consultar o Nominatim: ${erro instanceof Error ? erro.message : erro}`);
    }

    if (!resposta.ok) {
      throw new ErroGeocodificacao(`O Nominatim respondeu ${resposta.status}.`);
    }

    return cidadesDoNominatim((await resposta.json()) as ResultadoNominatim[]);
  });

  if (cache.size >= MAXIMO_NO_CACHE) {
    cache.delete(cache.keys().next().value as string);
  }

  cache.set(chave, { guardadoEm: Date.now(), cidades });

  return cidades;
}
