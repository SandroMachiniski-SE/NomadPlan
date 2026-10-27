export interface PontoResumo {
  id: number;
  nome: string;
  descricao: string | null;
  categoria: string;
  cidade: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  faixaPreco: string | null;
  acessibilidade: string | null;
  siteOficial: string | null;
  telefoneContato: string | null;
  horarioFuncionamento: string | null;
  imagemUrl: string | null;
  seloVerificado: boolean;
}

/** Trecho estimado (em linha reta, ~25 km/h) desde a parada anterior do mesmo dia. */
export interface Trecho {
  metros: number;
  minutos: number;
}

export interface ItemRoteiro {
  id: number;
  idRoteiro: number;
  idPonto: number;
  /** Dia do roteiro (1, 2, 3...); a ordem vale dentro de cada dia. */
  dia: number;
  ordem: number;
  observacao: string | null;
  dataCriacao: string;
  ponto: PontoResumo;
  deslocamento: Trecho | null;
  /** Custo previsto da parada, em centavos (só para o dono do roteiro). */
  custoCentavos?: number | null;
}

export interface ItemChecklist {
  id: number;
  texto: string;
  feito: boolean;
  ordem: number;
}

export interface ResumoOrcamentoRoteiro {
  totalCentavos: number;
  porDia: Record<number, number>;
  orcamentoCentavos: number | null;
  /** Quanto ainda cabe no teto (negativo se estourou). */
  restanteCentavos: number | null;
  paradasSemCusto: number;
}

export interface ResumoOtimizacao {
  alterado: boolean;
  dias: { dia: number; alterado: boolean; metrosAntes: number; metrosDepois: number }[];
}

export interface Roteiro {
  id: number;
  nome: string;
  descricao: string | null;
  cidade: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  idUsuario: number;
  publico: boolean;
  slugPublico: string | null;
  dataCriacao: string;
  dataAtualizacao: string;
  itens: ItemRoteiro[];
  notas?: string | null;
  orcamentoCentavos?: number | null;
  checklist?: ItemChecklist[];
  orcamento?: ResumoOrcamentoRoteiro;
}

export interface RespostaRoteiros {
  total: number;
  dados: Roteiro[];
}

export interface RoteiroPublico {
  id: number;
  nome: string;
  descricao: string | null;
  cidade: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  dataCriacao: string;
  usuario: { nome: string };
  itens: ItemRoteiro[];
}

export interface PontoRecomendado extends PontoResumo {
  distanciaMetros: number | null;
  ordem: number;
  /** Horários em ISO 8601 (RF05/RB07). */
  chegadaEstimada: string;
  saidaEstimada: string;
  deslocamentoMin: number;
  esperaMin: number;
  duracaoVisitaMin: number;
}

export interface RespostaRecomendacao {
  pontos: PontoRecomendado[];
  /** Avisos do planejador, por exemplo pontos que ficaram de fora por estarem fechados. */
  avisos: string[];
  inicio: string;
  fallbackUsado: boolean;
}

export interface VersaoRoteiro {
  id: number;
  idRoteiro: number;
  motivo: string;
  idAutor: number | null;
  dataCriacao: string;
  dados: {
    nome: string;
    descricao: string | null;
    cidade: string | null;
    dataInicio: string | null;
    dataFim: string | null;
    itens: { idPonto: number; ordem: number; dia?: number; observacao: string | null }[];
  };
}
