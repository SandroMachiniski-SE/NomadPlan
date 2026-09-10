import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3333",
});

const CHAVE_TOKEN = "nomadplan.token";

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

api.interceptors.request.use((config) => {
  const token = obterToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
