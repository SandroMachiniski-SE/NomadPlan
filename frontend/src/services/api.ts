import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3333",
});

const CHAVE_TOKEN = "nomadplan.token";

/** Disparado quando a API recusa o token (expirado, conta desativada...). */
export const EVENTO_SESSAO_EXPIRADA = "nomadplan:sessao-expirada";

export function obterToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function salvarToken(token: string): void {
  try {
    localStorage.setItem(CHAVE_TOKEN, token);
  } catch {
    // localStorage indisponível (ex.: navegação privada) — sessão não persiste.
  }
}

export function limparToken(): void {
  try {
    localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // localStorage indisponível — nada a limpar.
  }
}

/** Endereço completo de um arquivo enviado (imagens de pontos e de avaliações). */
export function urlDoArquivo(caminho: string): string {
  return `${api.defaults.baseURL}${caminho}`;
}

api.interceptors.request.use((config) => {
  const token = obterToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// RNF09: se a API recusar um token que o navegador ainda guardava, a sessão acabou —
// avisa a aplicação para voltar ao estado de visitante em vez de falhar em silêncio.
// Erros de login (senha errada) e de rotas públicas não passam por aqui.
api.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    const status = erro?.response?.status;
    const url: string = erro?.config?.url ?? "";
    const rotaDeCredenciais = url.startsWith("/auth/login") || url.startsWith("/auth/registrar");

    if (status === 401 && !rotaDeCredenciais && obterToken()) {
      limparToken();
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
    }

    return Promise.reject(erro);
  },
);

export default api;
