import { useEffect, useState, type ReactNode } from "react";
import api, { limparToken, obterToken, salvarToken } from "../services/api";
import type { Usuario, RespostaAutenticacao } from "../types/usuario";
import { AuthContext, type DadosRegistro } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarSessao() {
      const token = obterToken();

      if (!token) {
        setCarregando(false);
        return;
      }

      try {
        const resposta = await api.get<Usuario>("/auth/me");
        setUsuario(resposta.data);
      } catch {
        limparToken();
        setUsuario(null);
      } finally {
        setCarregando(false);
      }
    }

    carregarSessao();
  }, []);

  async function login(email: string, senha: string) {
    const resposta = await api.post<RespostaAutenticacao>("/auth/login", {
      email,
      senha,
    });

    salvarToken(resposta.data.token);
    setUsuario(resposta.data.usuario);
  }

  async function registrar(dados: DadosRegistro) {
    const resposta = await api.post<RespostaAutenticacao>(
      "/auth/registrar",
      dados,
    );

    salvarToken(resposta.data.token);
    setUsuario(resposta.data.usuario);
  }

  function logout() {
    limparToken();
    setUsuario(null);
  }

  async function atualizarPerfil(dados: {
    nome?: string;
    cidadeBase?: string | null;
    interesses?: string[];
  }) {
    const resposta = await api.put<Usuario>("/auth/me", dados);
    setUsuario(resposta.data);
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        carregando,
        autenticado: usuario !== null,
        login,
        registrar,
        logout,
        atualizarPerfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

