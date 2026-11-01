import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ErroRota, kmApos, lerRespostaOsrm, montarPerfil, SemEstrada, segundosAte } from "./rotas";
import { rotaOsrm } from "../testes/mapasFalsos";

describe("perfil de tempo da rota", () => {
  it("montarPerfil acumula de 5 em 5 km e fecha no total", () => {
    // 12 trechos de 1 km a 80 km/h (45 s cada).
    const perfil = montarPerfil(Array(12).fill(1000), Array(12).fill(45));

    assert.deepEqual(perfil, [
      [0, 0],
      [5, 225],
      [10, 450],
      [12, 540],
    ]);
  });

  it("segundosAte interpola entre os pontos do perfil", () => {
    assert.equal(segundosAte([[0, 0], [10, 600]], 2.5), 150);
  });

  it("segundosAte fica no total depois do fim e em zero antes do início", () => {
    assert.equal(segundosAte([[0, 0], [10, 600]], 12), 600);
    assert.equal(segundosAte([[0, 0], [10, 600]], -1), 0);
  });

  it("kmApos converte horas em km a partir de um ponto", () => {
    assert.equal(kmApos([[0, 0], [100, 3600], [200, 10800]], 50, 3600), 125);
  });

  it("kmApos não passa do fim", () => {
    assert.equal(kmApos([[0, 0], [100, 3600]], 90, 7200), 100);
  });
});

describe("resposta do OSRM", () => {
  it("lê metros, segundos, coordenadas e as anotações de cada trecho", () => {
    const corpo = rotaOsrm([
      [-48, -26],
      [-48, -25.5],
      [-48, -25],
    ]);

    const rota = lerRespostaOsrm(corpo);

    assert.equal(rota.coordenadas.length, 3);
    assert.equal(rota.distancias.length, 2);
    assert.equal(rota.duracoes.length, 2);
    assert.ok(rota.metros > 111_000 && rota.metros < 111_400, `metros ${rota.metros}`);
    assert.equal(rota.segundos, Math.round(rota.metros / (80 / 3.6)));
  });

  it("NoRoute vira SemEstrada", () => {
    assert.throws(() => lerRespostaOsrm({ code: "NoRoute" }), SemEstrada);
  });

  it("resposta sem rota vira ErroRota", () => {
    assert.throws(() => lerRespostaOsrm({ code: "Ok", routes: [] }), ErroRota);
    assert.throws(() => lerRespostaOsrm("nada"), ErroRota);
  });
});
