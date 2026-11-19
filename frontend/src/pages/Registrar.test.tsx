import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Registrar from "./Registrar";

const sessao = vi.hoisted(() => ({ registrar: vi.fn() }));

vi.mock("../context/useAuth", () => ({ useAuth: () => ({ registrar: sessao.registrar }) }));
vi.mock("../components/CampoMinhaCidade", () => ({ default: () => null }));

function abrir() {
  render(
    <MemoryRouter initialEntries={["/registrar"]}>
      <Routes>
        <Route path="/registrar" element={<Registrar />} />
        <Route path="/roteiros" element={<p>Meus roteiros</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function preencher(senha = "senha-forte-1", aceitar = true) {
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "  Ana Souza " } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@exemplo.com" } });
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: senha } });
  if (aceitar) fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(screen.getByRole("button", { name: "Criar conta" }).closest("form")!);
}

describe("Registrar", () => {
  beforeEach(() => {
    sessao.registrar.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("cria a conta com os dados limpos, o aceite da política e vai para os roteiros", async () => {
    sessao.registrar.mockResolvedValue(undefined);
    abrir();
    preencher();

    expect(await screen.findByText("Meus roteiros")).toBeTruthy();
    expect(sessao.registrar).toHaveBeenCalledWith({
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      senha: "senha-forte-1",
      codigoMunicipioBase: undefined,
      tipoConta: "VISITANTE",
      aceitouPolitica: true,
    });
  });

  it("senha curta é recusada antes de falar com a API", () => {
    abrir();
    preencher("curta");

    expect(screen.getByRole("alert").textContent).toContain("pelo menos 8 caracteres");
    expect(sessao.registrar).not.toHaveBeenCalled();
  });

  it("sem aceitar a política a conta não é criada", () => {
    abrir();
    preencher("senha-forte-1", false);

    expect(screen.getByRole("alert").textContent).toContain("Política de Privacidade");
    expect(sessao.registrar).not.toHaveBeenCalled();
  });

  it("e-mail já cadastrado mostra o motivo devolvido pela API", async () => {
    sessao.registrar.mockRejectedValue({ response: { data: { erro: "E-mail já cadastrado." } } });
    abrir();
    preencher();

    expect((await screen.findByRole("alert")).textContent).toContain("E-mail já cadastrado.");
  });

  it("o tipo de conta escolhido vai junto no cadastro", async () => {
    sessao.registrar.mockResolvedValue(undefined);
    abrir();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MORADOR" } });
    preencher();

    await screen.findByText("Meus roteiros");
    expect(sessao.registrar.mock.calls[0][0].tipoConta).toBe("MORADOR");
  });
});
