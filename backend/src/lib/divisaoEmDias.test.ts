import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dividirEmDias, faixasAmpliadas, notaDoCandidato, type CandidatoDePernoite } from "./divisaoEmDias";
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
  populacao: number | null = null,
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
    populacao,
    resumo: hospedagens === null ? null : hospedagens === undefined ? undefined : resumo(hospedagens, atracoes),
  };
}

function dividir(
  candidatos: CandidatoDePernoite[],
  opcoes: {
    totalKm?: number;
    alvoKm?: number;
    horasPorDia?: number | null;
    escolhas?: [number, number][];
    esticar?: boolean;
    kmPorHora?: number;
    codigoDoDestino?: number;
  } = {},
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
    codigoDoDestino: opcoes.codigoDoDestino,
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

  it("1.120 km: o padrão é dormir antes, sem passar do limite; chegada de ~120 km", () => {
    const d = dividir([cidade(1, 500, 10, 3, 2, 1120), cidade(2, 1000, 5, 1, 2, 1120)], { totalKm: 1120 });

    assert.deepEqual(codigos(d), [1, 2]);
    assert.equal(Math.round(d.kmFinal), 120);
    assert.deepEqual(d.decisao, { esticar: false, kmEsticando: 620, kmNoDiaSeguinte: 120 });
  });

  it("1.120 km com esticar=true: chega no dia 2 com ~620 km", () => {
    const d = dividir([cidade(1, 500, 10, 3, 2, 1120), cidade(2, 1000, 5, 1, 2, 1120)], { totalKm: 1120, esticar: true });

    assert.deepEqual(codigos(d), [1]);
    assert.equal(Math.round(d.kmFinal), 620);
    assert.equal(d.decisao?.esticar, true);
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

  it("sem hospedagem até ±100, a busca se amplia para ±150 e depois ±200 antes de deixar a definir", () => {
    const a150 = dividir([cidade(1, 500, 0), cidade(2, 640, 3), cidade(3, 1000, 4)]);
    const a200 = dividir([cidade(1, 500, 0), cidade(2, 310, 2), cidade(3, 1000, 4)]);

    assert.equal(a150.noites[0].cidade?.codigoIbge, 2);
    assert.equal(a150.noites[0].aDefinir, false);
    assert.ok(
      a150.avisos.includes("Nenhuma cidade com hospedagem entre 450 e 550 km; a mais próxima é C2, no km 640."),
      a150.avisos.join(" | "),
    );
    assert.equal(a200.noites[0].cidade?.codigoIbge, 2);
    assert.ok(a200.avisos.includes("Nenhuma cidade com hospedagem entre 450 e 550 km; a mais próxima é C2, no km 310."));
  });

  it("além de ±200 sem hospedagem, o pernoite fica a definir na cidade mais perto do alvo", () => {
    const d = dividir([cidade(1, 505, 0), cidade(2, 760, 3)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 1);
    assert.equal(d.noites[0].aDefinir, true);
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
    assert.ok(d.avisos.includes("Os hotéis de algumas cidades do caminho ainda estão sendo buscados; elas aparecem só pela distância. Gere de novo em instantes para ver os hotéis."));
    assert.equal(d.avisos.filter((a) => a.startsWith("Os hotéis de algumas cidades")).length, 1);
  });

  it("noite com hotéis contados não avisa, mesmo com outra cidade da faixa sem contagem", () => {
    const d = dividir([cidade(1, 500, 10, 3), cidade(2, 510, null), cidade(3, 1000, 4)]);

    assert.deepEqual(codigos(d), [1, 3]);
    assert.ok(!d.avisos.includes("Os hotéis de algumas cidades do caminho ainda estão sendo buscados; elas aparecem só pela distância. Gere de novo em instantes para ver os hotéis."), JSON.stringify(d.avisos));
  });

  it("sem contagem de hotéis, a cidade maior ganha de uma minúscula um pouco mais perto do alvo", () => {
    // Como Tubarão (110 mil habitantes, a 4 km do alvo) e Pedras Grandes (4 mil, a 1 km).
    const d = dividir([cidade(1, 501, null, 0, 2, TOTAL, 4_000), cidade(2, 496, null, 0, 2, TOTAL, 110_000), cidade(3, 1000, 4)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 2);
    assert.ok(d.avisos.includes("Os hotéis de algumas cidades do caminho ainda estão sendo buscados; elas aparecem só pela distância. Gere de novo em instantes para ver os hotéis."));
  });

  it("nota sem contagem: proximidade 0,40 e porte 0,35 no lugar das hospedagens (de 5 mil a 100 mil habitantes, escala logarítmica)", () => {
    assert.ok(Math.abs(notaDoCandidato(cidade(1, 500, null, 0, 2, TOTAL, 100_000), 500, 50) - 0.75) < 1e-9);
    assert.ok(Math.abs(notaDoCandidato(cidade(1, 500, null, 0, 2, TOTAL, 20_000), 500, 50) - (0.4 + (0.35 * Math.log(4)) / Math.log(20))) < 1e-9);
    // Vilarejo (menos de 5 mil) e população desconhecida: só a proximidade.
    assert.ok(Math.abs(notaDoCandidato(cidade(1, 500, null, 0, 2, TOTAL, 4_000), 500, 50) - 0.4) < 1e-9);
    assert.ok(Math.abs(notaDoCandidato(cidade(1, 500, null), 500, 50) - 0.4) < 1e-9);
  });

  it("cidade com hotéis contados não perde para uma maior sem contagem um pouco mais perto do alvo", () => {
    const d = dividir([cidade(1, 510, 20, 3), cidade(2, 500, null, 0, 2, TOTAL, 120_000), cidade(3, 1000, 4)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 1);
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

  it("a faixa pede resumo das mesmas 10 cidades uma vez só, não das 10 seguintes depois", () => {
    const candidatos = Array.from({ length: 25 }, (_, i) => cidade(i + 1, 452 + i * 4, undefined));
    const primeira = dividir(candidatos, { totalKm: 900 });

    // Chegam os resumos pedidos (sem hotel): a próxima rodada não pede outras 10 da mesma faixa.
    for (const c of candidatos) {
      if (primeira.semResumo.includes(c.codigoIbge)) c.resumo = resumo(0, 0);
    }

    assert.equal(primeira.semResumo.length, 10);
    assert.deepEqual(dividir(candidatos, { totalKm: 900 }).semResumo, []);
  });

  it("limite de 7 h por dia encurta o alvo pelo perfil", () => {
    const candidatos = [cidade(1, 445, 5, 1), cidade(2, 545, 5, 1), cidade(3, 990, 5, 1), cidade(4, 1040, 5, 1)];

    // A 70 km/h, 7 h dão 490 km: a faixa vira 440–540.
    assert.equal(dividir(candidatos, { horasPorDia: 7, kmPorHora: 70 }).noites[0].cidade?.codigoIbge, 1);
    assert.equal(dividir(candidatos, { kmPorHora: 70 }).noites[0].cidade?.codigoIbge, 2);
  });

  it("limite de horas baixo: a faixa encolhe junto com o alvo do dia e não sobra um dia quase vazio", () => {
    // 2 h a 40 km/h dão 80 km por dia. Com a faixa fixa de ±50 km, a cidade do km 32 (muito bem avaliada)
    // ganhava da do km 80 e o primeiro dia teria só 32 km. Com a faixa de 30% do alvo (±24 km) ela sai.
    const candidatos = [cidade(1, 32, 20, 10, 2, 400), cidade(2, 80, 1, 0, 2, 400), cidade(3, 160, 5, 1, 2, 400), cidade(4, 240, 5, 1, 2, 400)];

    const d = dividir(candidatos, { totalKm: 400, alvoKm: 500, horasPorDia: 2, kmPorHora: 40 });

    assert.equal(d.noites[0].cidade?.codigoIbge, 2);
    assert.equal(d.noites[0].kmAlvo, 80);

    const kmDosDias = d.noites.map((n, i) => n.km - (i === 0 ? 0 : d.noites[i - 1].km));

    assert.ok(kmDosDias.every((km) => km >= 50), `dias de estrada: ${kmDosDias.join(", ")} km`);
  });

  it("a busca ampliada acompanha a faixa e nunca deixa o dia com menos de 40% do alvo", () => {
    assert.deepEqual(faixasAmpliadas(50, 500), [100, 150, 200]);
    assert.deepEqual(faixasAmpliadas(50, 300), [100, 150, 180]);
    assert.deepEqual(faixasAmpliadas(24, 80), [48]);
  });

  it("dia curto sem hospedagem adiante: a busca ampliada não volta para a cidade onde se dormiu", () => {
    // 80 km por dia: a cidade do km 240 é o pernoite da noite 3; a noite 4 (alvo no km 320) não tem
    // nada perto e não pode cair de novo no km 240, o que daria um dia de 0 km.
    const candidatos = [cidade(1, 80, 3, 0, 2, 400), cidade(2, 160, 3, 0, 2, 400), cidade(3, 240, 3, 0, 2, 400)];

    const d = dividir(candidatos, { totalKm: 400, alvoKm: 500, horasPorDia: 2, kmPorHora: 40 });
    const kmDosDias = d.noites.map((n, i) => n.km - (i === 0 ? 0 : d.noites[i - 1].km));

    assert.deepEqual(codigos(d), [1, 2, 3, null]);
    assert.ok(kmDosDias.every((km) => km >= 32), `dias de estrada: ${kmDosDias.join(", ")} km`);
  });

  it("alvo de 500 km continua com a faixa de ±50 km", () => {
    const d = dividir([cidade(1, 449, 20, 10), cidade(2, 500, 1, 0)]);

    assert.equal(d.noites[0].cidade?.codigoIbge, 2, "o km 449 está fora da faixa 450–550");
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

describe("sem hospedagem nem na maior faixa ampliada: propõe seguir adiante, só com aceite", () => {
  it("propõe a próxima cidade com hospedagem adiante e não muda a noite sem o aceite", () => {
    // Alvo no km 500; a busca ampliada vai até ±200 km (300 a 700) e não acha nada.
    const candidatos = [cidade(1, 760, 2), cidade(2, 900, 4), cidade(3, 1120, 2)];

    const d = dividir(candidatos, { totalKm: 1500 });

    assert.equal(d.noites[0].km, 500);
    assert.equal(d.noites[0].aDefinir, true);
    assert.equal(d.noites[0].proximaOpcao?.codigoIbge, 1);
    assert.equal(d.noites[0].proximaOpcao?.kmDoDia, 760);
    assert.equal(d.noites[0].proximaOpcao?.excedenteKm, 260);
    assert.equal(d.noites[0].proximaOpcao?.destino, false);

    const aceita = dividir(candidatos, { totalKm: 1500, escolhas: [[1, 1]] });

    assert.equal(aceita.noites[0].km, 760);
    assert.equal(aceita.noites[0].aDefinir, false);
    assert.equal(aceita.noites[0].proximaOpcao, undefined);
    assert.ok(
      aceita.avisos.includes("Você aceitou seguir até C1: 760 km neste dia, 260 km além do alvo."),
      aceita.avisos.join(" | "),
    );
  });

  it("sem nenhuma cidade com hospedagem adiante, propõe ir direto ao destino; aceitar encerra a perna", () => {
    const d = dividir([], { totalKm: 1500, codigoDoDestino: 99 });

    assert.deepEqual(d.noites[0].proximaOpcao, { cidade: null, codigoIbge: 99, km: 1500, kmDoDia: 1500, excedenteKm: 1000, destino: true });

    const aceita = dividir([], { totalKm: 1500, codigoDoDestino: 99, escolhas: [[1, 99]] });

    assert.equal(aceita.noites.length, 0, "nenhuma noite no destino: a chegada é o fim do dia");
    assert.equal(aceita.kmFinal, 1500);
  });

  it("cidades adiante ainda sem a contagem de hotéis: conta antes de dizer qual é a próxima", () => {
    const d = dividir([cidade(1, 760, undefined), cidade(2, 900, 3)], { totalKm: 1500 });

    assert.equal(d.noites[0].proximaOpcao, undefined);
    assert.ok(d.semResumo.includes(1));
  });

  it("cidade com hotel antes da faixa não é proposta: a proposta é sempre para avançar", () => {
    const d = dividir([cidade(1, 280, 2), cidade(2, 760, 3)], { totalKm: 1500 });

    assert.equal(d.noites[0].proximaOpcao?.codigoIbge, 2);
  });

  it("com hotel dentro da busca ampliada não há proposta: a cidade é escolhida com o aviso", () => {
    const d = dividir([cidade(1, 640, 2)], { totalKm: 1500, codigoDoDestino: 99 });

    assert.equal(d.noites[0].cidade?.codigoIbge, 1);
    assert.equal(d.noites[0].proximaOpcao, undefined);
  });
});
