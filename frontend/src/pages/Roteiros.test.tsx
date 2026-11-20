import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Roteiros from "./Roteiros";

const chamadas = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../services/api", () => ({ default: { get: chamadas.get } }));

function responder(roteiros: unknown[], convites = 0) {
  chamadas.get.mockImplementation((url: string) =>
    url === "/convites" ? Promise.resolve({ data: { total: convites } }) : Promise.resolve({ data: { dados: roteiros } }),
  );
}

const abrir = () =>
  render(
    <MemoryRouter>
      <Roteiros />
    </MemoryRouter>,
  );

describe("Roteiros", () => {
  beforeEach(() => {
    chamadas.get.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lista os roteiros com a cidade e a descrição", async () => {
    responder([{ id: 1, nome: "Serra gaúcha", cidade: "Gramado", cidades: [], descricao: "Fim de semana", meuPapel: "DONO" }]);
    abrir();

    expect(await screen.findByText("Serra gaúcha")).toBeTruthy();
    expect(screen.getByText("Gramado")).toBeTruthy();
    expect(screen.getByText("Fim de semana")).toBeTruthy();
  });

  it("roteiro de outra pessoa mostra quem convidou e o papel", async () => {
    responder([{ id: 2, nome: "Praias", cidade: null, cidades: ["Floripa", "Bombinhas"], meuPapel: "EDITOR", usuario: { nome: "Ana" } }]);
    abrir();

    expect(await screen.findByText(/De Ana · você edita/)).toBeTruthy();
    expect(screen.getByText("Floripa → Bombinhas")).toBeTruthy();
  });

  it("sem roteiros mostra a mensagem de vazio", async () => {
    responder([]);
    abrir();

    expect(await screen.findByText("Você ainda não tem roteiros")).toBeTruthy();
  });

  it("avisa dos convites pendentes", async () => {
    responder([], 2);
    abrir();

    expect(await screen.findByText(/2 convites/)).toBeTruthy();
  });

  it("falha ao carregar mostra o erro", async () => {
    chamadas.get.mockRejectedValue(new Error("Network Error"));
    abrir();

    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar seus roteiros");
  });
});
