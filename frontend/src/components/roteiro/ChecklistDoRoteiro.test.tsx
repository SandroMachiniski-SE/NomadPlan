import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChecklistDoRoteiro from "./ChecklistDoRoteiro";

const chamadas = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));

vi.mock("../../services/api", () => ({ default: chamadas }));

const itens = [
  { id: 1, texto: "Passaporte", feito: true, ordem: 1 },
  { id: 2, texto: "Reservar hotel", feito: false, ordem: 2 },
];

describe("ChecklistDoRoteiro", () => {
  beforeEach(() => {
    chamadas.post.mockReset().mockResolvedValue({});
    chamadas.patch.mockReset().mockResolvedValue({});
    chamadas.delete.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("mostra quantos itens estão feitos", () => {
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={vi.fn()} />);

    expect(screen.getByText("1 de 2")).toBeTruthy();
  });

  it("sem itens mostra a dica", () => {
    render(<ChecklistDoRoteiro idRoteiro={3} itens={[]} aoMudar={vi.fn()} />);

    expect(screen.getByText(/anote aqui o que não pode ser esquecido/)).toBeTruthy();
  });

  it("marcar um item avisa a API e recarrega o roteiro", async () => {
    const aoMudar = vi.fn();
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={aoMudar} />);

    fireEvent.click(screen.getByLabelText("Reservar hotel"));

    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    expect(chamadas.patch).toHaveBeenCalledWith("/roteiros/3/checklist/2", { feito: true });
  });

  it("adiciona um item novo com o texto sem espaços sobrando", async () => {
    const aoMudar = vi.fn();
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={aoMudar} />);

    fireEvent.change(screen.getByLabelText("Novo item da checklist"), { target: { value: "  Protetor solar " } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    expect(chamadas.post).toHaveBeenCalledWith("/roteiros/3/checklist", { texto: "Protetor solar" });
    expect((screen.getByLabelText("Novo item da checklist") as HTMLInputElement).value).toBe("");
  });

  it("não adiciona item em branco", () => {
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Novo item da checklist"), { target: { value: "   " } });
    fireEvent.submit(screen.getByLabelText("Novo item da checklist").closest("form")!);

    expect(chamadas.post).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Adicionar/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("remove um item", async () => {
    const aoMudar = vi.fn();
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={aoMudar} />);

    fireEvent.click(screen.getByLabelText("Remover Passaporte"));

    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    expect(chamadas.delete).toHaveBeenCalledWith("/roteiros/3/checklist/1");
  });

  it("falha na API mostra o erro", async () => {
    chamadas.delete.mockRejectedValue({ response: { data: { erro: "Sem permissão." } } });
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Remover Passaporte"));

    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão.");
  });

  it("quem só lê não tem botões de edição", () => {
    render(<ChecklistDoRoteiro idRoteiro={3} itens={itens} aoMudar={vi.fn()} somenteLeitura />);

    expect(screen.queryByLabelText("Novo item da checklist")).toBeNull();
    expect(screen.queryByLabelText("Remover Passaporte")).toBeNull();
    expect((screen.getByLabelText("Passaporte") as HTMLInputElement).disabled).toBe(true);
  });
});
