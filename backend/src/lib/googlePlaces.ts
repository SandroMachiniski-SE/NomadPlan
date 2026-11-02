// Google Places API (New): mostra, na hora, o que a base aberta não tem (horário, nota, foto...).
// Pelos termos do Google, só o identificador do lugar (place_id) pode ser guardado; o resto é
// consultado a cada uso, exibido com a atribuição ao Google e nunca gravado no banco.
// Sem GOOGLE_MAPS_API_KEY no .env, nada disto é usado e o sistema funciona só com os dados abertos.

import prisma from "./prisma";
import { descreverSemana, type Faixa } from "./horariosOsm";

const BASE = "https://places.googleapis.com/v1";
const TEMPO_LIMITE_MS = 4000;
// Lugar que o Google não achou só é procurado de novo depois disso (cada busca é cobrada).
const DIAS_ENTRE_BUSCAS = 30;
// A busca fica restrita a um retângulo de ~300 m em volta do ponto, para não pegar outro lugar.
const MARGEM_DA_BUSCA_GRAUS = 0.003;

export function chaveGoogle(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

async function chamar<T>(caminho: string, opcoes: { metodo?: "GET" | "POST"; corpo?: unknown; campos?: string }): Promise<T | null> {
  const chave = chaveGoogle();

  if (!chave) {
    return null;
  }

  try {
    const resposta = await fetch(`${BASE}/${caminho}`, {
      method: opcoes.metodo ?? "GET",
      headers: {
        "X-Goog-Api-Key": chave,
        ...(opcoes.campos ? { "X-Goog-FieldMask": opcoes.campos } : {}),
        ...(opcoes.corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    if (!resposta.ok) {
      console.warn(`Google Places respondeu ${resposta.status} para ${caminho.split("?")[0]}.`);
      return null;
    }

    return (await resposta.json()) as T;
  } catch (erro) {
    console.warn("Google Places indisponível:", erro instanceof Error ? erro.message : erro);
    return null;
  }
}

interface PontoParaBuscar {
  nome: string;
  cidade: string;
  latitude: number | null;
  longitude: number | null;
}

/** Procura o place_id do ponto pelo nome, perto das coordenadas (pede só o id: a faixa mais barata). */
export async function buscarIdGoogle(ponto: PontoParaBuscar): Promise<string | null> {
  const restricao =
    ponto.latitude !== null && ponto.longitude !== null
      ? {
          locationRestriction: {
            rectangle: {
              low: { latitude: ponto.latitude - MARGEM_DA_BUSCA_GRAUS, longitude: ponto.longitude - MARGEM_DA_BUSCA_GRAUS },
              high: { latitude: ponto.latitude + MARGEM_DA_BUSCA_GRAUS, longitude: ponto.longitude + MARGEM_DA_BUSCA_GRAUS },
            },
          },
        }
      : {};

  const resposta = await chamar<{ places?: { id: string }[] }>("places:searchText", {
    metodo: "POST",
    campos: "places.id",
    corpo: { textQuery: `${ponto.nome}, ${ponto.cidade}`, languageCode: "pt-BR", regionCode: "BR", pageSize: 1, ...restricao },
  });

  return resposta?.places?.[0]?.id ?? null;
}

/** place_id guardado; se ainda não há, procura (no máximo uma vez a cada 30 dias) e guarda. */
export async function idGoogleDoPonto(
  ponto: PontoParaBuscar & { id: number; idGoogle: string | null; googleBuscadoEm: Date | null },
  agora: Date = new Date(),
): Promise<string | null> {
  if (ponto.idGoogle) {
    return ponto.idGoogle;
  }

  if (ponto.googleBuscadoEm && agora.getTime() - ponto.googleBuscadoEm.getTime() < DIAS_ENTRE_BUSCAS * 86_400_000) {
    return null;
  }

  const idGoogle = await buscarIdGoogle(ponto);

  await prisma.pontoTuristico.update({
    where: { id: ponto.id },
    data: { idGoogle, googleBuscadoEm: agora },
  });

  return idGoogle;
}

interface PeriodoGoogle {
  open?: { day: number; hour: number; minute?: number };
  close?: { day: number; hour: number; minute?: number };
}

/** Converte os períodos do Google (dia 0 = domingo, como no Date) para o texto do sistema. */
export function horarioDoGoogle(periodos: PeriodoGoogle[] | undefined): string | null {
  if (!periodos || periodos.length === 0) {
    return null;
  }

  // Aberto 24 horas, todos os dias: um único período que abre domingo à 0h e não fecha.
  if (periodos.length === 1 && periodos[0].open && !periodos[0].close) {
    return "Todos os dias, 24h";
  }

  const semana: Faixa[][] = Array.from({ length: 7 }, () => []);

  for (const { open, close } of periodos) {
    if (!open || !close) {
      return null;
    }

    const inicio = open.hour * 60 + (open.minute ?? 0);
    const fim = close.hour * 60 + (close.minute ?? 0);
    const diasDepois = (close.day - open.day + 7) % 7;

    if (diasDepois === 0) {
      semana[open.day].push([inicio, fim]);
    } else if (diasDepois === 1) {
      // Fecha no dia seguinte: à meia-noite em ponto, ou de madrugada (a faixa vira a noite).
      semana[open.day].push([inicio, fim === 0 ? 24 * 60 : fim]);
    } else {
      return null;
    }
  }

  return descreverSemana(semana);
}

interface OpcoesDeAcessibilidade {
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleRestroom?: boolean;
  wheelchairAccessibleParking?: boolean;
  wheelchairAccessibleSeating?: boolean;
}

// Os textos seguem as palavras-chave de preferencias.ts ("cadeira de rodas", "banheiro adaptado"...).
export function acessibilidadeDoGoogle(opcoes: OpcoesDeAcessibilidade | undefined): string | null {
  if (!opcoes) return null;

  const partes = [
    opcoes.wheelchairAccessibleEntrance && "Entrada acessível para cadeira de rodas",
    opcoes.wheelchairAccessibleSeating && "assentos para cadeira de rodas",
    opcoes.wheelchairAccessibleRestroom && "banheiro adaptado",
    opcoes.wheelchairAccessibleParking && "estacionamento reservado",
  ].filter(Boolean);

  return partes.length > 0 ? partes.join(", ") : null;
}

export interface InformacoesGoogle {
  horario: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  telefone: string | null;
  site: string | null;
  urlGoogleMaps: string | null;
  acessibilidade: string | null;
  foto: { url: string; autor: string | null; urlAutor: string | null } | null;
}

interface DetalhesGoogle {
  regularOpeningHours?: { periods?: PeriodoGoogle[] };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  accessibilityOptions?: OpcoesDeAcessibilidade;
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
}

const CAMPOS_DETALHES =
  "regularOpeningHours,rating,userRatingCount,nationalPhoneNumber,websiteUri,googleMapsUri,accessibilityOptions";

/** Detalhes do lugar, consultados agora (nada disto é gravado). */
export async function detalhesDoGoogle(idGoogle: string, opcoes: { comFoto?: boolean } = {}): Promise<InformacoesGoogle | null> {
  const detalhes = await chamar<DetalhesGoogle>(`places/${encodeURIComponent(idGoogle)}?languageCode=pt-BR`, {
    campos: opcoes.comFoto ? `${CAMPOS_DETALHES},photos` : CAMPOS_DETALHES,
  });

  if (!detalhes) {
    return null;
  }

  let foto: InformacoesGoogle["foto"] = null;
  const primeira = detalhes.photos?.[0];

  if (opcoes.comFoto && primeira) {
    // skipHttpRedirect devolve o endereço da imagem sem expor a chave da API ao navegador.
    const midia = await chamar<{ photoUri?: string }>(`${primeira.name}/media?maxWidthPx=960&skipHttpRedirect=true`, {});
    const autor = primeira.authorAttributions?.[0];

    if (midia?.photoUri) {
      foto = { url: midia.photoUri, autor: autor?.displayName ?? null, urlAutor: autor?.uri ?? null };
    }
  }

  return {
    horario: horarioDoGoogle(detalhes.regularOpeningHours?.periods),
    nota: detalhes.rating ?? null,
    totalAvaliacoes: detalhes.userRatingCount ?? null,
    telefone: detalhes.nationalPhoneNumber ?? null,
    site: detalhes.websiteUri ?? null,
    urlGoogleMaps: detalhes.googleMapsUri ?? null,
    acessibilidade: acessibilidadeDoGoogle(detalhes.accessibilityOptions),
    foto,
  };
}
