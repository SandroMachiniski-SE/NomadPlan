import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comNovasTentativas, ehFalhaTemporaria } from "./falhaTemporaria";

const http = (status: number) => ({ response: { status } });

describe("ehFalhaTemporaria", () => {
  it("sem resposta do servidor (rede, tempo esgotado) é temporária", () => {
    expect(ehFalhaTemporaria(new Error("Network Error"))).toBe(true);
    expect(ehFalhaTemporaria(null)).toBe(true);
  });

  it.each([500, 502, 503, 504, 408, 429])("HTTP %i é temporária", (status) => {
    expect(ehFalhaTemporaria(http(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("HTTP %i é um não de verdade", (status) => {
    expect(ehFalhaTemporaria(http(status))).toBe(false);
  });
});

describe("comNovasTentativas", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tenta de novo enquanto a falha é temporária e devolve o resultado", async () => {
    const tarefa = vi.fn().mockRejectedValueOnce(http(503)).mockRejectedValueOnce(new Error("rede")).mockResolvedValue("ok");
    const resultado = comNovasTentativas(tarefa, [1000, 3000]);

    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultado).resolves.toBe("ok");
    expect(tarefa).toHaveBeenCalledTimes(3);
  });

  it("404 não é repetido", async () => {
    const tarefa = vi.fn().mockRejectedValue(http(404));

    await expect(comNovasTentativas(tarefa, [1000, 3000])).rejects.toEqual(http(404));
    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it("esgotadas as esperas, repassa o último erro", async () => {
    const tarefa = vi.fn().mockRejectedValue(http(503));
    const verificado = expect(comNovasTentativas(tarefa, [1000, 3000])).rejects.toEqual(http(503));

    await vi.advanceTimersByTimeAsync(5000);
    await verificado;

    expect(tarefa).toHaveBeenCalledTimes(3);
  });

  it("para de tentar quando a tela já saiu", async () => {
    const tarefa = vi.fn().mockRejectedValue(http(503));

    await expect(comNovasTentativas(tarefa, [1000, 3000], () => false)).rejects.toEqual(http(503));
    expect(tarefa).toHaveBeenCalledTimes(1);
  });
});
