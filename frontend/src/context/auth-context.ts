import { createContext } from "react";
import type { Idioma, PreferenciaAcessibilidade, TipoConta, Usuario } from "../types/usuario";

export interface DadosRegistro {
  nome: string;
  email: string;
  senha: string;
  cidadeBase?: string;
  tipoConta?: Extract<TipoConta, "VISITANTE" | "MORADOR" | "NEGOCIO" | "GESTOR">;
  aceitouPolitica: boolean;
}

export interface DadosPerfil {
  nome?: string;
  cidadeBase?: string | null;
  interesses?: string[];
  idioma?: Idioma;
  preferenciasAcessibilidade?: PreferenciaAcessibilidade[];
}

export interface ResultadoLogin {
  /** A senha confere, mas a conta exige o código do aplicativo autenticador. */
  mfaNecessario: boolean;
}

export interface AuthContextValor {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  login: (email: string, senha: string, codigoMfa?: string) => Promise<ResultadoLogin>;
  registrar: (dados: DadosRegistro) => Promise<void>;
  logout: () => void;
  atualizarPerfil: (dados: DadosPerfil) => Promise<void>;
  /** Troca o usuário em memória por uma versão já atualizada pela API (consentimento, 2FA...). */
  definirUsuario: (usuario: Usuario) => void;
  /** Verdadeiro quando a sessão foi encerrada pelo servidor (token vencido ou conta desativada). */
  sessaoExpirada: boolean;
  /** Verdadeiro logo após a pessoa escolher sair (ou excluir a conta): rotas protegidas voltam ao início, não ao login. */
  saiuManualmente: boolean;
}

export const AuthContext = createContext<AuthContextValor | undefined>(
  undefined,
);
