import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

const sessao = vi.hoisted(() => ({ autenticado: false, usuario: null as null | { nome: string; tipoConta: string }, logout: vi.fn() }));

vi.mock("../context/useAuth", () => ({ useAuth: () => sessao }));
vi.mock("./NotificacoesSino", () => ({ default: () => <span>sino</span> }));
vi.mock("./AvisoConsentimento", () => ({ default: () => null }));

function abrir() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<p>Início</p>} />
          <Route path="/login" element={<p>Tela de login</p>} />
          <Route path="/salvos" element={<p>Tela de favoritos</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const menu = () => document.getElementById("menu-principal") as HTMLElement;
const botaoDoMenu = () => screen.getByRole("button", { name: /menu/i });

describe("Layout", () => {
  beforeEach(() => {
    sessao.autenticado = false;
    sessao.usuario = null;
    sessao.logout.mockReset();
  });

  it("o botão do menu abre e fecha o menu do celular", () => {
    abrir();
    expect(menu().getAttribute("data-aberto")).toBe("false");

    fireEvent.click(botaoDoMenu());
    expect(menu().getAttribute("data-aberto")).toBe("true");
    expect(botaoDoMenu().getAttribute("aria-label")).toBe("Fechar menu");

    fireEvent.click(botaoDoMenu());
    expect(menu().getAttribute("data-aberto")).toBe("false");
  });

  it("escolher outra página fecha o menu", () => {
    abrir();
    fireEvent.click(botaoDoMenu());
    fireEvent.click(screen.getAllByRole("link", { name: "Entrar" })[0]);

    expect(screen.getByText("Tela de login")).toBeTruthy();
    expect(menu().getAttribute("data-aberto")).toBe("false");
  });

  it("sair da conta fecha o menu e volta ao início", () => {
    sessao.autenticado = true;
    sessao.usuario = { nome: "Ana", tipoConta: "USUARIO" };
    abrir();
    fireEvent.click(botaoDoMenu());
    fireEvent.click(screen.getAllByRole("link", { name: "Favoritos" })[0]);
    expect(screen.getByText("Tela de favoritos")).toBeTruthy();

    fireEvent.click(botaoDoMenu());
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(sessao.logout).toHaveBeenCalled();
    expect(screen.getByText("Início")).toBeTruthy();
    expect(menu().getAttribute("data-aberto")).toBe("false");
  });
});
