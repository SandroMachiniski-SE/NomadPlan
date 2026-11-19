import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const respostas = vi.hoisted(() => ({ fila: [] as (() => Promise<unknown>)[] }));

vi.mock("../services/api", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../services/api")>();

  return {
    ...original,
    default: {
      post: vi.fn(() => (respostas.fila.shift() ?? (() => Promise.reject(new Error("sem resposta combinada"))))()),
      get: vi.fn(),
      put: vi.fn(),
    },
  };
});

const falha = (status?: number) => () => Promise.reject(status ? { response: { status } } : new Error("Network Error"));
const renovada = () =>
  Promise.resolve({ data: { token: "token-novo", usuario: { id: 1, nome: "Ana", email: "ana@exemplo.test", tipoConta: "VISITANTE", interesses: [] } } });

function Sessao() {
  const { autenticado, carregando, sessaoIndisponivel } = useAuth();

  return <p>{carregando ? "carregando" : autenticado ? "logada" : sessaoIndisponivel ? "indisponivel" : "visitante"}</p>;
}

async function abrirComToken() {
  localStorage.setItem("nomadplan.token", "token-antigo");
  render(
    <AuthProvider>
      <Sessao />
    </AuthProvider>,
  );
  // As novas tentativas esperam alguns segundos: o relógio de mentira avança.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
}

describe("sessão ao abrir o site", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    respostas.fila = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("servidor indisponível (503) por um momento: tenta de novo e a pessoa continua logada", async () => {
    respostas.fila = [falha(503), falha(), renovada];

    await abrirComToken();

    expect(screen.getByText("logada")).toBeTruthy();
    expect(localStorage.getItem("nomadplan.token")).toBe("token-novo");
  });

  it("sessão recusada (401): o token é apagado na hora, sem novas tentativas", async () => {
    respostas.fila = [falha(401), renovada];

    await abrirComToken();

    expect(screen.getByText("visitante")).toBeTruthy();
    expect(localStorage.getItem("nomadplan.token")).toBeNull();
    expect(respostas.fila.length).toBe(1);
  });

  it("servidor fora do ar em todas as tentativas: o token fica guardado e a sessão é marcada como indisponível", async () => {
    respostas.fila = [falha(503), falha(503), falha(503)];

    await abrirComToken();

    expect(screen.getByText("indisponivel")).toBeTruthy();
    expect(localStorage.getItem("nomadplan.token")).toBe("token-antigo");
  });

  it("queda prolongada: a sessão é conferida de novo sozinha e volta quando o servidor responde", async () => {
    // Três falhas na abertura e uma quarta na primeira conferência automática; a quinta resposta chega.
    respostas.fila = [falha(503), falha(503), falha(503), falha(), renovada];

    await abrirComToken();
    expect(screen.getByText("indisponivel")).toBeTruthy();

    // Dentro do act os efeitos só rodam ao final: a conferência automática começa a contar daqui.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(screen.getByText("logada")).toBeTruthy();
    expect(localStorage.getItem("nomadplan.token")).toBe("token-novo");
  });

  it("na conferência automática, um 401 encerra a sessão guardada", async () => {
    respostas.fila = [falha(503), falha(503), falha(503), falha(), falha(401)];

    await abrirComToken();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(screen.getByText("visitante")).toBeTruthy();
    expect(localStorage.getItem("nomadplan.token")).toBeNull();
  });
});
