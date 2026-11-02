import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { montarAgenda, type TrechoParaAgenda } from "./viagemDeCarro";

const t = (km: number, segundos: number, noite: number | null): TrechoParaAgenda => ({ km, segundos, noite });

describe("montarAgenda", () => {
  it("perna longa: noites viram dias de estrada e a chegada longa também", () => {
    const r = montarAgenda([{ trechos: [t(500, 22000, 1), t(500, 22000, 2), t(507, 22200, null)], terminaEmCasa: false }], [4], 6);

    assert.deepEqual(
      r.trechos[0].map((x) => [x.dia, x.ocupaODia, x.noFimDoDia]),
      [
        [1, true, false],
        [2, true, false],
        [3, true, false],
      ],
    );
    assert.equal(r.etapas[0].primeiroDia, 4);
    assert.equal(r.etapas[0].chegada, null);
    assert.equal(r.totalDeDias, 7);
  });

  it("chegada que deixa 2 h de passeio é descontada do 1º dia da etapa", () => {
    const r = montarAgenda([{ trechos: [t(180, 8100, null)], terminaEmCasa: false }], [4], 6);

    assert.deepEqual(
      r.trechos[0].map((x) => [x.dia, x.ocupaODia]),
      [[1, false]],
    );
    assert.equal(r.etapas[0].primeiroDia, 1);
    assert.equal(r.etapas[0].chegada, r.trechos[0][0]);
    assert.equal(r.totalDeDias, 4);
  });

  it("exatamente 2 h de sobra conta como descontada", () => {
    const r = montarAgenda([{ trechos: [t(320, 4 * 3600, null)], terminaEmCasa: false }], [2], 6);

    assert.equal(r.trechos[0][0].ocupaODia, false);
    assert.equal(r.etapas[0].primeiroDia, 1);
  });

  it("sem perna (casa é a 1ª cidade): a etapa começa no dia 1, sem chegada", () => {
    const r = montarAgenda([null], [2], 6);

    assert.deepEqual(r.trechos, [[]]);
    assert.deepEqual(r.etapas[0], { primeiroDia: 1, chegada: null, minutosNoFimDoUltimoDia: 0 });
    assert.equal(r.totalDeDias, 2);
  });

  it("etapa seguinte sem perna calculada continua a numeração e mantém a estimativa", () => {
    const r = montarAgenda([{ trechos: [t(500, 22000, 1), t(500, 22000, null)], terminaEmCasa: false }], [2, 3], 6);

    assert.equal(r.etapas[0].primeiroDia, 3);
    assert.equal(r.etapas[1].primeiroDia, 5);
    assert.equal(r.etapas[1].chegada, undefined);
    assert.equal(r.totalDeDias, 7);
  });

  it("volta curta fica no fim do último dia da última etapa", () => {
    const r = montarAgenda([null, { trechos: [t(180, 8100, null)], terminaEmCasa: true }], [2], 6);

    assert.deepEqual(
      r.trechos[1].map((x) => [x.dia, x.ocupaODia, x.noFimDoDia]),
      [[2, false, true]],
    );
    assert.equal(r.etapas[0].minutosNoFimDoUltimoDia, 135);
    assert.equal(r.totalDeDias, 2);
  });

  it("cidade de 1 dia com chegada e volta curtas: a volta só fica no mesmo dia se sobrarem 2 h depois das duas", () => {
    // 250 km para cada lado (~3h08 cada) com 6 h de passeio: a chegada cabe, as duas juntas não.
    const r = montarAgenda([{ trechos: [t(250, 11250, null)], terminaEmCasa: false }, { trechos: [t(250, 11250, null)], terminaEmCasa: true }], [1], 6);

    assert.equal(r.trechos[0][0].ocupaODia, false);
    assert.deepEqual(
      r.trechos[1].map((x) => [x.dia, x.ocupaODia, x.noFimDoDia]),
      [[2, true, false]],
    );
    assert.equal(r.etapas[0].minutosNoFimDoUltimoDia, 0);
    assert.equal(r.totalDeDias, 2);
  });

  it("volta curta que não deixa 2 h vira dia só de estrada", () => {
    const r = montarAgenda([null, { trechos: [t(400, 5 * 3600, null)], terminaEmCasa: true }], [2], 6);

    assert.deepEqual(
      r.trechos[1].map((x) => [x.dia, x.ocupaODia, x.noFimDoDia]),
      [[3, true, false]],
    );
    assert.equal(r.etapas[0].minutosNoFimDoUltimoDia, 0);
    assert.equal(r.totalDeDias, 3);
  });

  it("volta longa: noites e chegada em casa como dias de estrada, mesmo se a chegada for curta", () => {
    const r = montarAgenda([null, { trechos: [t(500, 22000, 1), t(120, 5400, null)], terminaEmCasa: true }], [2], 6);

    assert.deepEqual(
      r.trechos[1].map((x) => [x.dia, x.noite, x.ocupaODia]),
      [
        [3, 1, true],
        [4, null, true],
      ],
    );
    assert.equal(r.totalDeDias, 4);
  });

  it("perna entre etapas maior que um dia entra entre os dias das duas cidades", () => {
    const r = montarAgenda([null, { trechos: [t(500, 22000, 1), t(150, 6750, null)], terminaEmCasa: false }], [2, 2], 6);

    assert.equal(r.etapas[0].primeiroDia, 1);
    assert.deepEqual(
      r.trechos[1].map((x) => [x.dia, x.ocupaODia]),
      [
        [3, true],
        [4, false],
      ],
    );
    assert.equal(r.etapas[1].primeiroDia, 4);
    assert.equal(r.etapas[1].chegada?.dia, 4);
    assert.equal(r.totalDeDias, 5);
  });
});
