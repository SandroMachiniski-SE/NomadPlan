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
