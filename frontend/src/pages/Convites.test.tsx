import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Convites from "./Convites";

const chamadas = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../services/api", () => ({ default: chamadas }));

const convite = {
  id: 5,
  papel: "EDITOR",
  roteiro: { id: 12, nome: "Serra gaúcha", cidade: "Gramado" },
  convidante: { nome: "Ana" },
};

function abrir() {
  render(
    <MemoryRouter initialEntries={["/convites"]}>
      <Routes>
        <Route path="/convites" element={<Convites />} />
        <Route path="/roteiros/:id" element={<p>Roteiro aberto</p>} />
        <Route path="/roteiros" element={<p>Meus roteiros</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Convites", () => {
  beforeEach(() => {
    chamadas.get.mockReset().mockResolvedValue({ data: { dados: [convite] } });
    chamadas.post.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lista o convite com quem convidou e o papel", async () => {
    abrir();

    expect(await screen.findByText("Serra gaúcha")).toBeTruthy();
    expect(screen.getByText(/para editar o roteiro junto/)).toBeTruthy();
    expect(screen.getByText(/Cidade: Gramado/)).toBeTruthy();
  });

  it("sem convites mostra a mensagem de vazio", async () => {
    chamadas.get.mockResolvedValue({ data: { dados: [] } });
    abrir();

    expect(await screen.findByText("Nenhum convite pendente")).toBeTruthy();
  });

  it("aceitar abre o roteiro", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Aceitar/ }));

    expect(await screen.findByText("Roteiro aberto")).toBeTruthy();
    expect(chamadas.post).toHaveBeenCalledWith("/convites/5/aceitar");
  });

  it("recusar recarrega a lista", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));

    await screen.findByText("Serra gaúcha");
    expect(chamadas.post).toHaveBeenCalledWith("/convites/5/recusar");
    expect(chamadas.get).toHaveBeenCalledTimes(2);
  });

  it("falha ao responder mostra o motivo", async () => {
    chamadas.post.mockRejectedValue({ response: { data: { erro: "Convite expirado." } } });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Aceitar/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("Convite expirado.");
  });

  it("falha ao carregar mostra o erro", async () => {
    chamadas.get.mockRejectedValue(new Error("Network Error"));
    abrir();

    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar seus convites.");
  });
});
