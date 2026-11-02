import type { MunicipioEscolhido } from "../services/cidades";

// Viagem de carro saindo de casa: o pedido ao gerador, o plano que volta dele e a viagem gravada
// no roteiro (espelham a API, ver docs/superpowers/specs/2026-11-01-viagem-de-carro-design.md).

export interface EscolhaDaNoite {
  perna: number;
  noite: number;
  codigoIbge: number;
}

export interface DecisaoDaPerna {
  perna: number;
  esticar: boolean;
}

export interface PedidoDeViagem {
  origem?: number;
  kmPorDia?: number;
  horasPorDia?: number;
  comVolta?: boolean;
  consumoKmPorLitro?: number;
  precoLitroCentavos?: number;
  escolhas?: EscolhaDaNoite[];
  decisoes?: DecisaoDaPerna[];
}

/** Uma noite de estrada como a pessoa viu: a cidade e o hotel escolhido (sem idOsm = a definir). */
export interface NoiteSalva {
  perna: number;
  noite: number;
  codigoIbge: number | null;
  idOsm?: string;
}

export interface CidadeDePernoite {
  codigoIbge: number | null;
  cidade: string;
  uf: string | null;
  km: number;
  distanciaDoAlvoKm: number;
  totalHospedagens: number | null;
  totalAtracoes: number | null;
  hospedagens: { idOsm: string; nome: string; tipo: string }[];
  atracoes: string[];
  aDefinir: boolean;
}

export interface TrechoPlanejado {
  dia: number;
  /** 1ª, 2ª… noite da perna; null no trecho que chega ao fim dela. */
  noite: number | null;
  de: string;
  para: string;
  metros: number;
  segundos: number;
  /** false: trecho curto descontado de um dia na cidade. */
  ocupaODia: boolean;
  noFimDoDia: boolean;
  litros: number | null;
  custoCentavos: number | null;
  tracado: [number, number][];
  pernoite: CidadeDePernoite | null;
  alternativas: CidadeDePernoite[];
}

export interface PernaPlanejada {
  perna: number;
  de: MunicipioEscolhido;
  para: MunicipioEscolhido;
  metros: number;
  segundos: number;
  trechos: TrechoPlanejado[];
  decisao: { esticar: boolean; metrosEsticando: number; metrosNoDiaSeguinte: number } | null;
}

export interface ViagemDeCarroPlanejada {
  origem: MunicipioEscolhido;
  /** As etapas resolvidas nos municípios (o salvamento manda os códigos). */
  etapas: (MunicipioEscolhido & { dias: number })[];
  /** Horas de passeio por dia usadas no plano (o salvamento manda as mesmas). */
  horasDisponiveis: number;
  kmPorDia: number;
  horasPorDia: number | null;
  comVolta: boolean;
  consumoKmPorLitro: number | null;
  precoLitroCentavos: number | null;
  pernas: PernaPlanejada[];
  combustivel: { litros: number; custoCentavos: number } | null;
  avisos: string[];
}

/** Viagem gravada no roteiro (o link público não traz consumo nem preço). */
export interface ViagemDoRoteiro {
  origem: MunicipioEscolhido | null;
  kmPorDia: number;
  horasPorDia: number | null;
  comVolta: boolean;
  consumoKmPorLitro?: number | null;
  precoLitroCentavos?: number | null;
}

export interface TrechoDeEstrada {
  dia: number;
  perna: number;
  noite: number | null;
  de: string;
  para: string;
  metros: number;
  segundos: number;
  ocupaODia: boolean;
  noFimDoDia: boolean;
  tracado: [number, number][];
  litros?: number | null;
  custoCentavos?: number | null;
}
