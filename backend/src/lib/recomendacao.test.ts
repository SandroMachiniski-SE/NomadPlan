import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularMaxPontos,
  DURACAO_VISITA_MIN,
  inicioPadrao,
  planejarPorProximidade,
  planejarRoteiro,
  pontuarCandidato,
  type CandidatoRoteiro,
  type ParametrosRecomendacao,
} from "./recomendacao";

let proximoId = 1;

function candidato(parcial: Partial<CandidatoRoteiro> = {}): CandidatoRoteiro {
  const id = proximoId++;

  return {
    id,
    nome: `Ponto ${id}`,
    categoria: "Natureza",
    cidade: "Joinville",
    endereco: null,
    latitude: -26.3,
    longitude: -48.84,
    faixaPreco: null,
    acessibilidade: null,
    horarioFuncionamento: "Todos os dias, 24h",
    imagemUrl: null,
    seloVerificado: false,
    mediaAvaliacao: null,
    ...parcial,
  };
}

// Segunda-feira, 10h (local).
const SEGUNDA_10H = new Date(2026, 9, 26, 10, 0, 0);

function params(parcial: Partial<ParametrosRecomendacao> = {}): ParametrosRecomendacao {
  return { cidade: "Joinville", horasDisponiveis: 6, interesses: [], dataHoraInicio: SEGUNDA_10H, ...parcial };
}

describe("inicioPadrao", () => {
  it("mantém o horário atual em horário comercial", () => {
    const agora = new Date(2026, 9, 26, 14, 30);

    assert.equal(inicioPadrao(agora).getTime(), agora.getTime());
  });

  it("antes das 9h começa às 9h do mesmo dia", () => {
    const r = inicioPadrao(new Date(2026, 9, 26, 6, 15));

    assert.deepEqual([r.getDate(), r.getHours(), r.getMinutes()], [26, 9, 0]);
  });

  it("depois das 17h começa às 9h do dia seguinte", () => {
    const noite = inicioPadrao(new Date(2026, 9, 26, 22, 40));
    const fimDaTarde = inicioPadrao(new Date(2026, 9, 26, 17, 30));

    assert.deepEqual([noite.getDate(), noite.getHours(), noite.getMinutes()], [27, 9, 0]);
    assert.deepEqual([fimDaTarde.getDate(), fimDaTarde.getHours()], [27, 9]);
  });
});

describe("calcularMaxPontos", () => {
  it("cabe uma visita de 1h30 por vez, entre 1 e 10 pontos", () => {
    assert.equal(calcularMaxPontos(0.5), 1);
    assert.equal(calcularMaxPontos(3), 2);
    assert.equal(calcularMaxPontos(6), 4);
    assert.equal(calcularMaxPontos(24), 10);
  });
});

describe("pontuarCandidato", () => {
  it("soma interesse, acessibilidade, selo e boa nota", () => {
    const c = candidato({
      categoria: "Cultura",
      acessibilidade: "Rampa e banheiro adaptado",
      seloVerificado: true,
      mediaAvaliacao: 4.5,
    });

    assert.equal(pontuarCandidato(c, ["cultura"], []), 4);
    assert.equal(pontuarCandidato(c, ["cultura"], ["mobilidade_reduzida", "banheiro_adaptado"]), 6);
    assert.equal(pontuarCandidato(c, [], []), 1);
  });
});

describe("planejarRoteiro", () => {
  it("prioriza o que combina com os interesses do usuário", () => {
    const museu = candidato({ nome: "Museu", categoria: "Cultura" });
    const parque = candidato({ nome: "Parque", categoria: "Natureza" });

    const { pontos } = planejarRoteiro([parque, museu], params({ interesses: ["Cultura"], horasDisponiveis: 1.5 }));

    assert.deepEqual(pontos.map((p) => p.nome), ["Museu"]);
  });

  it("monta um trajeto sem ziguezague: pontos próximos entre si ficam em sequência", () => {
    // Três pontos alinhados de leste a oeste; partindo do mais ocidental, a ordem natural é a linha.
    const a = candidato({ nome: "A", latitude: -26.3, longitude: -48.9 });
    const b = candidato({ nome: "B", latitude: -26.3, longitude: -48.8 });
    const c = candidato({ nome: "C", latitude: -26.3, longitude: -48.7 });

    const { pontos } = planejarRoteiro(
      [c, a, b],
      params({ horasDisponiveis: 6, latitude: -26.3, longitude: -48.95 }),
    );

    assert.deepEqual(pontos.map((p) => p.nome), ["A", "B", "C"]);
  });

  it("dá horário de chegada e saída crescentes e inclui o tempo de deslocamento", () => {
    const a = candidato({ latitude: -26.3, longitude: -48.9 });
    const b = candidato({ latitude: -26.3, longitude: -48.8 });

    const { pontos } = planejarRoteiro([a, b], params({ latitude: -26.3, longitude: -48.9 }));

    assert.equal(pontos.length, 2);
    assert.equal(pontos[0].deslocamentoMin, 0);
    assert.ok(pontos[1].deslocamentoMin > 0);
    assert.equal(new Date(pontos[0].saidaEstimada).getTime() - new Date(pontos[0].chegadaEstimada).getTime(), DURACAO_VISITA_MIN * 60_000);
    assert.ok(new Date(pontos[1].chegadaEstimada) > new Date(pontos[0].saidaEstimada));
  });

  it("não inclui ponto fechado na hora prevista e explica por quê (RB07)", () => {
    const fechado = candidato({ nome: "Feira", horarioFuncionamento: "Seg-Sex 14h-18h" });
    const aberto = candidato({ nome: "Praça" });

    const { pontos, avisos } = planejarRoteiro([fechado, aberto], params({ horasDisponiveis: 1.5 }));

    assert.deepEqual(pontos.map((p) => p.nome), ["Praça"]);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /Feira: estaria fechado às 10:00/);
  });

  it("encaixa o ponto que só abre mais tarde quando dá tempo (a visita cai dentro do horário)", () => {
    const tarde = candidato({ nome: "Museu", horarioFuncionamento: "Seg-Sex 12h-18h", categoria: "Cultura" });
    const livre = candidato({ nome: "Praça" });

    const { pontos } = planejarRoteiro([tarde, livre], params({ interesses: ["Cultura"], horasDisponiveis: 6 }));

    const nomes = pontos.map((p) => p.nome);
    assert.deepEqual(nomes, ["Praça", "Museu"]);
    assert.ok(new Date(pontos[1].chegadaEstimada).getHours() >= 12);
    assert.ok(pontos[1].esperaMin > 0 && pontos[1].esperaMin <= 60, "espera registrada até a abertura");
  });

  it("não inclui o ponto que fecha antes de a visita fazer sentido (menos de 1 h aberto)", () => {
    const fechando = candidato({ nome: "Fechando", horarioFuncionamento: "Seg-Sex 8h-10h30" });

    const { pontos, avisos } = planejarRoteiro([fechando], params({ horasDisponiveis: 3 }));

    assert.equal(pontos.length, 0);
    assert.match(avisos[0], /Fechando: estaria fechado/);
  });

  it("não espera mais de 1 h pela abertura: ponto que só abre bem mais tarde fica de fora", () => {
    const noite = candidato({ nome: "Bar", horarioFuncionamento: "Seg-Sex 20h-23h" });

    const { pontos, avisos } = planejarRoteiro([noite], params({ horasDisponiveis: 6 }));

    assert.equal(pontos.length, 0);
    assert.match(avisos[0], /Bar: estaria fechado/);
  });

  it("respeita o tempo disponível: não passa do fim do passeio", () => {
    const muitos = Array.from({ length: 8 }, (_, i) => candidato({ nome: `P${i}`, longitude: -48.84 + i * 0.001 }));

    const { pontos } = planejarRoteiro(muitos, params({ horasDisponiveis: 3 }));
    const fim = SEGUNDA_10H.getTime() + 3 * 3_600_000;

    assert.ok(pontos.length >= 1 && pontos.length <= 2);
    assert.ok(pontos.every((p) => new Date(p.saidaEstimada).getTime() <= fim));
  });

  it("devolve lista vazia, sem erro, quando não há candidatos", () => {
    assert.deepEqual(planejarRoteiro([], params()), { pontos: [], avisos: [] });
  });

  it("lida com pontos sem coordenadas", () => {
    const sem = candidato({ nome: "Sem mapa", latitude: null, longitude: null });

    const { pontos } = planejarRoteiro([sem], params());

    assert.equal(pontos.length, 1);
    assert.equal(pontos[0].distanciaMetros, null);
  });
});

describe("planejarPorProximidade (fallback AF06)", () => {
  it("devolve os pontos mais próximos da origem, mesmo fechados ou fora do interesse", () => {
    const longe = candidato({ nome: "Longe", longitude: -48.5 });
    const perto = candidato({ nome: "Perto", longitude: -48.84, horarioFuncionamento: "Seg-Sex 3h-4h" });

    const pontos = planejarPorProximidade([longe, perto], params({ horasDisponiveis: 1.5, latitude: -26.3, longitude: -48.84 }));

    assert.deepEqual(pontos.map((p) => p.nome), ["Perto"]);
  });
});
