import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  configurarPersistidor,
  descarregarMetricas,
  diaLocal,
  eventosPendentes,
  registrarEvento,
  serieParaCsv,
} from "./metricasUso";

describe("diaLocal", () => {
  it("formata a data local como AAAA-MM-DD", () => {
    assert.equal(diaLocal(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
    assert.equal(diaLocal(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
  });
});

describe("contagem de eventos de uso", () => {
  let gravados: { dia: string; tipo: string; total: number }[][];

  beforeEach(async () => {
    gravados = [];
    configurarPersistidor(async (lote) => {
      gravados.push(lote);
    });
    await descarregarMetricas();
    gravados = [];
  });

  afterEach(async () => {
    configurarPersistidor(async () => {});
    await descarregarMetricas();
    configurarPersistidor(null);
  });

  it("soma os eventos do mesmo tipo e dia em um único registro", async () => {
    registrarEvento("busca");
    registrarEvento("busca");
    registrarEvento("busca", 3);
    registrarEvento("login");

    assert.equal(eventosPendentes(), 6);

    await descarregarMetricas();

    assert.equal(gravados.length, 1);
    const porTipo = Object.fromEntries(gravados[0].map((r) => [r.tipo, r.total]));
    assert.deepEqual(porTipo, { busca: 5, login: 1 });
    assert.equal(eventosPendentes(), 0);
  });

  it("não grava nada quando não há eventos", async () => {
    await descarregarMetricas();

    assert.equal(gravados.length, 0);
  });

  it("devolve os contadores quando a gravação falha, sem perder eventos", async () => {
    configurarPersistidor(async () => {
      throw new Error("banco fora do ar");
    });

    const erro = console.error;
    console.error = () => {};

    try {
      registrarEvento("cadastro", 2);
      await descarregarMetricas();
    } finally {
      console.error = erro;
    }

    assert.equal(eventosPendentes(), 2);

    configurarPersistidor(async (lote) => {
      gravados.push(lote);
    });
    await descarregarMetricas();

    assert.equal(gravados[0][0].total, 2);
  });
});

describe("serieParaCsv", () => {
  it("gera cabeçalho e uma linha por dia", () => {
    const csv = serieParaCsv([
      { dia: "2026-10-25", busca: 4, roteiro_gerado: 1 },
      { dia: "2026-10-26", busca: 0 },
    ]);
    const [cabecalho, ...linhas] = csv.split("\n");

    assert.ok(cabecalho.startsWith("dia,busca,roteiro_gerado,"));
    assert.equal(linhas.length, 2);
    assert.ok(linhas[0].startsWith("2026-10-25,4,"));
    assert.ok(linhas[1].startsWith("2026-10-26,0,0"));
  });
});
