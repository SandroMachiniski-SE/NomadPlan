import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estaAbertoNoHorario } from "./horarios";
import { inicioPadrao, planejarRoteiro } from "./recomendacao";
import { diaLocal } from "./metricasUso";

// O contêiner da API na VPS roda em UTC: os horários têm de valer em Brasília mesmo assim.
// Nenhum desses módulos calcula datas ao ser importado, e cada arquivo de teste roda num
// processo próprio: mudar o fuso aqui vale para os testes abaixo e não afeta os outros.
process.env.TZ = "UTC";

// Casa da Memória Annita Hoepcke, como cadastrada no site.
const CASA_DA_MEMORIA = "Seg-Sex 13h-19h; Sáb-Dom fechado; Feriados: fechado";

describe("horários no fuso de Brasília com o servidor em UTC", () => {
  it("quarta às 12:14 de Brasília (15:14 UTC) está fechado; às 13:14 está aberto; sábado, fechado", () => {
    assert.equal(estaAbertoNoHorario(CASA_DA_MEMORIA, new Date("2026-11-18T15:14:00Z")), false);
    assert.equal(estaAbertoNoHorario(CASA_DA_MEMORIA, new Date("2026-11-18T16:14:00Z")), true);
    assert.equal(estaAbertoNoHorario(CASA_DA_MEMORIA, new Date("2026-11-21T16:14:00Z")), false);
    // 23h de sexta em Brasília já é sábado em UTC: continua sendo sexta para o horário.
    assert.equal(estaAbertoNoHorario("Sex 22h-24h", new Date("2026-11-21T02:00:00Z")), true);
  });

  it("o gerador não marca a visita antes da abertura (o caso do site: 12:14 com abertura às 13h)", () => {
    const { pontos } = planejarRoteiro(
      [
        {
          id: 1,
          nome: "Casa da Memória Annita Hoepcke da Silva",
          categoria: "Cultura",
          cidade: "Florianópolis",
          endereco: null,
          latitude: -27.59,
          longitude: -48.55,
          faixaPreco: null,
          acessibilidade: null,
          horarioFuncionamento: CASA_DA_MEMORIA,
          imagemUrl: null,
          imagemCredito: null,
          seloVerificado: false,
          mediaAvaliacao: null,
        },
      ],
      { cidade: "Florianópolis", dataHoraInicio: new Date("2026-11-18T15:14:00Z"), horasDisponiveis: 6, interesses: ["Cultura"] },
    );

    assert.equal(pontos.length, 1);
    assert.ok(new Date(pontos[0].chegadaEstimada) >= new Date("2026-11-18T16:00:00Z"), pontos[0].chegadaEstimada);
    assert.ok(pontos[0].esperaMin > 0);
  });

  it("o início padrão segue o horário comercial de Brasília", () => {
    // 10:44 de Brasília: começa agora.
    assert.equal(inicioPadrao(new Date("2026-11-18T13:44:00Z")).toISOString(), "2026-11-18T13:44:00.000Z");
    // 7h de Brasília: começa às 9h de Brasília (12h UTC), não às 9h UTC (6h de Brasília).
    assert.equal(inicioPadrao(new Date("2026-11-18T10:00:00Z")).toISOString(), "2026-11-18T12:00:00.000Z");
    // 18h de Brasília (21h UTC): às 9h de Brasília do dia seguinte.
    assert.equal(inicioPadrao(new Date("2026-11-18T21:00:00Z")).toISOString(), "2026-11-19T12:00:00.000Z");
  });

  it("o dia das métricas é o de Brasília", () => {
    // 22h de quarta em Brasília já é quinta em UTC.
    assert.equal(diaLocal(new Date("2026-11-19T01:00:00Z")), "2026-11-18");
  });
});
