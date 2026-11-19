import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoteiroPublico from "./RoteiroPublico";

const respostas = vi.hoisted(() => ({ fila: [] as (() => Promise<unknown>)[], chamadas: 0 }));

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(() => {
      respostas.chamadas += 1;

      return (respostas.fila.shift() ?? (() => Promise.reject({ response: { status: 503 } })))();
    }),
  },
}));
vi.mock("../components/MapaRoteiroCarregavel", () => ({ default: () => null }));

const falha = (status?: number) => () => Promise.reject(status ? { response: { status } } : new Error("Network Error"));
const roteiro = () =>
  Promise.resolve({
    data: { nome: "Serra gaúcha", usuario: { nome: "Ana" }, itens: [], trechosDeEstrada: [], cidades: [], cidade: null, descricao: null },
  });

function abrir() {
  render(
    <MemoryRouter initialEntries={["/roteiro/abc"]}>
      <Routes>
        <Route path="/roteiro/:slug" element={<RoteiroPublico />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoteiroPublico", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    respostas.fila = [];
    respostas.chamadas = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("falha temporária por um momento: tenta de novo e mostra o roteiro", async () => {
    respostas.fila = [falha(503), falha(), roteiro];
    abrir();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText("Serra gaúcha")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("404 é um não existe de verdade, sem novas tentativas", async () => {
    respostas.fila = [falha(404)];
    abrir();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByRole("alert").textContent).toContain("não existe");
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(respostas.chamadas).toBe(1);
  });

  it("falha temporária prolongada: não diz que o roteiro não existe e oferece tentar de novo", async () => {
    respostas.fila = [falha(503), falha(503), falha(503)];
    abrir();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const alerta = screen.getByRole("alert").textContent ?? "";

    expect(alerta).toContain("servidor não respondeu");
    expect(alerta).not.toContain("não existe");

    respostas.fila = [roteiro];
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText("Serra gaúcha")).toBeTruthy();
  });
});
