import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RotaProtegida from "./RotaProtegida";
import type { TipoConta } from "../types/usuario";

const sessao = vi.hoisted(() => ({ valor: {} as Record<string, unknown> }));

vi.mock("../context/useAuth", () => ({ useAuth: () => sessao.valor }));

function abrir(papeis?: TipoConta[]) {
  render(
    <MemoryRouter initialEntries={["/privado"]}>
      <Routes>
        <Route path="/login" element={<p>Tela de login</p>} />
        <Route path="/" element={<p>Início</p>} />
        <Route element={<RotaProtegida papeis={papeis} />}>
          <Route path="/privado" element={<p>Conteúdo privado</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RotaProtegida", () => {
  beforeEach(() => {
    sessao.valor = { usuario: null, autenticado: false, carregando: false, sessaoExpirada: false, saiuManualmente: false };
  });

  it("mostra o carregamento enquanto confere a sessão", () => {
    sessao.valor = { ...sessao.valor, carregando: true };
    abrir();

    expect(screen.getByText("Carregando...")).toBeTruthy();
  });

  it("manda quem não entrou para o login", () => {
    abrir();

    expect(screen.getByText("Tela de login")).toBeTruthy();
  });

  it("manda quem saiu por conta própria para o início", () => {
    sessao.valor = { ...sessao.valor, saiuManualmente: true };
    abrir();

    expect(screen.getByText("Início")).toBeTruthy();
  });

  it("deixa passar quem está autenticado", () => {
    sessao.valor = { ...sessao.valor, autenticado: true, usuario: { tipoConta: "MORADOR" } };
    abrir();

    expect(screen.getByText("Conteúdo privado")).toBeTruthy();
  });

  it("avisa quando o tipo de conta não tem permissão", () => {
    sessao.valor = { ...sessao.valor, autenticado: true, usuario: { tipoConta: "MORADOR" } };
    abrir(["ADMIN"]);

    expect(screen.getByRole("alert").textContent).toContain("Você não tem permissão");
  });
});
