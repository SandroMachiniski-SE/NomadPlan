import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estaAbertoNoHorario } from "./horarios";

// 21/09/2026 é segunda-feira; 26/09/2026 é sábado.
const segundaAs = (hora: number, minuto = 0) => new Date(2026, 8, 21, hora, minuto);
const sabadoAs = (hora: number) => new Date(2026, 8, 26, hora, 0);

describe("estaAbertoNoHorario", () => {
  it("assume aberto quando não há informação de horário", () => {
    assert.equal(estaAbertoNoHorario(null, segundaAs(3)), true);
    assert.equal(estaAbertoNoHorario("   ", segundaAs(3)), true);
    assert.equal(estaAbertoNoHorario("Consulte o local", segundaAs(3)), true);
  });

  it("respeita a faixa de horas", () => {
    assert.equal(estaAbertoNoHorario("9h-18h", segundaAs(10)), true);
    assert.equal(estaAbertoNoHorario("9h-18h", segundaAs(8, 59)), false);
    assert.equal(estaAbertoNoHorario("9h-18h", segundaAs(19)), false);
  });

  it("interpreta minutos na faixa", () => {
    assert.equal(estaAbertoNoHorario("8h30-17h30", segundaAs(8, 15)), false);
    assert.equal(estaAbertoNoHorario("8h30-17h30", segundaAs(8, 45)), true);
  });

  it("respeita o intervalo de dias da semana", () => {
    assert.equal(estaAbertoNoHorario("Seg-Sex 9h-18h", segundaAs(10)), true);
    assert.equal(estaAbertoNoHorario("Seg-Sex 9h-18h", sabadoAs(10)), false);
  });

  it("trata intervalo de dias que passa do fim da semana (sex-dom)", () => {
    assert.equal(estaAbertoNoHorario("Sex-Dom 10h-22h", sabadoAs(12)), true);
    assert.equal(estaAbertoNoHorario("Sex-Dom 10h-22h", segundaAs(12)), false);
  });

  it("aceita 'todos os dias' e '24h' sem restrição", () => {
    assert.equal(estaAbertoNoHorario("Todos os dias, 24h", segundaAs(3)), true);
    assert.equal(estaAbertoNoHorario("24h", sabadoAs(23)), true);
  });

  it("ignora acentos e maiúsculas nos dias (Sáb)", () => {
    assert.equal(estaAbertoNoHorario("SÁB-DOM 9h-13h", sabadoAs(10)), true);
  });

  it("trata faixa que atravessa a meia-noite (22h-2h)", () => {
    assert.equal(estaAbertoNoHorario("22h-2h", segundaAs(23)), true);
    assert.equal(estaAbertoNoHorario("22h-2h", segundaAs(1)), true);
    assert.equal(estaAbertoNoHorario("22h-2h", segundaAs(12)), false);
  });
});
