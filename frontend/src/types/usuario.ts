export type TipoConta =
  | "VISITANTE"
  | "MORADOR"
  | "NEGOCIO"
  | "GESTOR"
  | "MODERADOR"
  | "ADMIN";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  tipoConta: TipoConta;
  cidadeBase: string | null;
  interesses: string[];
  dataCriacao: string;
}

export interface RespostaAutenticacao {
  usuario: Usuario;
  token: string;
}
