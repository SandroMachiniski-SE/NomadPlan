import type { Ordenacao } from "../types/ponto";

// A busca da página inicial fica no endereço (?cidade=Joinville&categoria=Cultura): voltar dos
// detalhes de um lugar, ou recarregar a página, refaz a mesma busca com os mesmos filtros.

export interface FiltrosDaBusca {
  cidade: string;
  categoria: string;
  busca: string;
  acessibilidade: string;
  faixaPreco: string;
  notaMinima: string;
  abertoAgora: boolean;
  ordenar: Ordenacao | "";
  localizacao: { lat: number; lng: number } | null;
  raioKm: string;
}

export interface AreaBuscada {
  latitude: number;
  longitude: number;
  raioKm: number;
}

export interface BuscaSalva {
  filtros: FiltrosDaBusca;
  /** Busca pela região do mapa; sem `area`, é o mapa aberto antes de a pessoa escolher a região. */
  pelaArea: boolean;
  area: AreaBuscada | null;
  mapa: boolean;
}

export const FILTROS_VAZIOS: FiltrosDaBusca = {
  cidade: "",
  categoria: "",
  busca: "",
  acessibilidade: "",
  faixaPreco: "",
  notaMinima: "",
  abertoAgora: false,
  ordenar: "",
  localizacao: null,
  raioKm: "10",
};

const ORDENACOES: Ordenacao[] = ["relevancia", "distancia", "nome", "avaliacao"];
const NOTAS_MINIMAS = ["3", "4", "4.5"];
const RAIOS_KM = ["5", "10", "25", "50"];
const CHAVES_DA_BUSCA = ["cidade", "categoria", "busca", "acessibilidade", "faixaPreco", "notaMinima", "abertoAgora", "ordenar", "lat", "lng"];
const CHAVE_DA_ULTIMA_BUSCA = "nomadplan.ultimaBusca";

/** Parâmetros que a API /pontos recebe: pelo texto (cidade, nome...) ou pela região enquadrada no mapa. */
export function parametrosDaBusca(filtros: FiltrosDaBusca, area?: AreaBuscada): Record<string, string> {
  const params: Record<string, string> = {};

  if (area) {
    // Na área do mapa os filtros valem; a cidade digitada, a ordem e a localização não.
    params.lat = String(area.latitude);
    params.lng = String(area.longitude);
    params.raioKm = String(Math.min(200, Math.max(0.3, Number(area.raioKm.toFixed(2)))));
    params.limite = "100";
  } else if (filtros.cidade.trim()) {
    params.cidade = filtros.cidade.trim();
  }

  if (filtros.categoria.trim()) params.categoria = filtros.categoria.trim();
  if (filtros.busca.trim()) params.busca = filtros.busca.trim();
  if (filtros.acessibilidade.trim()) params.acessibilidade = filtros.acessibilidade.trim();
  if (filtros.faixaPreco.trim()) params.faixaPreco = filtros.faixaPreco.trim();
  if (filtros.notaMinima) params.notaMinima = filtros.notaMinima;
  if (filtros.abertoAgora) params.abertoAgora = "true";

  if (!area) {
    if (filtros.ordenar && (filtros.ordenar !== "distancia" || filtros.localizacao)) params.ordenar = filtros.ordenar;

    if (filtros.localizacao) {
      params.lat = String(filtros.localizacao.lat);
      params.lng = String(filtros.localizacao.lng);
      params.raioKm = filtros.raioKm;
    }
  }

  return params;
}

/** O endereço que guarda a busca: os mesmos parâmetros da API, mais a busca pelo mapa e a aba aberta. */
export function enderecoDaBusca(params: Record<string, string>, opcoes: { pelaArea: boolean; mapa: boolean }): URLSearchParams {
  const endereco = new URLSearchParams(Object.entries(params).filter(([chave]) => chave !== "limite"));

  if (opcoes.pelaArea) endereco.set("area", "1");
  if (opcoes.mapa) endereco.set("ver", "mapa");

  return endereco;
}

function numeroDe(endereco: URLSearchParams, chave: string): number | null {
  const texto = endereco.get(chave);
  const valor = texto === null || texto.trim() === "" ? Number.NaN : Number(texto);

  return Number.isFinite(valor) ? valor : null;
}

/** Lê a busca guardada no endereço; sem nenhum parâmetro de busca, é a página inicial limpa. */
export function lerEnderecoDaBusca(endereco: URLSearchParams): BuscaSalva | null {
  const pelaArea = endereco.get("area") === "1";

  if (!pelaArea && !CHAVES_DA_BUSCA.some((chave) => endereco.has(chave))) return null;

  const lat = numeroDe(endereco, "lat");
  const lng = numeroDe(endereco, "lng");
  const raioKm = numeroDe(endereco, "raioKm");
  const posicao = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const ordenar = endereco.get("ordenar") ?? "";
  const notaMinima = endereco.get("notaMinima") ?? "";
  const raioTexto = endereco.get("raioKm") ?? "";

  const filtros: FiltrosDaBusca = {
    cidade: pelaArea ? "" : (endereco.get("cidade") ?? ""),
    categoria: endereco.get("categoria") ?? "",
    busca: endereco.get("busca") ?? "",
    acessibilidade: endereco.get("acessibilidade") ?? "",
    faixaPreco: endereco.get("faixaPreco") ?? "",
    notaMinima: NOTAS_MINIMAS.includes(notaMinima) ? notaMinima : "",
    abertoAgora: endereco.get("abertoAgora") === "true",
    ordenar: !pelaArea && (ORDENACOES as string[]).includes(ordenar) ? (ordenar as Ordenacao) : "",
    localizacao: pelaArea ? null : posicao,
    raioKm: !pelaArea && RAIOS_KM.includes(raioTexto) ? raioTexto : FILTROS_VAZIOS.raioKm,
  };

  const area =
    pelaArea && posicao && raioKm !== null && raioKm > 0 ? { latitude: posicao.lat, longitude: posicao.lng, raioKm } : null;

  return { filtros, pelaArea, area, mapa: endereco.get("ver") === "mapa" };
}

/** Zoom aproximado em que a região buscada cabe no mapa, para reabrir o mapa onde a pessoa estava. */
export function zoomDaArea(area: AreaBuscada): number {
  const metrosPorPixelNoZoomZero = 156_543 * Math.cos((area.latitude * Math.PI) / 180);
  // O raio vai do centro ao canto do mapa: cerca de 560 px num mapa de 1000 x 520.
  const zoom = Math.log2((560 * metrosPorPixelNoZoomZero) / (area.raioKm * 1000));

  return Math.min(17, Math.max(4, Math.round(zoom)));
}

// O "Voltar para a busca" dos detalhes de um lugar leva à última busca desta aba.
export function guardarUltimaBusca(endereco: URLSearchParams) {
  try {
    sessionStorage.setItem(CHAVE_DA_ULTIMA_BUSCA, endereco.toString());
  } catch {
    // Sem armazenamento (janela anônima, bloqueio): o link volta para a página inicial limpa.
  }
}

export function enderecoDaUltimaBusca(): string {
  try {
    const salva = sessionStorage.getItem(CHAVE_DA_ULTIMA_BUSCA);

    return salva ? `/?${salva}` : "/";
  } catch {
    return "/";
  }
}
