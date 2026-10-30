import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ErroGeoJson, linhasDeGeoJson, MAX_FEATURES_IMPORTACAO } from "./geojson";

const feature = (propriedades: Record<string, unknown>, coordenadas: unknown = [-48.84, -26.3]) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coordenadas },
  properties: propriedades,
});

const colecao = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

describe("linhasDeGeoJson", () => {
  it("converte Point e propriedades nas mesmas colunas do CSV (longitude vem primeiro no GeoJSON)", () => {
    const [linha] = linhasDeGeoJson(
      colecao(feature({ nome: " Mirante ", categoria: "Natureza", cidade: "Joinville", horarioFuncionamento: "24h" })),
    );

    assert.equal(linha.numero, 1);
    assert.equal(linha.erro, undefined);
    assert.equal(linha.valores.nome, "Mirante");
    assert.equal(linha.valores.latitude, "-26.3");
    assert.equal(linha.valores.longitude, "-48.84");
  });

  it("aceita Feature sem geometria (o ponto entra sem coordenadas)", () => {
    const [linha] = linhasDeGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: null, properties: { nome: "A", categoria: "B", cidade: "C" } }],
      }),
    );

    assert.equal(linha.erro, undefined);
    assert.equal(linha.valores.latitude, undefined);
  });

  it("marca como erro apenas a Feature problemática e segue com as outras", () => {
    const linhas = linhasDeGeoJson(
      colecao(
        feature({ nome: "ok" }),
        { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { nome: "área" } },
        feature({ nome: "sem coords" }, ["x", "y"]),
        { type: "Outra" },
      ),
    );

    assert.equal(linhas.length, 4);
    assert.equal(linhas[0].erro, undefined);
    assert.match(linhas[1].erro ?? "", /Polygon/);
    assert.match(linhas[2].erro ?? "", /Coordenadas/);
    assert.match(linhas[3].erro ?? "", /Feature/);
    assert.deepEqual(linhas.map((l) => l.numero), [1, 2, 3, 4]);
  });

  it("converte números e ignora propriedades desconhecidas", () => {
    const [linha] = linhasDeGeoJson(colecao(feature({ nome: "A", faixaPreco: 25, segredo: "x" })));

    assert.equal(linha.valores.faixaPreco, "25");
    assert.equal("segredo" in linha.valores, false);
  });

  it("recusa JSON inválido e documento que não é FeatureCollection", () => {
    assert.throws(() => linhasDeGeoJson("{nao é json"), ErroGeoJson);
    assert.throws(() => linhasDeGeoJson(JSON.stringify({ type: "Feature" })), /FeatureCollection/);
    assert.throws(() => linhasDeGeoJson(JSON.stringify({ type: "FeatureCollection" })), /FeatureCollection/);
  });

  it("recusa arquivos com registros demais", () => {
    const muitos = Array.from({ length: MAX_FEATURES_IMPORTACAO + 1 }, () => feature({ nome: "x" }));

    assert.throws(() => linhasDeGeoJson(colecao(...muitos)), /mais de/);
  });
});
