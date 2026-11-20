import { act, render, screen, waitFor } from "@testing-library/react";
import { useContext, useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalvosProvider } from "./SalvosContext";
import { SalvosContext } from "./salvos-context";

const estado = vi.hoisted(() => ({ autenticado: true, get: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock("./useAuth", () => ({ useAuth: () => ({ autenticado: estado.autenticado }) }));
vi.mock("../services/api", () => ({ default: { get: estado.get, post: estado.post, delete: estado.delete } }));

type Contexto = NonNullable<React.ContextType<typeof SalvosContext>>;

// O teste lê o contexto por esta referência (atribuí-la em um efeito, não durante a renderização).
const espiao: { atual: Contexto | null } = { atual: null };

function Espiao() {
  const valor = useContext(SalvosContext)!;

  useLayoutEffect(() => {
    espiao.atual = valor;
  });

  return <p>salvos: {[...valor.ids].join(",")}</p>;
}

const contexto = () => espiao.atual!;

function abrir() {
  render(
    <SalvosProvider>
      <Espiao />
    </SalvosProvider>,
  );
}

describe("SalvosProvider", () => {
  beforeEach(() => {
    estado.autenticado = true;
    estado.get.mockReset().mockResolvedValue({ data: { ids: [1, 2] } });
    estado.post.mockReset().mockResolvedValue({});
    estado.delete.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("carrega os pontos salvos de quem está logado", async () => {
    abrir();

    expect(await screen.findByText("salvos: 1,2")).toBeTruthy();
    expect(contexto().estaSalvo(1)).toBe(true);
    expect(contexto().estaSalvo(9)).toBe(false);
  });

  it("visitante não chama a API e não tem favoritos", () => {
    estado.autenticado = false;
    abrir();

    expect(estado.get).not.toHaveBeenCalled();
    expect(screen.getByText("salvos:")).toBeTruthy();
  });

  it("alternar salva um ponto novo e depois o remove", async () => {
    abrir();
    await screen.findByText("salvos: 1,2");

    let resultado = false;
    await act(async () => {
      resultado = await contexto().alternar(5);
    });
    expect(resultado).toBe(true);
    expect(estado.post).toHaveBeenCalledWith("/salvos/5");
    expect(screen.getByText("salvos: 1,2,5")).toBeTruthy();

    await act(async () => {
      resultado = await contexto().alternar(1);
    });
    expect(resultado).toBe(false);
    expect(estado.delete).toHaveBeenCalledWith("/salvos/1");
    await waitFor(() => expect(screen.getByText("salvos: 2,5")).toBeTruthy());
  });

  it("falha ao carregar não derruba a tela", async () => {
    estado.get.mockRejectedValue(new Error("Network Error"));
    abrir();

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByText("salvos:")).toBeTruthy();
  });
});
