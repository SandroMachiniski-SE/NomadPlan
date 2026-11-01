import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ElementoOsm } from "./osm";
import { consultaDoResumo, distribuirElementos } from "./resumoOsm";

// Duas cidades no equador, a ~8 km uma da outra (0,072° de longitude).
const A = { codigoIbge: 1, latitude: 0, longitude: 0 };
const B = { codigoIbge: 2, latitude: 0, longitude: 0.072 };

let id = 0;
const no = (lat: number, lon: number, tags: Record<string, string>): ElementoOsm => ({
  type: "node",
  id: ++id,
  lat,
  lon,
  tags,
});

describe("distribuirElementos", () => {
  it("cada elemento conta só para a cidade mais próxima dentro de 8 km", () => {
    const resumos = distribuirElementos(
      [
        no(0, 0.018, { name: "Hotel Perto de A", tourism: "hotel" }),
        // ~12 km das duas: fora do raio
        no(0.108, 0.036, { name: "Museu Longe", tourism: "museum" }),
      ],
      [A, B],
    );

    assert.equal(resumos.get(1)!.totalHospedagens, 1);
    assert.equal(resumos.get(1)!.hospedagens[0].nome, "Hotel Perto de A");
    assert.equal(resumos.get(2)!.totalHospedagens, 0);
    assert.equal(resumos.get(1)!.totalAtracoes + resumos.get(2)!.totalAtracoes, 0);
  });

  it("separa hospedagens das atrações e ignora elementos sem nome", () => {
    const resumos = distribuirElementos(
      [
        no(0, 0.001, { name: "Pousada do Centro", tourism: "guest_house" }),
        no(0, 0.002, { name: "Museu da Cidade", tourism: "museum" }),
        no(0, 0.003, { historic: "monument" }),
        { type: "way", id: 77, center: { lat: 0, lon: 0.004 }, tags: { name: "Cachoeira Alta", waterway: "waterfall" } },
      ],
      [A],
    );
    const resumo = resumos.get(1)!;

    assert.deepEqual(
      resumo.hospedagens.map((h) => [h.idOsm, h.nome, h.tipo]),
      [[`node/${id - 2}`, "Pousada do Centro", "guest_house"]],
    );
    assert.deepEqual(
      resumo.atracoes.map((a) => a.nome).sort(),
      ["Cachoeira Alta", "Museu da Cidade"],
    );
    assert.equal(resumo.totalAtracoes, 2);
  });

  it("guarda no máximo 40 hospedagens, as mais completas primeiro, e conta todas", () => {
    const hoteis = Array.from({ length: 45 }, (_, i) =>
      no(0, 0.001, { name: `Hotel ${String(i).padStart(2, "0")}`, tourism: "hotel", ...(i >= 42 ? { phone: "+55 47 3000-0000" } : {}) }),
    );

    const resumo = distribuirElementos(hoteis, [A]).get(1)!;

    assert.equal(resumo.totalHospedagens, 45);
    assert.equal(resumo.hospedagens.length, 40);
    assert.ok(resumo.hospedagens.slice(0, 3).every((h) => h.tags.phone));
  });

  it("guarda no máximo 10 atrações", () => {
    const atracoes = Array.from({ length: 12 }, (_, i) => no(0, 0.001, { name: `Mirante ${i}`, tourism: "viewpoint" }));

    const resumo = distribuirElementos(atracoes, [A]).get(1)!;

    assert.equal(resumo.atracoes.length, 10);
    assert.equal(resumo.totalAtracoes, 12);
  });
});

describe("consultaDoResumo", () => {
  it("procura em 8 km de cada cidade, com timeout de 25 s e o centro das áreas", () => {
    const consulta = consultaDoResumo([A, B]);

    assert.ok(consulta.includes("around:8000,0,0)"), consulta);
    assert.ok(consulta.includes("around:8000,0,0.072)"), consulta);
    assert.ok(consulta.startsWith("[out:json][timeout:25];"), consulta);
    assert.ok(consulta.trimEnd().endsWith("out center tags;"), consulta);
  });
});
