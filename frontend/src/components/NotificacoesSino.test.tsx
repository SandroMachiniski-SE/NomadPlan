import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificacoesSino from "./NotificacoesSino";

const chamadas = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock("../services/api", () => ({ default: chamadas }));

const nota = (id: number, lida: boolean, link: string | null = null) => ({
  id,
  idUsuario: 1,
  mensagem: `Aviso ${id}`,
  link,
  lida,
  dataCriacao: "2026-11-01T12:00:00Z",
});

function abrir() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<NotificacoesSino />} />
        <Route path="/pontos/9" element={<p>Ficha do ponto</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NotificacoesSino", () => {
  beforeEach(() => {
    chamadas.get.mockReset().mockResolvedValue({ data: { total: 2, naoLidas: 1, dados: [nota(1, false, "/pontos/9"), nota(2, true)] } });
    chamadas.post.mockReset().mockResolvedValue({});
    chamadas.patch.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("mostra a quantidade de avisos não lidos no sino", async () => {
    abrir();

    expect(await screen.findByLabelText("Notificações (1 não lidas)")).toBeTruthy();
  });

  it("abre a lista e mostra os avisos", async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações (1 não lidas)"));

    expect(await screen.findByText("Aviso 1")).toBeTruthy();
    expect(screen.getByText("Aviso 2")).toBeTruthy();
  });

  it("sem avisos mostra a mensagem de vazio", async () => {
    chamadas.get.mockResolvedValue({ data: { total: 0, naoLidas: 0, dados: [] } });
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações"));

    expect(await screen.findByText("Nenhuma notificação ainda.")).toBeTruthy();
  });

  it("clicar num aviso novo marca como lido e abre o link", async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações (1 não lidas)"));
    fireEvent.click(await screen.findByText("Aviso 1"));

    expect(await screen.findByText("Ficha do ponto")).toBeTruthy();
    expect(chamadas.patch).toHaveBeenCalledWith("/notificacoes/1/lida");
  });

  it("aviso com identificador que não é número inteiro não gera chamada à API", async () => {
    chamadas.get.mockResolvedValue({
      data: { total: 1, naoLidas: 1, dados: [{ ...nota(1, false), id: "1/../admin" }] },
    });
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações (1 não lidas)"));
    fireEvent.click(await screen.findByText("Aviso 1"));

    await waitFor(() => expect(screen.queryByText("Aviso 1")).toBeNull());
    expect(chamadas.patch).not.toHaveBeenCalled();
  });

  it("link para fora do site não é seguido", async () => {
    chamadas.get.mockResolvedValue({
      data: { total: 1, naoLidas: 0, dados: [nota(3, true, "//site-externo.example/pontos/9")] },
    });
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações"));
    fireEvent.click(await screen.findByText("Aviso 3"));

    await waitFor(() => expect(screen.queryByText("Aviso 3")).toBeNull());
    expect(screen.queryByText("Ficha do ponto")).toBeNull();
    expect(screen.getByLabelText("Notificações")).toBeTruthy();
  });

  it("marcar todas como lidas zera o contador", async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações (1 não lidas)"));
    fireEvent.click(await screen.findByRole("button", { name: "Marcar todas como lidas" }));

    await waitFor(() => expect(screen.getByLabelText("Notificações")).toBeTruthy());
    expect(chamadas.post).toHaveBeenCalledWith("/notificacoes/marcar-todas-lidas");
  });

  it("clicar fora fecha a lista", async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText("Notificações (1 não lidas)"));
    await screen.findByText("Aviso 1");

    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByText("Aviso 1")).toBeNull());
  });

  it("falha ao buscar não quebra o sino", async () => {
    chamadas.get.mockRejectedValue(new Error("Network Error"));
    abrir();

    expect(await screen.findByLabelText("Notificações")).toBeTruthy();
  });
});
