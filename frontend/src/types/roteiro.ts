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

export interface ItemRoteiro {
  id: number;
  idRoteiro: number;
  idPonto: number;
  ordem: number;
  observacao: string | null;
  dataCriacao: string;
  ponto: PontoResumo;
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
}

export interface RespostaRecomendacao {
  pontos: PontoRecomendado[];
  fallbackUsado: boolean;
}
