// Leitura dos dados do Overture Maps (tema "places"): completa telefone e site dos pontos que já
// temos e traz hospedagens, que o OpenStreetMap quase não tem. O Overture não tem horário de
// funcionamento. Licença: CDLA Permissive 2.0 (e Apache 2.0 / CC0 em algumas fontes), que permite
// guardar e redistribuir os dados desde que a licença os acompanhe.

import { distanciaMetros } from "./geo";
import { normalizarSite } from "./osm";

export interface LugarOverture {
  idOverture: string;
  nome: string;
  categoriaOverture: string | null;
  confianca: number;
  sites: string[];
  telefones: string[];
  redesSociais: string[];
  endereco: string | null;
  localidade: string | null;
  latitude: number;
  longitude: number;
  fontes: string[];
}

export const DISTANCIA_MESMO_LUGAR_METROS = 200;
export const CONFIANCA_MINIMA_HOSPEDAGEM = 0.85;

// Categoria do Overture → tipo de hospedagem (motel fica de fora: no Brasil é outra coisa).
const TIPOS_DE_HOSPEDAGEM: Record<string, string> = {
  hotel: "Hotel",
  resort: "Resort",
  inn: "Pousada",
  guest_house: "Pousada",
  bed_and_breakfast: "Pousada",
  cottage: "Chalé",
  holiday_rental_home: "Casa de temporada",
  hostel: "Hostel",
};

export function semAcento(texto: string | null | undefined): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PALAVRAS_DE_LIGACAO = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "the"]);

function palavras(nome: string): Set<string> {
  return new Set(
    semAcento(nome)
      .split(/[^a-z0-9]+/)
      .filter((p) => p && !PALAVRAS_DE_LIGACAO.has(p)),
  );
}

/**
 * Mesmas palavras, ou quase: "Museu de Arte" e "Museu de Arte de Joinville" são o mesmo lugar,
 * mas "Radical - Luggage Storage Parque Ramiro Ruediger" não é o "Parque Ramiro Ruediger".
 */
export function nomesParecidos(a: string, b: string): boolean {
  const x = palavras(a);
  const y = palavras(b);
  const comuns = [...x].filter((p) => y.has(p)).length;
  const todas = new Set([...x, ...y]).size;

  return todas > 0 && (comuns === todas || (Math.min(x.size, y.size) >= 2 && comuns / todas >= 0.6));
}

// Telefone e site do Overture vêm de páginas de negócios (Facebook e outras); para praias,
// parques e mirantes eles raramente são oficiais.
const CATEGORIAS_SEM_CONTATO = new Set(["Natureza"]);

export function aceitaContatoDoOverture(categoria: string): boolean {
  return !CATEGORIAS_SEM_CONTATO.has(categoria);
}

/** "+554734333736" → "+55 47 3433-3736"; números de fora do padrão brasileiro ficam como vieram. */
export function formatarTelefone(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "");

  // Com código de país, só o do Brasil (+55) é reformatado.
  if (bruto.trim().startsWith("+") && !digitos.startsWith("55")) {
    return bruto.trim();
  }

  const nacional = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;

  if (nacional.length === 10 || nacional.length === 11) {
    const ddd = nacional.slice(0, 2);
    const numero = nacional.slice(2);
    const corte = numero.length - 4;

    return `+55 ${ddd} ${numero.slice(0, corte)}-${numero.slice(corte)}`;
  }

  return bruto.trim();
}

/** Site próprio; sem ele, a página do Instagram ou do Facebook (muitos negócios só têm essas). */
export function siteDoLugar(lugar: Pick<LugarOverture, "sites" | "redesSociais">): string | null {
  for (const site of lugar.sites) {
    const normalizado = normalizarSite(site);
    if (normalizado) return normalizado;
  }

  const redes = [...lugar.redesSociais].sort((a, b) => Number(b.includes("instagram")) - Number(a.includes("instagram")));

  for (const rede of redes) {
    const normalizado = normalizarSite(rede);
    if (normalizado) return normalizado;
  }

  return null;
}

export function telefoneDoLugar(lugar: Pick<LugarOverture, "telefones">): string | null {
  const telefone = lugar.telefones.find((t) => t.replace(/\D/g, "").length >= 8);

  return telefone ? formatarTelefone(telefone).slice(0, 40) : null;
}

export function tipoDeHospedagem(lugar: Pick<LugarOverture, "categoriaOverture">): string | null {
  return lugar.categoriaOverture ? (TIPOS_DE_HOSPEDAGEM[lugar.categoriaOverture] ?? null) : null;
}

/** Hospedagem do Overture que vale virar ponto novo: confiável e com o endereço na cidade certa. */
export function ehHospedagemNova(lugar: LugarOverture, cidade: string): boolean {
  return (
    tipoDeHospedagem(lugar) !== null &&
    lugar.confianca >= CONFIANCA_MINIMA_HOSPEDAGEM &&
    semAcento(lugar.localidade) === semAcento(cidade)
  );
}

interface Coordenadas {
  nome: string;
  latitude: number | null;
  longitude: number | null;
}

/** O lugar do Overture que corresponde ao ponto (mais confiável entre os de nome parecido, perto). */
export function correspondente<L extends LugarOverture>(ponto: Coordenadas, lugares: L[]): L | null {
  if (ponto.latitude === null || ponto.longitude === null) {
    return null;
  }

  let melhor: L | null = null;

  for (const lugar of lugares) {
    if (
      nomesParecidos(ponto.nome, lugar.nome) &&
      distanciaMetros(ponto.latitude, ponto.longitude, lugar.latitude, lugar.longitude) <= DISTANCIA_MESMO_LUGAR_METROS &&
      (!melhor || lugar.confianca > melhor.confianca)
    ) {
      melhor = lugar;
    }
  }

  return melhor;
}
