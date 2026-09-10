import { createContext } from "react";
import type { Usuario } from "../types/usuario";

export interface DadosRegistro {
  nome: string;
  email: string;
  senha: string;
  cidadeBase?: string;
}

export interface AuthContextValor {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  login: (email: string, senha: string) => Promise<void>;
  registrar: (dados: DadosRegistro) => Promise<void>;
  logout: () => void;
  atualizarPerfil: (dados: {
    nome?: string;
    cidadeBase?: string | null;
    interesses?: string[];
  }) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValor | undefined>(
  undefined,
);
