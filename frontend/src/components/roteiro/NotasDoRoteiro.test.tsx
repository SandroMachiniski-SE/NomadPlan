import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotasDoRoteiro from "./NotasDoRoteiro";

const chamadas = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock("../../services/api", () => ({ default: { patch: chamadas.patch } }));

const digitar = (valor: string) => fireEvent.change(screen.getByLabelText("Notas do roteiro"), { target: { value: valor } });
const salvar = () => fireEvent.click(screen.getByRole("button", { name: "Salvar notas" }));

describe("NotasDoRoteiro", () => {
  beforeEach(() => {
    chamadas.patch.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("grava as notas junto com o que estava salvo quando a edição começou", async () => {
    chamadas.patch.mockResolvedValue({ data: {} });
    const aoSalvar = vi.fn();
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={aoSalvar} />);

    digitar("  novas  ");
    salvar();

    expect(await screen.findByText(/Notas salvas\./)).toBeTruthy();
    expect(chamadas.patch).toHaveBeenCalledWith("/roteiros/7/anotacoes", { notas: "novas", notasAnteriores: "antigas" });
    expect(aoSalvar).toHaveBeenCalled();
  });

  it("texto vazio apaga as notas (nulo)", async () => {
    chamadas.patch.mockResolvedValue({ data: {} });
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={vi.fn()} />);

    digitar("   ");
    salvar();

    await screen.findByText(/Notas salvas\./);
    expect(chamadas.patch.mock.calls[0][1].notas).toBeNull();
  });

  it("conflito (409) mostra as notas atuais e não apaga nada", async () => {
    chamadas.patch.mockRejectedValue({ response: { status: 409, data: { notasAtuais: "da outra aba" } } });
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={vi.fn()} />);

    digitar("minhas");
    salvar();

    expect((await screen.findByRole("alert")).textContent).toContain("mudaram em outra aba");
    expect(screen.getByText("da outra aba")).toBeTruthy();
    expect((screen.getByLabelText("Notas do roteiro") as HTMLTextAreaElement).value).toBe("minhas");
  });

  it("no conflito, usar as notas atuais troca o texto pelo do servidor", async () => {
    chamadas.patch.mockRejectedValue({ response: { status: 409, data: { notasAtuais: "da outra aba" } } });
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={vi.fn()} />);

    digitar("minhas");
    salvar();
    fireEvent.click(await screen.findByRole("button", { name: "Usar as notas atuais" }));

    expect((screen.getByLabelText("Notas do roteiro") as HTMLTextAreaElement).value).toBe("da outra aba");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("no conflito, salvar as minhas por cima reenvia com a base do servidor", async () => {
    chamadas.patch
      .mockRejectedValueOnce({ response: { status: 409, data: { notasAtuais: "da outra aba" } } })
      .mockResolvedValueOnce({ data: {} });
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={vi.fn()} />);

    digitar("minhas");
    salvar();
    fireEvent.click(await screen.findByRole("button", { name: "Salvar as minhas por cima" }));

    expect(await screen.findByText(/Notas salvas\./)).toBeTruthy();
    expect(chamadas.patch).toHaveBeenLastCalledWith("/roteiros/7/anotacoes", {
      notas: "minhas",
      notasAnteriores: "da outra aba",
    });
  });

  it("conflito com as notas atuais vazias mostra '(vazias)'", async () => {
    chamadas.patch.mockRejectedValue({ response: { status: 409, data: { notasAtuais: null } } });
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={vi.fn()} />);

    digitar("minhas");
    salvar();

    expect(await screen.findByText("(vazias)")).toBeTruthy();
  });

  it("outro erro mostra a mensagem da API", async () => {
    chamadas.patch.mockRejectedValue({ response: { status: 500, data: { erro: "Falha no servidor." } } });
    render(<NotasDoRoteiro idRoteiro={7} notas={null} aoSalvar={vi.fn()} />);

    digitar("x");
    salvar();

    expect((await screen.findByRole("alert")).textContent).toContain("Falha no servidor.");
  });

  it("quem só lê não vê o botão de salvar e não edita", () => {
    render(<NotasDoRoteiro idRoteiro={7} notas="antigas" aoSalvar={vi.fn()} somenteLeitura />);

    expect(screen.queryByRole("button", { name: "Salvar notas" })).toBeNull();
    expect((screen.getByLabelText("Notas do roteiro") as HTMLTextAreaElement).readOnly).toBe(true);
  });
});
