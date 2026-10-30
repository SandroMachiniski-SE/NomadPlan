import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comTrechos, distanciaDoPercurso, minutosParaPercorrer, otimizarOrdem, trechoEntre } from "./trajeto";

// Pontos numa linha de leste a oeste, a ~1,1 km um do outro (0,01° de longitude no equador).
const P = (id: number, lng: number) => ({ id, latitude: 0, longitude: lng });

describe("trechoEntre", () => {
  it("dentro da cidade, estima o tempo a 25 km/h em linha reta", () => {
    const trecho = trechoEntre(P(1, 0), P(2, 0.045))!;

    assert.ok(trecho.metros > 4900 && trecho.metros < 5100);
    assert.equal(trecho.minutos, minutosParaPercorrer(trecho.metros));
    assert.equal(trecho.minutos, 12);
  });

  it("entre cidades, estima pela estrada: 30% mais longa, a 70 km/h, mais 10 min", () => {
    // Joinville a Blumenau: ~67 km em linha reta, perto de 1h30 de carro.
    const minutos = minutosParaPercorrer(67_000);

    assert.ok(minutos >= 80 && minutos <= 90, `${minutos} min`);
  });

  it("não inventa trecho quando falta coordenada", () => {
    assert.equal(trechoEntre(P(1, 0), { id: 2, latitude: null, longitude: null }), null);
  });

  it("trechos muito curtos contam ao menos 1 minuto", () => {
    assert.equal(trechoEntre(P(1, 0), P(2, 0.00001))!.minutos, 1);
  });
});

describe("otimizarOrdem", () => {
  it("mantém a partida e põe as paradas em ordem de proximidade", () => {
    const r = otimizarOrdem([P(1, 0), P(2, 0.3), P(3, 0.1), P(4, 0.2)]);

    assert.deepEqual(r.ids, [1, 3, 4, 2]);
    assert.ok(r.metrosDepois < r.metrosAntes);
  });

  it("não mexe numa ordem que já é a melhor", () => {
    const paradas = [P(1, 0), P(2, 0.1), P(3, 0.2), P(4, 0.3)];
    const r = otimizarOrdem(paradas);

    assert.deepEqual(r.ids, [1, 2, 3, 4]);
    assert.equal(r.metrosAntes, r.metrosDepois);
  });

  it("corrige cruzamentos que o vizinho mais próximo não resolve (2-opt)", () => {
    // Quadrado visitado em "X": o percurso 1-3-2-4 cruza; o melhor contorna o quadrado.
    const q = (id: number, lat: number, lng: number) => ({ id, latitude: lat, longitude: lng });
    const r = otimizarOrdem([q(1, 0, 0), q(3, 0.1, 0.1), q(2, 0, 0.1), q(4, 0.1, 0)]);

    assert.ok(r.metrosDepois < r.metrosAntes);
    assert.equal(distanciaDoPercurso(r.ids.map((id) => [q(1, 0, 0), q(3, 0.1, 0.1), q(2, 0, 0.1), q(4, 0.1, 0)].find((p) => p.id === id)!)), r.metrosDepois);
  });

  it("deixa as paradas sem coordenadas no fim, na ordem original", () => {
    const sem = (id: number) => ({ id, latitude: null, longitude: null });
    const r = otimizarOrdem([P(1, 0), sem(9), P(2, 0.3), P(3, 0.1), sem(8)]);

    assert.deepEqual(r.ids, [1, 3, 2, 9, 8]);
  });

  it("com menos de 3 paradas localizadas não há o que otimizar", () => {
    assert.deepEqual(otimizarOrdem([P(2, 0.5), P(1, 0)]).ids, [2, 1]);
    assert.deepEqual(otimizarOrdem([]).ids, []);
  });
});

describe("comTrechos", () => {
  it("calcula o trecho desde a parada anterior do mesmo dia", () => {
    const itens = [
      { id: 1, dia: 1, ponto: P(10, 0) },
      { id: 2, dia: 1, ponto: P(11, 0.1) },
      { id: 3, dia: 2, ponto: P(12, 0.5) },
      { id: 4, dia: 2, ponto: P(13, 0.6) },
    ];

    const r = comTrechos(itens);

    assert.equal(r[0].deslocamento, null);
    assert.ok(r[1].deslocamento && r[1].deslocamento.metros > 11000);
    assert.equal(r[2].deslocamento, null, "o primeiro de cada dia não tem trecho");
    assert.ok(r[3].deslocamento && r[3].deslocamento.metros < 12000);
  });
});
