import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const sessao = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("../context/useAuth", () => ({ useAuth: () => ({ login: sessao.login }) }));

function abrir(estado?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: estado }]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/roteiros" element={<p>Meus roteiros</p>} />
        <Route path="/viagem" element={<p>Destino pedido</p>} />
        <Route path="/esqueci-senha" element={<p>Esqueci</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function preencher(email = " ana@exemplo.com ", senha = "senha-forte-1") {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: senha } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("Login", () => {
  beforeEach(() => {
    sessao.login.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("entra com o e-mail sem espaços e vai para os roteiros", async () => {
    sessao.login.mockResolvedValue({ mfaNecessario: false });
    abrir();
    preencher();

    expect(await screen.findByText("Meus roteiros")).toBeTruthy();
    expect(sessao.login).toHaveBeenCalledWith("ana@exemplo.com", "senha-forte-1", undefined);
  });

  it("volta para a tela que a pessoa tentava abrir", async () => {
    sessao.login.mockResolvedValue({ mfaNecessario: false });
    abrir({ destino: "/viagem" });
    preencher();

    expect(await screen.findByText("Destino pedido")).toBeTruthy();
  });

  it("mostra a mensagem recebida (ex.: senha redefinida)", () => {
    abrir({ mensagem: "Senha redefinida com sucesso." });

    expect(screen.getByRole("status").textContent).toContain("Senha redefinida com sucesso.");
  });

  it("mostra o erro da API quando a senha não confere", async () => {
    sessao.login.mockRejectedValue({ response: { data: { erro: "Credenciais inválidas." } } });
    abrir();
    preencher();

    expect((await screen.findByRole("alert")).textContent).toContain("Credenciais inválidas.");
  });

  it("usa a mensagem padrão quando o erro não tem texto", async () => {
    sessao.login.mockRejectedValue(new Error("Network Error"));
    abrir();
    preencher();

    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível entrar");
  });

  it("conta com verificação em duas etapas pede o código e só aceita números", async () => {
    sessao.login.mockResolvedValueOnce({ mfaNecessario: true }).mockResolvedValueOnce({ mfaNecessario: false });
    abrir();
    preencher();

    const campo = (await screen.findByLabelText("Código do aplicativo")) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "12ab34" } });
    expect(campo.value).toBe("1234");

    fireEvent.change(campo, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(sessao.login).toHaveBeenLastCalledWith("ana@exemplo.com", "senha-forte-1", "123456"));
    expect(await screen.findByText("Meus roteiros")).toBeTruthy();
  });

  it("ao pedir o código, o cursor vai direto para o campo dele", async () => {
    sessao.login.mockResolvedValue({ mfaNecessario: true });
    abrir();
    preencher();

    const campo = await screen.findByLabelText("Código do aplicativo");

    expect(document.activeElement).toBe(campo);
  });

  it("voltar da etapa do código mostra o formulário de senha de novo", async () => {
    sessao.login.mockResolvedValue({ mfaNecessario: true });
    abrir();
    preencher();

    fireEvent.click(await screen.findByRole("button", { name: "Voltar" }));

    expect(screen.getByLabelText("E-mail")).toBeTruthy();
  });
});
