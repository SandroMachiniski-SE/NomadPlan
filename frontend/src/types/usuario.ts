export type TipoConta =
  | "VISITANTE"
  | "MORADOR"
  | "NEGOCIO"
  | "GESTOR"
  | "MODERADOR"
  | "ADMIN";

export type Idioma = "pt-BR" | "en" | "es";

export type PreferenciaAcessibilidade =
  | "mobilidade_reduzida"
  | "deficiencia_visual"
  | "deficiencia_auditiva"
  | "banheiro_adaptado"
  | "estacionamento_reservado";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  tipoConta: TipoConta;
  cidadeBase: string | null;
  interesses: string[];
  idioma: Idioma;
  preferenciasAcessibilidade: PreferenciaAcessibilidade[];
  reputacao: number;
  mfaAtivo: boolean;
  consentimentoEm: string | null;
  dataCriacao: string;
}

export interface RespostaAutenticacao {
  usuario: Usuario;
  token: string;
}

export interface ConfiguracaoMfa {
  segredo: string;
  otpauthUrl: string;
}
