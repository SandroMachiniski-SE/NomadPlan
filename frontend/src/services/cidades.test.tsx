import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("./api", () => ({ default: chamadas }));

async function carregarModulo() {
  vi.resetModules();
  return import("./cidades");
}

describe("serviço de cidades", () => {
  beforeEach(() => {
    chamadas.get.mockReset();
    chamadas.post.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("pede o município mais próximo das coordenadas", async () => {
    chamadas.post.mockResolvedValue({ data: { codigoIbge: 4306403, cidade: "Gramado", uf: "RS", latitude: -29, longitude: -50 } });
    const { cidadePerto } = await carregarModulo();

    const achada = await cidadePerto(-29.37, -50.87);

    expect(chamadas.post).toHaveBeenCalledWith("/cidades/perto", { latitude: -29.37, longitude: -50.87 });
    expect(achada.cidade).toBe("Gramado");
  });

  it("busca cidades do Brasil pelo texto", async () => {
    chamadas.get.mockResolvedValue({ data: { dados: [], semServidorDeMapas: false } });
    const { buscarCidadesDoBrasil } = await carregarModulo();

    const resposta = await buscarCidadesDoBrasil("gram");

    expect(chamadas.get).toHaveBeenCalledWith("/cidades/buscar", { params: { q: "gram" } });
    expect(resposta.semServidorDeMapas).toBe(false);
  });

  it("pede o preparo de uma cidade nova e consulta o andamento", async () => {
    chamadas.post.mockResolvedValue({ data: { estado: "preparando" } });
    chamadas.get.mockResolvedValue({ data: { estado: "pronta", pontos: 40 } });
    const { prepararCidade, consultarPreparoDaCidade } = await carregarModulo();

    const preparo = await prepararCidade({
      cidade: "Gramado",
      uf: "RS",
      latitude: -29,
      longitude: -50,
      pontos: 0,
      disponivel: false,
      preparo: null,
      codigoIbge: 4306403,
    });
    const andamento = await consultarPreparoDaCidade("Gramado", "RS");

    expect(chamadas.post).toHaveBeenCalledWith("/cidades/preparar", { cidade: "Gramado", uf: "RS", latitude: -29, longitude: -50 });
    expect(preparo.estado).toBe("preparando");
    expect(chamadas.get).toHaveBeenCalledWith("/cidades/preparar", { params: { cidade: "Gramado", uf: "RS" } });
    expect(andamento.pontos).toBe(40);
  });

  it("a lista de cidades com pontos é buscada uma vez e compartilhada", async () => {
    chamadas.get.mockResolvedValue({ data: { dados: [{ cidade: "Gramado", pontos: 10 }] } });
    const { useCidadesDisponiveis } = await carregarModulo();

    function Lista() {
      return <p>{useCidadesDisponiveis().map((c) => c.cidade).join(",") || "vazia"}</p>;
    }

    render(
      <>
        <Lista />
        <Lista />
      </>,
    );

    await waitFor(() => expect(screen.getAllByText("Gramado")).toHaveLength(2));
    expect(chamadas.get).toHaveBeenCalledTimes(1);
  });

  it("se a API falhar a lista fica vazia", async () => {
    chamadas.get.mockRejectedValue(new Error("Network Error"));
    const { useCidadesDisponiveis } = await carregarModulo();

    function Lista() {
      return <p>{useCidadesDisponiveis().length === 0 ? "vazia" : "cheia"}</p>;
    }

    render(<Lista />);

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByText("vazia")).toBeTruthy();
  });
});
