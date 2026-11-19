import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Roteiro } from "../../types/roteiro";
import Colaboradores from "./Colaboradores";

const chamadas = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));

vi.mock("../../services/api", () => ({ default: chamadas }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ usuario: { id: 20, nome: "Bia" } }) }));

function roteiro(meuPapel: "DONO" | "EDITOR" | "LEITOR"): Roteiro {
  return {
    id: 4,
    meuPapel,
    usuario: { nome: "Ana" },
    colaboradores: [{ idUsuario: 20, nome: "Bia", papel: "EDITOR" }],
  } as unknown as Roteiro;
}

describe("Colaboradores", () => {
  beforeEach(() => {
    chamadas.get.mockReset().mockResolvedValue({ data: { dados: [{ id: 9, email: "caio@exemplo.com", papel: "LEITOR", dataCriacao: "" }] } });
    chamadas.post.mockReset().mockResolvedValue({});
    chamadas.patch.mockReset().mockResolvedValue({});
    chamadas.delete.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("o dono vê os participantes e os convites pendentes", async () => {
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={vi.fn()} aoSair={vi.fn()} />);

    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText(/Bia/)).toBeTruthy();
    expect(await screen.findByText(/caio@exemplo.com/)).toBeTruthy();
  });

  it("o dono convida por e-mail com o papel escolhido", async () => {
    const aoMudar = vi.fn();
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={aoMudar} aoSair={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("E-mail para convidar"), { target: { value: " duda@exemplo.com " } });
    fireEvent.change(screen.getByLabelText("Papel do convidado"), { target: { value: "LEITOR" } });
    fireEvent.click(screen.getByRole("button", { name: /Convidar/ }));

    expect(await screen.findByText(/Convite enviado para duda@exemplo.com/)).toBeTruthy();
    expect(chamadas.post).toHaveBeenCalledWith("/roteiros/4/convites", { email: "duda@exemplo.com", papel: "LEITOR" });
    expect(aoMudar).toHaveBeenCalled();
  });

  it("o dono troca o papel de alguém", async () => {
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={vi.fn()} aoSair={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Papel de Bia"), { target: { value: "LEITOR" } });

    await waitFor(() => expect(chamadas.patch).toHaveBeenCalledWith("/roteiros/4/colaboradores/20", { papel: "LEITOR" }));
  });

  it("o dono remove alguém depois de confirmar", async () => {
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={vi.fn()} aoSair={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() => expect(chamadas.delete).toHaveBeenCalledWith("/roteiros/4/colaboradores/20"));
  });

  it("não remove se a pessoa desistir na confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={vi.fn()} aoSair={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    expect(chamadas.delete).not.toHaveBeenCalled();
  });

  it("o dono cancela um convite pendente", async () => {
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={vi.fn()} aoSair={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(chamadas.delete).toHaveBeenCalledWith("/roteiros/4/convites/9"));
  });

  it("falha ao convidar mostra o motivo", async () => {
    chamadas.post.mockRejectedValue({ response: { data: { erro: "Essa pessoa já participa." } } });
    render(<Colaboradores roteiro={roteiro("DONO")} aoMudar={vi.fn()} aoSair={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("E-mail para convidar"), { target: { value: "bia@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Convidar/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("Essa pessoa já participa.");
  });

  it("quem não é dono não convida nem busca convites, mas pode sair", async () => {
    const aoSair = vi.fn();
    render(<Colaboradores roteiro={roteiro("EDITOR")} aoMudar={vi.fn()} aoSair={aoSair} />);

    expect(screen.queryByLabelText("E-mail para convidar")).toBeNull();
    expect(chamadas.get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Sair deste roteiro/ }));

    await waitFor(() => expect(aoSair).toHaveBeenCalled());
    expect(chamadas.delete).toHaveBeenCalledWith("/roteiros/4/colaboradores/20");
  });
});
