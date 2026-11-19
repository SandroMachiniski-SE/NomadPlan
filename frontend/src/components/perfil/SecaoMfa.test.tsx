import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecaoMfa from "./SecaoMfa";

const estado = vi.hoisted(() => ({
  usuario: null as null | Record<string, unknown>,
  definirUsuario: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ usuario: estado.usuario, definirUsuario: estado.definirUsuario }),
}));
vi.mock("../../services/api", () => ({ default: { get: estado.get, post: estado.post } }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xx") } }));

describe("SecaoMfa", () => {
  beforeEach(() => {
    estado.usuario = { id: 1, nome: "Ana", mfaAtivo: false };
    estado.definirUsuario.mockReset();
    estado.get.mockReset().mockResolvedValue({ data: { id: 1, nome: "Ana", mfaAtivo: true } });
    estado.post.mockReset().mockResolvedValue({ data: { segredo: "ABCD1234", otpauthUrl: "otpauth://totp/x" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sem usuário não mostra nada", () => {
    estado.usuario = null;
    const { container } = render(<SecaoMfa />);

    expect(container.textContent).toBe("");
  });

  it("conta sem 2FA mostra 'Desativada' e o botão de ativar", () => {
    render(<SecaoMfa />);

    expect(screen.getByText("Desativada")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ })).toBeTruthy();
  });

  it("ativar: mostra o QR code e a chave, e só libera o botão com 6 números", async () => {
    render(<SecaoMfa />);
    fireEvent.click(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ }));

    expect(await screen.findByText("ABCD1234")).toBeTruthy();
    expect(await screen.findByAltText("QR code para o aplicativo autenticador")).toBeTruthy();

    const botao = screen.getByRole("button", { name: "Confirmar e ativar" }) as HTMLButtonElement;
    const campo = screen.getByLabelText("Código do aplicativo") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "12a45" } });
    expect(campo.value).toBe("1245");
    expect(botao.disabled).toBe(true);

    fireEvent.change(campo, { target: { value: "123456" } });
    expect(botao.disabled).toBe(false);
  });

  it("confirmar o código ativa o 2FA e atualiza o usuário", async () => {
    render(<SecaoMfa />);
    fireEvent.click(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ }));
    await screen.findByText("ABCD1234");

    fireEvent.change(screen.getByLabelText("Código do aplicativo"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e ativar" }));

    expect(await screen.findByText(/Verificação em duas etapas ativada/)).toBeTruthy();
    expect(estado.post).toHaveBeenLastCalledWith("/auth/mfa/ativar", { codigo: "123456" });
    expect(estado.definirUsuario).toHaveBeenCalledWith({ id: 1, nome: "Ana", mfaAtivo: true });
  });

  it("código errado mostra o erro e continua na configuração", async () => {
    render(<SecaoMfa />);
    fireEvent.click(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ }));
    await screen.findByText("ABCD1234");
    estado.post.mockRejectedValueOnce({ response: { data: { erro: "Código inválido." } } });

    fireEvent.change(screen.getByLabelText("Código do aplicativo"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e ativar" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Código inválido.");
    expect(screen.getByText("ABCD1234")).toBeTruthy();
  });

  it("falha ao iniciar a configuração mostra o erro fora do formulário", async () => {
    estado.post.mockRejectedValueOnce(new Error("Network Error"));
    render(<SecaoMfa />);
    fireEvent.click(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ }));

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.queryByText("ABCD1234")).toBeNull();
  });

  it("cancelar a configuração volta ao botão de ativar", async () => {
    render(<SecaoMfa />);
    fireEvent.click(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ }));
    await screen.findByText("ABCD1234");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: /Ativar verificação em duas etapas/ })).toBeTruthy();
  });

  it("desativar exige a senha e o código", async () => {
    estado.usuario = { id: 1, nome: "Ana", mfaAtivo: true };
    estado.get.mockResolvedValue({ data: { id: 1, nome: "Ana", mfaAtivo: false } });
    render(<SecaoMfa />);

    expect(screen.getByText("Ativada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-forte-1" } });
    fireEvent.change(screen.getByLabelText("Código do aplicativo"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Desativar verificação" }));

    expect(await screen.findByText("Verificação em duas etapas desativada.")).toBeTruthy();
    expect(estado.post).toHaveBeenCalledWith("/auth/mfa/desativar", { senha: "senha-forte-1", codigoMfa: "654321" });
  });

  it("falha ao desativar mostra o motivo", async () => {
    estado.usuario = { id: 1, nome: "Ana", mfaAtivo: true };
    estado.post.mockRejectedValue({ response: { data: { erro: "Senha incorreta." } } });
    render(<SecaoMfa />);

    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada-errada" } });
    fireEvent.change(screen.getByLabelText("Código do aplicativo"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Desativar verificação" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Senha incorreta.");
  });
});
