import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dividirEmDias, notaDoCandidato, type CandidatoDePernoite } from "./divisaoEmDias";
import type { PerfilDaRota } from "./rotas";
import type { ResumoOsm } from "./resumoOsm";

const TOTAL = 1507;

/** Perfil de uma estrada a velocidade constante. */
const perfil = (totalKm: number, kmPorHora = 80): PerfilDaRota => [
  [0, 0],
  [totalKm, (totalKm / kmPorHora) * 3600],
];

function resumo(hospedagens: number, atracoes: number): ResumoOsm {
  return {
    hospedagens: Array.from({ length: Math.min(hospedagens, 40) }, (_, i) => ({
      idOsm: `node/${i + 1}`,
      nome: `Hotel ${i + 1}`,
      tipo: "hotel",
      latitude: 0,
      longitude: 0,
      tags: {},
    })),
    atracoes: Array.from({ length: Math.min(atracoes, 10) }, (_, i) => ({ idOsm: `way/${i + 1}`, nome: `Atração ${i + 1}` })),
    totalHospedagens: hospedagens,
    totalAtracoes: atracoes,
  };
}

function cidade(
  codigoIbge: number,
  km: number,
  hospedagens: number | null | undefined,
  atracoes = 0,
  desvioKm = 2,
  totalKm = TOTAL,
): CandidatoDePernoite {
  return {
    codigoIbge,
    cidade: `C${codigoIbge}`,
    uf: "SP",
    latitude: 0,
    longitude: 0,
    km,
    fracao: km / totalKm,
    desvioKm,
    resumo: hospedagens === null ? null : hospedagens === undefined ? undefined : resumo(hospedagens, atracoes),
  };
}

function dividir(
  candidatos: CandidatoDePernoite[],
  opcoes: { totalKm?: number; alvoKm?: number; horasPorDia?: number | null; escolhas?: [number, number][]; esticar?: boolean; kmPorHora?: number } = {},
) {
  const totalKm = opcoes.totalKm ?? TOTAL;

  return dividirEmDias({
    totalKm,
    alvoKm: opcoes.alvoKm ?? 500,
    horasPorDia: opcoes.horasPorDia ?? null,
    perfil: perfil(totalKm, opcoes.kmPorHora),
    candidatos,
    escolhas: new Map(opcoes.escolhas ?? []),
    esticar: opcoes.esticar,
  });
}

const codigos = (d: ReturnType<typeof dividir>) => d.noites.map((n) => n.cidade?.codigoIbge ?? null);

describe("dividirEmDias", () => {
  it("1.507 km com alvo 500: 2 noites e chegada com ~506 km", () => {
    const d = dividir([cidade(1, 498, 10, 3), cidade(2, 1001, 8, 2)]);

    assert.deepEqual(codigos(d), [1, 2]);
    assert.equal(Math.round(d.kmFinal), 506);
    assert.equal(d.decisao, null);
    assert.deepEqual(d.avisos, []);
  });

  it("1.120 km: decisão com esticar marcado e chegada de ~620 km", () => {
    const d = dividir([cidade(1, 500, 10, 3, 2, 1120), cidade(2, 1000, 5, 1, 2, 1120)], { totalKm: 1120 });

    assert.deepEqual(codigos(d), [1]);
    assert.equal(Math.round(d.kmFinal), 620);
    assert.deepEqual(d.decisao, { esticar: true, kmEsticando: 620, kmNoDiaSeguinte: 120 });
  });

  it("1.120 km com esticar=false: 2 noites e chegada de ~120 km", () => {
    const d = dividir([cidade(1, 500, 10, 3, 2, 1120), cidade(2, 1000, 5, 1, 2, 1120)], { totalKm: 1120, esticar: false });

    assert.deepEqual(codigos(d), [1, 2]);
    assert.equal(Math.round(d.kmFinal), 120);
    assert.equal(d.decisao?.esticar, false);
  });

  it("540 km: nenhuma noite", () => {
    const d = dividir([cidade(1, 270, 10, 3, 2, 540)], { totalKm: 540 });

    assert.deepEqual(d.noites, []);
    assert.equal(d.kmFinal, 540);
    assert.equal(d.decisao, null);
  });

  it("cidade exatamente em 450 e em 550 entra na faixa", () => {
    const d = dividir([cidade(1, 450, 1), cidade(2, 550, 1)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 1);
    assert.deepEqual(
      d.noites[0].alternativas.map((a) => a.codigoIbge),
      [2],
    );
  });

  it("faixa sem hospedagem alarga para ±100 e avisa", () => {
    const d = dividir([cidade(1, 500, 0, 5), cidade(2, 590, 3)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 2);
    assert.equal(d.noites[0].aDefinir, false);
    assert.ok(
      d.avisos.includes("Nenhuma cidade com hospedagem entre 450 e 550 km; a mais próxima é C2, no km 590."),
      d.avisos.join(" | "),
    );
  });

  it("nada na faixa alargada: pernoite a definir na cidade mais perto do alvo", () => {
    const d = dividir([cidade(1, 505, 0), cidade(2, 420, 0)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 1);
    assert.equal(d.noites[0].aDefinir, true);
    assert.ok(d.avisos.includes("Não há cidade com hospedagem perto do km 500; o pernoite ficou a definir."), d.avisos.join(" | "));
  });

  it("sem cidade nenhuma: pernoite a definir no km do alvo, sem cidade", () => {
    const d = dividir([]);

    assert.equal(d.noites[0].cidade, null);
    assert.equal(d.noites[0].km, 500);
    assert.equal(d.noites[0].aDefinir, true);
    assert.equal(d.noites.length, 2);
    assert.ok(Math.abs(d.noites[0].fracao - 500 / TOTAL) < 1e-9);
  });

  it("a escolha da noite 1 muda a faixa da noite 2 e a escolha que saiu dela é descartada com aviso", () => {
    const candidatos = [cidade(1, 500, 10, 3), cidade(3, 460, 2), cidade(5, 1040, 10, 3), cidade(4, 960, 5, 1)];

    assert.deepEqual(codigos(dividir(candidatos)), [1, 5]);

    const d = dividir(candidatos, { escolhas: [[1, 3], [2, 5]] });

    assert.deepEqual(codigos(d), [3, 4]);
    assert.ok(d.avisos.includes("A cidade escolhida para a noite 2 não está mais na faixa e foi trocada."), d.avisos.join(" | "));
  });

  it("escolha com código que não é candidato é ignorada com aviso", () => {
    const d = dividir([cidade(1, 500, 10, 3), cidade(2, 1000, 5, 1)], { escolhas: [[1, 999]] });

    assert.deepEqual(codigos(d), [1, 2]);
    assert.ok(d.avisos.includes("A cidade escolhida para a noite 1 não está mais na faixa e foi trocada."));
  });

  it("ordena pela nota: proximidade 0,40, hospedagens 0,35 e atrações 0,25 em escala logarítmica", () => {
    const d = dividir([cidade(1, 500, 1, 0), cidade(2, 520, 20, 10)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 2);
    assert.ok(Math.abs(notaDoCandidato(cidade(2, 520, 20, 10), 500, 50) - 0.84) < 1e-9);
    assert.ok(Math.abs(notaDoCandidato(cidade(1, 500, 1, 0), 500, 50) - (0.4 + (0.35 * Math.log(2)) / Math.log(21))) < 1e-9);
  });

  it("empate na nota: menor desvio, depois menor km", () => {
    assert.equal(dividir([cidade(1, 510, 5, 2, 8), cidade(2, 490, 5, 2, 3)]).noites[0].cidade?.codigoIbge, 2);
    assert.equal(dividir([cidade(3, 510, 5, 2, 3), cidade(4, 490, 5, 2, 3)]).noites[0].cidade?.codigoIbge, 4);
  });

  it("sem resumo (null): nota só de proximidade, ninguém é descartado, aviso", () => {
    const d = dividir([cidade(1, 480, null), cidade(2, 500, null), cidade(3, 1000, null)]);

    assert.deepEqual(codigos(d), [2, 3]);
    assert.ok(d.avisos.includes("Não foi possível contar os hotéis agora; as cidades estão só pela distância."));
    assert.equal(d.avisos.filter((a) => a.startsWith("Não foi possível contar")).length, 1);
  });

  it("resumo undefined nas faixas avaliadas vai para semResumo", () => {
    const d = dividir([cidade(1, 500, undefined), cidade(2, 300, undefined), cidade(3, 1000, 4)]);

    assert.deepEqual(d.semResumo, [1]);
  });

  it("pede resumo só das 10 cidades mais perto do alvo em cada faixa", () => {
    // 14 cidades sem resumo entre os km 455 e 520: as 10 mais perto do km 500 são as de 470 a 520.
    const candidatos = Array.from({ length: 14 }, (_, i) => cidade(i + 1, 455 + i * 5, undefined));

    const d = dividir(candidatos, { totalKm: 900 });

    assert.deepEqual(
      [...d.semResumo].sort((a, b) => a - b),
      [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    );
  });

  it("limite de 7 h por dia encurta o alvo pelo perfil", () => {
    const candidatos = [cidade(1, 445, 5, 1), cidade(2, 545, 5, 1), cidade(3, 990, 5, 1), cidade(4, 1040, 5, 1)];

    // A 70 km/h, 7 h dão 490 km: a faixa vira 440–540.
    assert.equal(dividir(candidatos, { horasPorDia: 7, kmPorHora: 70 }).noites[0].cidade?.codigoIbge, 1);
    assert.equal(dividir(candidatos, { kmPorHora: 70 }).noites[0].cidade?.codigoIbge, 2);
  });

  it("até 3 alternativas, sem repetir a escolhida", () => {
    const d = dividir([480, 490, 500, 510, 520, 530].map((km, i) => cidade(i + 1, km, 5, 1)));
    const escolhida = d.noites[0].cidade!.codigoIbge;

    assert.equal(d.noites[0].alternativas.length, 3);
    assert.ok(d.noites[0].alternativas.every((a) => a.codigoIbge !== escolhida));
  });

  it("cada noite diz o km alvo do dia", () => {
    const d = dividir([cidade(1, 498, 10, 3), cidade(2, 1001, 8, 2)]);

    assert.deepEqual(
      d.noites.map((n) => n.kmAlvo),
      [500, 998],
    );
  });
});
