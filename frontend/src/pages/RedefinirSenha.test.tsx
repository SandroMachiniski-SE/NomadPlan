import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RedefinirSenha from "./RedefinirSenha";

const chamadas = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../services/api", () => ({ default: { post: chamadas.post } }));

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        <Route path="/login" element={<p>Tela de login</p>} />
        <Route path="/esqueci-senha" element={<p>Esqueci</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function enviar(nova: string, confirmacao: string) {
  fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText("Confirme a nova senha"), { target: { value: confirmacao } });
  fireEvent.submit(screen.getByRole("button", { name: "Redefinir senha" }).closest("form")!);
}

describe("RedefinirSenha", () => {
  beforeEach(() => {
    chamadas.post.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sem token o link é considerado inválido", () => {
    abrir("/redefinir-senha");

    expect(screen.getByRole("alert").textContent).toContain("Link inválido");
  });

  it("senhas diferentes não são enviadas", () => {
    abrir("/redefinir-senha?token=abc");
    enviar("senha-forte-1", "senha-forte-2");

    expect(screen.getByRole("alert").textContent).toContain("não coincidem");
    expect(chamadas.post).not.toHaveBeenCalled();
  });

  it("senha curta não é enviada", () => {
    abrir("/redefinir-senha?token=abc");
    enviar("curta", "curta");

    expect(screen.getByRole("alert").textContent).toContain("pelo menos 8 caracteres");
  });

  it("redefine e leva ao login", async () => {
    chamadas.post.mockResolvedValue({ data: {} });
    abrir("/redefinir-senha?token=abc");
    enviar("senha-forte-1", "senha-forte-1");

    expect(await screen.findByText("Tela de login")).toBeTruthy();
    expect(chamadas.post).toHaveBeenCalledWith("/auth/redefinir-senha", { token: "abc", novaSenha: "senha-forte-1" });
  });

  it("link vencido (400) oferece pedir um novo", async () => {
    chamadas.post.mockRejectedValue({ response: { status: 400, data: { erro: "Link expirado." } } });
    abrir("/redefinir-senha?token=abc");
    enviar("senha-forte-1", "senha-forte-1");

    expect((await screen.findByRole("alert")).textContent).toContain("Link expirado.");
    expect(screen.getByText("Solicitar um novo link")).toBeTruthy();
  });
});
