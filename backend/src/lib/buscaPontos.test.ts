import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarBuscador, ErroTempoEsgotado, escaparLike, type FiltrosBusca, type ResultadoBusca } from "./buscaPontos";

const FILTROS: FiltrosBusca = { cidade: "Joinville", raioKm: 10, limite: 20 };
const RESULTADO: ResultadoBusca = { total: 1, dados: [] };

describe("escaparLike", () => {
  it("transforma %, _ e \\ em caracteres comuns", () => {
    assert.equal(escaparLike("100%"), "100\\%");
    assert.equal(escaparLike("a_b"), "a\\_b");
    assert.equal(escaparLike("c:\\x"), "c:\\\\x");
    assert.equal(escaparLike("normal"), "normal");
  });
});

describe("buscador com tempo limite e cache (AF02)", () => {
  it("devolve o resultado quando a busca responde a tempo", async () => {
    const buscar = criarBuscador({ executar: async () => RESULTADO, tempoLimiteMs: 100 });

    assert.deepEqual(await buscar(FILTROS), RESULTADO);
  });

  it("dá erro de tempo esgotado quando não há nada em cache", async () => {
    const buscar = criarBuscador({
      executar: () => new Promise(() => {}),
      tempoLimiteMs: 20,
    });

    await assert.rejects(buscar(FILTROS), ErroTempoEsgotado);
  });

  it("devolve o último resultado, marcado como desatualizado, se a busca estourar o tempo", async () => {
    let lento = false;
    const buscar = criarBuscador({
      executar: () => (lento ? new Promise(() => {}) : Promise.resolve(RESULTADO)),
      tempoLimiteMs: 20,
    });

    await buscar(FILTROS);
    lento = true;

    const r = await buscar(FILTROS);
    assert.equal(r.desatualizado, true);
    assert.deepEqual(r.dados, RESULTADO.dados);
  });

  it("também usa o cache quando o banco dá erro", async () => {
    let quebrado = false;
    const buscar = criarBuscador({
      executar: async () => {
        if (quebrado) throw new Error("conexão perdida");
        return RESULTADO;
      },
      tempoLimiteMs: 100,
    });

    await buscar(FILTROS);
    quebrado = true;

    assert.equal((await buscar(FILTROS)).desatualizado, true);
  });

  it("não usa cache de outra busca nem cache vencido", async () => {
    let agora = 0;
    let quebrado = false;
    const buscar = criarBuscador({
      executar: async () => {
        if (quebrado) throw new Error("falha");
        return RESULTADO;
      },
      tempoLimiteMs: 100,
      validadeCacheMs: 1000,
      agora: () => agora,
    });

    await buscar(FILTROS);
    quebrado = true;

    await assert.rejects(buscar({ ...FILTROS, cidade: "Blumenau" }), /falha/);

    agora = 5000;
    await assert.rejects(buscar(FILTROS), /falha/);
  });

  it("trata filtros iguais em ordem diferente como a mesma busca", async () => {
    let quebrado = false;
    const buscar = criarBuscador({
      executar: async () => {
        if (quebrado) throw new Error("falha");
        return RESULTADO;
      },
      tempoLimiteMs: 100,
    });

    await buscar({ cidade: "Joinville", raioKm: 10, limite: 20 });
    quebrado = true;

    const r = await buscar({ limite: 20, raioKm: 10, cidade: "Joinville" });
    assert.equal(r.desatualizado, true);
  });
});
