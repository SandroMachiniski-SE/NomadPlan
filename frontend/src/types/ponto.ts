export type StatusPonto = "RASCUNHO" | "PUBLICADO" | "PENDENTE_VERIFICACAO" | "REJEITADO";

export interface Ponto {
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
  status: StatusPonto;
  seloVerificado: boolean;
  motivoRejeicao?: string | null;
  dataCriacao?: string;
  dataAtualizacao?: string;
  idResponsavel?: number | null;
  responsavel?: { id: number; nome: string } | null;
  distanciaMetros?: number;
  versao?: number;
  mediaAvaliacao?: number | null;
  totalAvaliacoes?: number;
  /** Só no detalhe, para quem está logado. */
  salvo?: boolean;
  /** Só nas recomendações para o usuário. */
  motivoRecomendacao?: "usuarios_semelhantes" | "interesses";
}

export interface RespostaPontos {
  total: number;
  dados: Ponto[];
  /** A busca veio do cache porque o banco demorou a responder (AF02). */
  desatualizado?: boolean;
}

export type Ordenacao = "relevancia" | "distancia" | "nome" | "avaliacao";

export interface SugestaoCriada extends SugestaoEdicao {
  retidaParaModeracao?: boolean;
  aviso?: string;
  aplicadaAutomaticamente?: boolean;
  motivoAplicacao?: "dono_verificado" | "reputacao" | "confirmacoes";
}

export interface SugestaoEdicao {
  id: number;
  idPonto: number;
  idAutor: number;
  camposPropostos: Record<string, string>;
  mensagem: string | null;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  motivoRejeicao: string | null;
  motivoRetencao?: string | null;
  dataCriacao: string;
  autor?: { id: number; nome: string };
  ponto?: { id: number; nome: string; cidade: string };
}

export interface SolicitacaoVerificacao {
  id: number;
  idPonto: number;
  idSolicitante: number;
  comprovacao: string | null;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  motivoRejeicao: string | null;
  dataCriacao: string;
  solicitante?: { id: number; nome: string };
  ponto?: { id: number; nome: string; cidade: string };
}

export interface Avaliacao {
  id: number;
  idPonto: number;
  idAutor: number;
  nota: number;
  comentario: string | null;
  fotoUrl: string | null;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  motivoRejeicao: string | null;
  motivoRetencao?: string | null;
  dataCriacao: string;
  autor?: { id: number; nome: string };
  ponto?: { id: number; nome: string; cidade: string };
}

export interface RespostaAvaliacoes {
  total: number;
  media: number | null;
  dados: Avaliacao[];
}

export interface VersaoPonto {
  id: number;
  idPonto: number;
  dados: Record<string, unknown>;
  idAutor: number | null;
  motivo: string;
  dataCriacao: string;
}
