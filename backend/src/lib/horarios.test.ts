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

  it('não confunde "…-24h" (fim do expediente) com "aberto 24 horas"', () => {
    // Terça-feira ("ter-ter") em uma segunda-feira: fechado, mesmo com "24h" no texto.
    assert.equal(estaAbertoNoHorario("Ter-Ter 0h-24h", segundaAs(10)), false);
    assert.equal(estaAbertoNoHorario("Seg-Sex 8h-24h", sabadoAs(10)), false);
    assert.equal(estaAbertoNoHorario("Seg-Sex 8h-24h", segundaAs(23)), true);
    assert.equal(estaAbertoNoHorario("Seg-Sex 8h-24h", segundaAs(7)), false);
  });

  it("reconhece 24 horas escrito de formas diferentes", () => {
    assert.equal(estaAbertoNoHorario("Aberto 24 horas", segundaAs(3)), true);
    assert.equal(estaAbertoNoHorario("24h", segundaAs(3)), true);
    assert.equal(estaAbertoNoHorario("Seg-Sex 24h", sabadoAs(3)), false);
    assert.equal(estaAbertoNoHorario("Seg-Sex 24h", segundaAs(3)), true);
  });

  it("trata dois turnos no mesmo dia (almoço)", () => {
    const horario = "Seg-Sex 9h-12h e 14h-18h";

    assert.equal(estaAbertoNoHorario(horario, segundaAs(10)), true);
    assert.equal(estaAbertoNoHorario(horario, segundaAs(13)), false);
    assert.equal(estaAbertoNoHorario(horario, segundaAs(15)), true);
  });

  it("trata cláusulas por dia (semana e sábado com horários diferentes)", () => {
    const horario = "Seg-Sex 9h-18h, Sáb 9h-13h";

    assert.equal(estaAbertoNoHorario(horario, segundaAs(17)), true);
    assert.equal(estaAbertoNoHorario(horario, sabadoAs(12)), true);
    assert.equal(estaAbertoNoHorario(horario, sabadoAs(15)), false);
    assert.equal(estaAbertoNoHorario(horario, new Date(2026, 8, 27, 10, 0)), false, "domingo não listado");
  });

  it('entende "fechado" em um dia', () => {
    const horario = "Seg-Sáb 9:00-18:00; Dom fechado";

    assert.equal(estaAbertoNoHorario(horario, segundaAs(10)), true);
    assert.equal(estaAbertoNoHorario(horario, new Date(2026, 8, 27, 10, 0)), false);
  });

  it('entende "a/às/até" e dias por extenso', () => {
    assert.equal(estaAbertoNoHorario("Terça a domingo, das 9h às 17h", segundaAs(10)), false);
    assert.equal(estaAbertoNoHorario("Terça a domingo, das 9h às 17h", sabadoAs(10)), true);
    assert.equal(estaAbertoNoHorario("Segunda a sexta, 8h até 12h", segundaAs(9)), true);
  });

  it("a madrugada de um expediente noturno pertence ao dia anterior", () => {
    // Sex-Sáb 22h-4h: sábado 01h ainda é o expediente de sexta; domingo 01h é o de sábado;
    // segunda 01h já não é (domingo não abre).
    const horario = "Sex-Sáb 22h-4h";

    assert.equal(estaAbertoNoHorario(horario, new Date(2026, 8, 26, 1, 0)), true);
    assert.equal(estaAbertoNoHorario(horario, new Date(2026, 8, 27, 1, 0)), true);
    assert.equal(estaAbertoNoHorario(horario, new Date(2026, 8, 28, 1, 0)), false);
    assert.equal(estaAbertoNoHorario(horario, new Date(2026, 8, 26, 12, 0)), false);
  });

  it("o horário de fechamento já é fechado, o de abertura é aberto", () => {
    assert.equal(estaAbertoNoHorario("9h-18h", segundaAs(9)), true);
    assert.equal(estaAbertoNoHorario("9h-18h", segundaAs(18)), false);
  });

  it("texto que não dá para interpretar conta como aberto", () => {
    assert.equal(estaAbertoNoHorario("Consulte a recepção", segundaAs(3)), true);
    assert.equal(estaAbertoNoHorario("Sob agendamento", sabadoAs(23)), true);
  });
});
