import { useCallback, useEffect, useState, type ReactNode } from "react";
import api, { EVENTO_SESSAO_EXPIRADA, limparToken, obterToken, salvarToken } from "../services/api";
import type { Usuario, RespostaAutenticacao } from "../types/usuario";
import {
  AuthContext,
  type DadosPerfil,
  type DadosRegistro,
  type ResultadoLogin,
} from "./auth-context";

// RNF09: a sessão do servidor expira, então enquanto o usuário usa o sistema o token é
// renovado de tempos em tempos (só funciona enquanto o token atual ainda vale).
const INTERVALO_RENOVACAO_MS = 30 * 60 * 1000;
// Ao abrir o site com o servidor indisponível (503 durante um deploy, falha de rede), a sessão
// é conferida de novo depois destas esperas, em vez de a pessoa ser deslogada.
const ESPERAS_DA_RENOVACAO_MS = [1000, 3000];

/** Só um "não" do servidor (token recusado) encerra a sessão; indisponibilidade não. */
function sessaoRecusada(erro: unknown): boolean {
  const status = (erro as { response?: { status?: number } } | null)?.response?.status;

  return status === 401 || status === 403;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const [saiuManualmente, setSaiuManualmente] = useState(false);

  const renovarSessao = useCallback(async () => {
    const resposta = await api.post<RespostaAutenticacao>("/auth/renovar");

    salvarToken(resposta.data.token);
    setUsuario(resposta.data.usuario);
  }, []);

  useEffect(() => {
    let ativo = true;

    async function carregarSessao() {
      if (!obterToken()) {
        setCarregando(false);
        return;
      }

      try {
        for (let tentativa = 0; ativo; tentativa += 1) {
          try {
            await renovarSessao();
            return;
          } catch (erro) {
            if (sessaoRecusada(erro)) {
              limparToken();
              setUsuario(null);
              return;
            }

            // Servidor fora do ar em todas as tentativas: segue como visitante, mas guarda o token
            // para a próxima visita.
            if (tentativa >= ESPERAS_DA_RENOVACAO_MS.length) return;

            await new Promise((resolver) => setTimeout(resolver, ESPERAS_DA_RENOVACAO_MS[tentativa]));
          }
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregarSessao();

    return () => {
      ativo = false;
    };
  }, [renovarSessao]);

  useEffect(() => {
    function aoExpirar() {
      setUsuario(null);
      setSessaoExpirada(true);
    }

    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);

    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, []);

  const autenticado = usuario !== null;

  useEffect(() => {
    if (!autenticado) {
      return;
    }

    const temporizador = window.setInterval(() => {
      renovarSessao().catch(() => {
        // Se a renovação falhar por sessão inválida, o interceptor já encerra a sessão.
      });
    }, INTERVALO_RENOVACAO_MS);

    return () => window.clearInterval(temporizador);
  }, [autenticado, renovarSessao]);

  async function login(email: string, senha: string, codigoMfa?: string): Promise<ResultadoLogin> {
    const resposta = await api.post<RespostaAutenticacao | { mfaNecessario: true }>("/auth/login", {
      email,
      senha,
      ...(codigoMfa ? { codigoMfa } : {}),
    });

    if ("mfaNecessario" in resposta.data) {
      return { mfaNecessario: true };
    }

    salvarToken(resposta.data.token);
    setUsuario(resposta.data.usuario);
    setSessaoExpirada(false);
    setSaiuManualmente(false);

    return { mfaNecessario: false };
  }

  async function registrar(dados: DadosRegistro) {
    const resposta = await api.post<RespostaAutenticacao>(
      "/auth/registrar",
      dados,
    );

    salvarToken(resposta.data.token);
    setUsuario(resposta.data.usuario);
    setSessaoExpirada(false);
    setSaiuManualmente(false);
  }

  function logout() {
    limparToken();
    setUsuario(null);
    setSessaoExpirada(false);
    setSaiuManualmente(true);
  }

  async function atualizarPerfil(dados: DadosPerfil) {
    const resposta = await api.put<Usuario>("/auth/me", dados);
    setUsuario(resposta.data);
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        carregando,
        autenticado,
        login,
        registrar,
        logout,
        atualizarPerfil,
        definirUsuario: setUsuario,
        sessaoExpirada,
        saiuManualmente,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
