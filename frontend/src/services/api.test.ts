import { beforeEach, describe, expect, it, vi } from "vitest";
import api, { EVENTO_SESSAO_EXPIRADA, limparToken, obterToken, salvarToken, urlDoArquivo } from "./api";

type Interceptador = { handlers: { fulfilled: (v: unknown) => unknown; rejected: (e: unknown) => unknown }[] };

const requisicao = (api.interceptors.request as unknown as Interceptador).handlers[0];
const resposta = (api.interceptors.response as unknown as Interceptador).handlers[0];

type Config = { headers: Record<string, string> };

describe("api", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("guarda, lê e apaga o token", () => {
    expect(obterToken()).toBeNull();
    salvarToken("abc");
    expect(obterToken()).toBe("abc");
    limparToken();
    expect(obterToken()).toBeNull();
  });

  it("sem localStorage nada quebra", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(obterToken()).toBeNull();
    expect(() => salvarToken("x")).not.toThrow();
    expect(() => limparToken()).not.toThrow();
  });

  it("arquivos enviados ganham o endereço da API; os já completos ficam como estão", () => {
    expect(urlDoArquivo("/uploads/a.png")).toBe(`${api.defaults.baseURL}/uploads/a.png`);
    expect(urlDoArquivo("https://commons.wikimedia.org/a.jpg")).toBe("https://commons.wikimedia.org/a.jpg");
  });

  it("envia o token no cabeçalho quando há sessão", () => {
    salvarToken("abc");
    const config = requisicao.fulfilled({ headers: {} }) as Config;

    expect(config.headers.Authorization).toBe("Bearer abc");
  });

  it("sem sessão não envia cabeçalho de autorização", () => {
    const config = requisicao.fulfilled({ headers: {} }) as Config;

    expect(config.headers.Authorization).toBeUndefined();
  });

  it("401 numa rota autenticada encerra a sessão e avisa a aplicação", async () => {
    salvarToken("abc");
    const aviso = vi.fn();
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aviso);

    await expect(resposta.rejected({ response: { status: 401 }, config: { url: "/roteiros" } })).rejects.toBeTruthy();

    window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aviso);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(obterToken()).toBeNull();
  });

  it("401 de login (senha errada) não derruba a sessão", async () => {
    salvarToken("abc");

    await expect(resposta.rejected({ response: { status: 401 }, config: { url: "/auth/login" } })).rejects.toBeTruthy();

    expect(obterToken()).toBe("abc");
  });

  it("respostas boas passam direto", () => {
    expect(resposta.fulfilled("ok")).toBe("ok");
  });
});
