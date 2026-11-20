import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Favoritos from "./Favoritos";

const estado = vi.hoisted(() => ({ ids: new Set<number>(), get: vi.fn() }));

vi.mock("../services/api", () => ({ default: { get: estado.get } }));
vi.mock("../context/useSalvos", () => ({ useSalvos: () => ({ ids: estado.ids }) }));
vi.mock("../components/PontoCard", () => ({ default: ({ ponto }: { ponto: { nome: string } }) => <p>{ponto.nome}</p> }));

const abrir = () =>
  render(
    <MemoryRouter>
      <Favoritos />
    </MemoryRouter>,
  );

describe("Favoritos", () => {
  beforeEach(() => {
    estado.ids = new Set([1]);
    estado.get.mockReset().mockResolvedValue({
      data: { dados: [{ id: 1, nome: "Museu" }, { id: 2, nome: "Parque" }] },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("mostra só os pontos que continuam salvos", async () => {
    abrir();

    expect(await screen.findByText("Museu")).toBeTruthy();
    expect(screen.queryByText("Parque")).toBeNull();
    expect(estado.get).toHaveBeenCalledWith("/salvos");
  });

  it("sem nenhum salvo mostra a mensagem de vazio", async () => {
    estado.ids = new Set();
    abrir();

    expect(await screen.findByText("Você ainda não salvou nenhum lugar")).toBeTruthy();
  });

  it("falha ao carregar mostra o erro", async () => {
    estado.get.mockRejectedValue(new Error("Network Error"));
    abrir();

    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar seus favoritos.");
  });
});
