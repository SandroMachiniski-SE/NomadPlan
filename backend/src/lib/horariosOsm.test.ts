import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { converterHorarioOsm } from "./horariosOsm";
import { estaAbertoNoHorario } from "./horarios";

// 21/09/2026 é segunda-feira; os dias seguintes vão até domingo, 27/09.
const diaAs = (diaDaSemana: number, hora: number, minuto = 0) =>
  new Date(2026, 8, 20 + (diaDaSemana === 0 ? 7 : diaDaSemana), hora, minuto);

describe("converterHorarioOsm", () => {
  it("converte os formatos mais comuns do OpenStreetMap", () => {
    assert.equal(converterHorarioOsm("24/7"), "Todos os dias, 24h");
    assert.equal(converterHorarioOsm("Mo-Su 09:00-18:00"), "Todos os dias, 9h-18h");
    assert.equal(converterHorarioOsm("11:30-15:00"), "Todos os dias, 11h30-15h");
    assert.equal(
      converterHorarioOsm("Mo-Fr 10:00-22:00; Sa 10:00-17:00; Su,PH 11:00-17:00"),
      "Seg-Sex 10h-22h; Sáb 10h-17h; Dom e feriados 11h-17h",
    );
    assert.equal(
      converterHorarioOsm("Tu-Fr 09:00-17:00;Sa, Su, PH 12:00-18:00"),
      "Ter-Sex 9h-17h; Sáb-Dom e feriados 12h-18h; Seg fechado",
    );
  });

  it("junta várias faixas no mesmo dia e regras adicionais separadas por vírgula", () => {
    assert.equal(
      converterHorarioOsm("Mo-Sa 11:30-14:30, 18:30-23:00; Su 11:30-15:30"),
      "Seg-Sáb 11h30-14h30 e 18h30-23h; Dom 11h30-15h30",
    );
    assert.equal(
      converterHorarioOsm("Mo-Fr 09:00-18:00, Sa 09:00-13:00"),
      "Seg-Sex 9h-18h; Sáb 9h-13h; Dom fechado",
    );
  });

  it("aplica a regra que vem depois por cima da anterior, como manda a especificação", () => {
    assert.equal(converterHorarioOsm("Mo-Su 09:00-18:00; Mo off"), "Ter-Dom 9h-18h; Seg fechado");
  });

  it("trata meia-noite, madrugada e intervalos que dão a volta na semana", () => {
    assert.equal(converterHorarioOsm("We-Mo 18:30-00:00"), "Qua-Seg 18h30-24h; Ter fechado");
    assert.equal(
      converterHorarioOsm("Tu,We,Su 17:30-24:00; Th-Sa 17:30-01:00"),
      "Ter-Qua 17h30-24h; Qui-Sáb 17h30-1h; Dom 17h30-24h; Seg fechado",
    );
    assert.equal(converterHorarioOsm("Fr-Sa 22:00-26:00"), "Sex-Sáb 22h-2h; Dom-Qui fechado");
  });

  it("informa feriados fechados e aceita traço longo no lugar do hífen", () => {
    assert.equal(converterHorarioOsm("Mo-Su 10:00-22:00; PH off"), "Todos os dias, 10h-22h; Feriados: fechado");
    assert.equal(converterHorarioOsm("18:00–23:30"), "Todos os dias, 18h-23h30");
  });

  it("devolve null para o que não sabe converter", () => {
    assert.equal(converterHorarioOsm(""), null);
    assert.equal(converterHorarioOsm("sunrise-sunset"), null);
    assert.equal(converterHorarioOsm("Sa 19:30+"), null);
    assert.equal(converterHorarioOsm('Fr,Sa 22:00+ open "Consultar programação"'), null);
    assert.equal(converterHorarioOsm("Jan-Mar Mo-Fr 09:00-17:00"), null);
    assert.equal(converterHorarioOsm("Mo-Fr 25:00-26:00"), null);
    assert.equal(converterHorarioOsm("off"), null);
  });

  it("gera um texto que o interpretador de horários entende do mesmo jeito", () => {
    const casos: [osm: string, dia: number, hora: number, aberto: boolean][] = [
      ["Mo-Fr 10:00-22:00; Sa 10:00-17:00; Su,PH 11:00-17:00", 1, 21, true],
      ["Mo-Fr 10:00-22:00; Sa 10:00-17:00; Su,PH 11:00-17:00", 6, 18, false],
      ["Mo-Fr 10:00-22:00; Sa 10:00-17:00; Su,PH 11:00-17:00", 0, 12, true],
      ["Tu-Fr 09:00-17:00;Sa, Su, PH 12:00-18:00", 1, 10, false],
      ["Tu-Fr 09:00-17:00;Sa, Su, PH 12:00-18:00", 6, 13, true],
      ["Mo-Sa 11:30-14:30, 18:30-23:00; Su 11:30-15:30", 3, 16, false],
      ["Mo-Sa 11:30-14:30, 18:30-23:00; Su 11:30-15:30", 3, 19, true],
      ["We-Mo 18:30-00:00", 2, 20, false],
      ["We-Mo 18:30-00:00", 1, 20, true],
      ["Tu,We,Su 17:30-24:00; Th-Sa 17:30-01:00", 5, 0, true], // madrugada de quinta para sexta
      ["Tu,We,Su 17:30-24:00; Th-Sa 17:30-01:00", 4, 0, false], // de quarta para quinta, não
      ["Mo-Su 09:00-18:00; Mo off", 1, 10, false],
      ["24/7", 0, 3, true],
    ];

    for (const [osm, dia, hora, aberto] of casos) {
      const convertido = converterHorarioOsm(osm);

      assert.equal(estaAbertoNoHorario(convertido, diaAs(dia, hora)), aberto, `${osm} → ${convertido}`);
    }
  });
});
