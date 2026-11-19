import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumoOrcamentoRoteiro } from "../../types/roteiro";
import PainelOrcamento from "./PainelOrcamento";

const chamadas = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock("../../services/api", () => ({ default: { patch: chamadas.patch } }));

function resumo(extra: Partial<ResumoOrcamentoRoteiro> = {}): ResumoOrcamentoRoteiro {
  return {
    totalCentavos: 50_000,
    porDia: { 1: 30_000, 2: 20_000 },
    orcamentoCentavos: null,
    restanteCentavos: null,
    paradasSemCusto: 0,
    ...extra,
  };
}

const campo = () => screen.getByPlaceholderText("Ex.: 1500,00") as HTMLInputElement;

describe("PainelOrcamento", () => {
  beforeEach(() => {
    chamadas.patch.mockReset().mockResolvedValue({ data: {} });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("mostra o total e o gasto de cada dia", () => {
    render(<PainelOrcamento idRoteiro={1} resumo={resumo()} dataInicio={null} aoSalvar={vi.fn()} />);

    expect(screen.getByTestId("orcamento-total").textContent).toContain("500,00");
    expect(screen.getByText("Dia 1")).toBeTruthy();
    expect(screen.getByText("Dia 2")).toBeTruthy();
  });

  it("dentro do teto mostra quanto ainda cabe", () => {
    render(
      <PainelOrcamento
        idRoteiro={1}
        resumo={resumo({ orcamentoCentavos: 100_000, restanteCentavos: 50_000 })}
        dataInicio={null}
        aoSalvar={vi.fn()}
      />,
    );

    expect(screen.getByText(/Ainda cabem/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(campo().value).toBe("1000,00");
  });

  it("estourou o teto: avisa o quanto passou", () => {
    render(
      <PainelOrcamento
        idRoteiro={1}
        resumo={resumo({ orcamentoCentavos: 40_000, restanteCentavos: -10_000 })}
        dataInicio={null}
        aoSalvar={vi.fn()}
      />,
    );

    expect(screen.getByText(/Acima do teto em/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("mostra o combustível da viagem de carro e as paradas sem custo", () => {
    render(
      <PainelOrcamento
        idRoteiro={1}
        resumo={resumo({ combustivelCentavos: 12_000, paradasSemCusto: 2 })}
        dataInicio={null}
        aoSalvar={vi.fn()}
      />,
    );

    expect(screen.getByText("Combustível da viagem de carro")).toBeTruthy();
    expect(screen.getByText(/2 paradas ainda estão/)).toBeTruthy();
  });

  it("salva o teto em centavos", async () => {
    const aoSalvar = vi.fn();
    render(<PainelOrcamento idRoteiro={9} resumo={resumo()} dataInicio={null} aoSalvar={aoSalvar} />);

    fireEvent.change(campo(), { target: { value: "1500,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar teto" }));

    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    expect(chamadas.patch).toHaveBeenCalledWith("/roteiros/9/anotacoes", { orcamentoCentavos: 150_050 });
  });

  it("campo vazio remove o teto (nulo)", async () => {
    const aoSalvar = vi.fn();
    render(<PainelOrcamento idRoteiro={9} resumo={resumo()} dataInicio={null} aoSalvar={aoSalvar} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar teto" }));

    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    expect(chamadas.patch).toHaveBeenCalledWith("/roteiros/9/anotacoes", { orcamentoCentavos: null });
  });

  it("o campo só aceita número bem digitado", () => {
    render(<PainelOrcamento idRoteiro={9} resumo={resumo()} dataInicio={null} aoSalvar={vi.fn()} />);

    fireEvent.change(campo(), { target: { value: "12" } });
    fireEvent.change(campo(), { target: { value: "12abc" } });

    expect(campo().value).toBe("12");
  });

  it("valor acima do limite é recusado sem chamar a API", () => {
    render(<PainelOrcamento idRoteiro={9} resumo={resumo()} dataInicio={null} aoSalvar={vi.fn()} />);

    fireEvent.change(campo(), { target: { value: "2000000,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar teto" }));

    expect(screen.getByRole("alert").textContent).toContain("valor válido");
    expect(chamadas.patch).not.toHaveBeenCalled();
  });

  it("erro da API aparece na tela", async () => {
    chamadas.patch.mockRejectedValue({ response: { data: { erro: "Roteiro bloqueado." } } });
    render(<PainelOrcamento idRoteiro={9} resumo={resumo()} dataInicio={null} aoSalvar={vi.fn()} />);

    fireEvent.change(campo(), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar teto" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Roteiro bloqueado.");
  });

  it("quem só lê não vê o formulário do teto", () => {
    render(<PainelOrcamento idRoteiro={9} resumo={resumo()} dataInicio={null} aoSalvar={vi.fn()} somenteLeitura />);

    expect(screen.queryByPlaceholderText("Ex.: 1500,00")).toBeNull();
  });
});
