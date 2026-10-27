import type { TipoConta } from "./usuario";

export interface UsuarioAdmin {
  id: number;
  nome: string;
  email: string;
  tipoConta: TipoConta;
  reputacao: number;
  ativo: boolean;
  dataCriacao: string;
}

export interface LogAuditoria {
  id: number;
  idUsuario: number | null;
  acao: string;
  entidade: string;
  idEntidade: number | null;
  detalhes: Record<string, unknown> | null;
  dataCriacao: string;
  usuario?: { id: number; nome: string } | null;
}

export interface Metricas {
  totalUsuarios: number;
  usuariosPorTipo: { tipoConta: TipoConta; _count: number }[];
  totalPontos: number;
  pontosPorStatus: { status: string; _count: number }[];
  pontosPublicados: number;
  totalRoteiros: number;
  roteirosPublicos: number;
  totalAvaliacoes: number;
  totalSugestoesPendentes: number;
  totalVerificacoesPendentes: number;
  usuariosAtivos7d: number;
  usuariosAtivos30d: number;
}

export const TIPOS_EVENTO_USO = [
  "busca",
  "roteiro_gerado",
  "roteiro_criado",
  "cadastro",
  "login",
  "avaliacao",
  "ponto_cadastrado",
  "ponto_salvo",
] as const;

export type TipoEventoUso = (typeof TIPOS_EVENTO_USO)[number];

export type PontoSerieUso = { dia: string } & Record<TipoEventoUso, number>;

export interface RespostaUso {
  dias: number;
  serie: PontoSerieUso[];
}

export interface Notificacao {
  id: number;
  idUsuario: number;
  mensagem: string;
  link: string | null;
  lida: boolean;
  dataCriacao: string;
}

export interface RespostaNotificacoes {
  total: number;
  naoLidas: number;
  dados: Notificacao[];
}
