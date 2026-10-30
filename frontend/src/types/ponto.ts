export type StatusPonto = "RASCUNHO" | "PUBLICADO" | "PENDENTE_VERIFICACAO" | "REJEITADO";

/** Como o registro entrou no sistema (RNF19). */
export type OrigemPonto = "USUARIO" | "IMPORTACAO" | "API";

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
  /** Autor e licença da foto quando ela veio do Wikimedia Commons. */
  imagemCredito?: string | null;
  imagemFonte?: string | null;
  status: StatusPonto;
  seloVerificado: boolean;
  origem?: OrigemPonto;
  /** Elemento do OpenStreetMap de onde vieram os dados ("node/123"). */
  idOsm?: string | null;
  /** Lugar do Overture Maps que completou telefone/site (ou de onde veio a hospedagem). */
  idOverture?: string | null;
  sincronizadoEm?: string | null;
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

/** O que o Google Maps sabe do ponto, consultado na hora (GET /pontos/:id/google). */
export interface InformacoesGoogle {
  disponivel: true;
  horario: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  telefone: string | null;
  site: string | null;
  urlGoogleMaps: string | null;
  acessibilidade: string | null;
  foto: { url: string; autor: string | null; urlAutor: string | null } | null;
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
