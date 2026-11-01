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

export type PeriodoDoDia = "MANHA" | "TARDE" | "NOITE" | "DIA_INTEIRO";

/**
 * Uma parada: um ponto cadastrado (`ponto`) ou uma atividade livre (`titulo`, sem ponto). A
 * pernoite é onde se dorme naquela noite (uma por dia, sempre no fim dele).
 */
export interface ItemRoteiro {
  id: number;
  idRoteiro: number;
  idPonto: number | null;
  /** Dia do roteiro (1, 2, 3...); a ordem vale dentro de cada dia. */
  dia: number;
  ordem: number;
  titulo: string | null;
  periodo: PeriodoDoDia | null;
  pernoite: boolean;
  observacao: string | null;
  dataCriacao: string;
  ponto: PontoResumo | null;
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

/** Estrada entre cidades na passagem de um dia para o outro. */
export interface ViagemEntreDias extends Trecho {
  /** Dia que começa com a viagem. */
  dia: number;
  de: string;
  para: string;
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
  /** Cidades das paradas, na ordem da viagem. */
  cidades?: string[];
  viagensEntreDias?: ViagemEntreDias[];
  notas?: string | null;
  orcamentoCentavos?: number | null;
  checklist?: ItemChecklist[];
  orcamento?: ResumoOrcamentoRoteiro;
  /** Papel de quem está vendo: dono, editor ou leitor. */
  meuPapel?: MeuPapel;
  /** Dono do roteiro (útil quando ele foi compartilhado). */
  usuario?: { id: number; nome: string };
  colaboradores?: Colaborador[];
}

export type PapelColaborador = "EDITOR" | "LEITOR";
export type MeuPapel = "DONO" | PapelColaborador;

export interface Colaborador {
  idUsuario: number;
  nome: string;
  papel: PapelColaborador;
}

/** Convite pendente que o dono vê (com o e-mail da pessoa convidada). */
export interface ConviteEnviado {
  id: number;
  email: string;
  papel: PapelColaborador;
  dataCriacao: string;
}

/** Convite recebido por quem está logado. */
export interface ConviteRecebido {
  id: number;
  papel: PapelColaborador;
  dataCriacao: string;
  roteiro: { id: number; nome: string; cidade: string | null };
  convidante: { nome: string };
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
  cidades?: string[];
  viagensEntreDias?: ViagemEntreDias[];
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
  /** O horário foi consultado agora no Google Maps (o cadastro não tem). */
  horarioDoGoogle?: boolean;
  /** Dia do roteiro gerado (1, 2, 3...). */
  dia: number;
}

/** Um dia do roteiro gerado: a cidade e, se ela mudou, a viagem desde a anterior. */
export interface DiaDoRoteiroGerado {
  dia: number;
  cidade: string;
  inicio: string;
  viagem: { de: string; metros: number; minutos: number } | null;
}

export interface RespostaRecomendacao {
  dias: DiaDoRoteiroGerado[];
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
  /** Nome de quem fez a alteração. */
  autor?: string | null;
  dados: {
    nome: string;
    descricao: string | null;
    cidade: string | null;
    dataInicio: string | null;
    dataFim: string | null;
    itens: { idPonto: number; ordem: number; dia?: number; observacao: string | null }[];
  };
}
