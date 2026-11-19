import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GraficoUso from "./GraficoUso";

const chamadas = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../services/api", () => ({ default: chamadas }));

const serie = (dia: string, busca: number) => ({
  dia,
  busca,
  roteiro_gerado: 0,
  roteiro_criado: 0,
  cadastro: 0,
  login: 0,
  avaliacao: 0,
  ponto_cadastrado: 0,
  ponto_salvo: 0,
});

describe("GraficoUso", () => {
  beforeEach(() => {
    chamadas.get.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  it("mostra o total de cada tipo de evento no período", async () => {
    chamadas.get.mockResolvedValue({ data: { dias: 30, serie: [serie("2026-11-01", 3), serie("2026-11-02", 4)] } });
    render(<GraficoUso />);

    expect(await screen.findByLabelText("Buscas: 7 nos últimos 30 dias")).toBeTruthy();
    expect(chamadas.get).toHaveBeenCalledWith("/admin/metricas/uso", { params: { dias: 30 } });
  });

  it("trocar o período busca de novo", async () => {
    chamadas.get.mockResolvedValue({ data: { dias: 7, serie: [] } });
    render(<GraficoUso />);
    await waitFor(() => expect(chamadas.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));

    await waitFor(() => expect(chamadas.get).toHaveBeenLastCalledWith("/admin/metricas/uso", { params: { dias: 7 } }));
  });

  it("falha ao carregar mostra o erro", async () => {
    chamadas.get.mockRejectedValue(new Error("Network Error"));
    render(<GraficoUso />);

    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar o uso diário.");
  });

  it("exporta o CSV baixando o arquivo", async () => {
    chamadas.get
      .mockResolvedValueOnce({ data: { dias: 30, serie: [] } })
      .mockResolvedValueOnce({ data: new Blob(["dia,busca"]) });
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<GraficoUso />);
    await waitFor(() => expect(chamadas.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));

    await waitFor(() => expect(clique).toHaveBeenCalled());
    expect(chamadas.get).toHaveBeenLastCalledWith("/admin/metricas/uso.csv", { params: { dias: 30 }, responseType: "blob" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("falha na exportação avisa a pessoa", async () => {
    chamadas.get
      .mockResolvedValueOnce({ data: { dias: 30, serie: [] } })
      .mockRejectedValueOnce({ response: { data: { erro: "Sem permissão." } } });
    render(<GraficoUso />);
    await waitFor(() => expect(chamadas.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Sem permissão."));
  });
});
