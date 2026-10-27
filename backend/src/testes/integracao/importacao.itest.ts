import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { StatusPonto, TipoConta } from "@prisma/client";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

function arquivo(conteudo: string | Buffer, nome: string, tipo: string): FormData {
  const form = new FormData();
  form.append("arquivo", new Blob([typeof conteudo === "string" ? conteudo : new Uint8Array(conteudo)], { type: tipo }), nome);
  return form;
}

const CABECALHO = "nome,categoria,cidade,endereco,latitude,longitude,horarioFuncionamento";

const geojson = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
const feature = (propriedades: Record<string, unknown>, coordenadas: unknown = [-48.84, -26.3]) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coordenadas },
  properties: propriedades,
});

describe("exportação e importação de inventário (RF17, RF18, AF09)", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let gestor: Awaited<ReturnType<typeof criarUsuario>>;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    gestor = await criarUsuario({ tipoConta: TipoConta.GESTOR });
  });

  after(async () => {
    await servidor.fechar();
  });

  describe("exportação", () => {
    it("só gestores, moderadores e administradores exportam", async () => {
      const negocio = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const visitante = await criarUsuario();

      assert.equal((await api("GET", "/pontos/exportar")).status, 401);
      assert.equal((await api("GET", "/pontos/exportar", { token: visitante.token })).status, 403);
      assert.equal((await api("GET", "/pontos/exportar", { token: negocio.token })).status, 403);
      assert.equal((await api("GET", "/pontos/exportar", { token: gestor.token })).status, 200);
    });

    it("exporta CSV só com pontos publicados, escapando vírgulas e aspas", async () => {
      await criarPonto({ nome: 'Café, "Bom Dia"', descricao: "Linha1" });
      await criarPonto({ nome: "Rascunho", status: StatusPonto.RASCUNHO });

      const r = await api("GET", "/pontos/exportar?formato=csv", { token: gestor.token });

      assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(r.headers.get("content-disposition") ?? "", /pontos\.csv/);
      assert.ok(r.texto.startsWith("id,nome,descricao,categoria,cidade"));
      assert.ok(r.texto.includes('"Café, ""Bom Dia"""'));
      assert.ok(!r.texto.includes("Rascunho"));
    });

    it("exporta GeoJSON com longitude antes da latitude e as propriedades do ponto", async () => {
      await criarPonto({ nome: "Mirante", latitude: -26.3, longitude: -48.84, faixaPreco: "Gratuito" });
      await criarPonto({ nome: "Sem mapa", latitude: null, longitude: null });

      const r = await api("GET", "/pontos/exportar?formato=geojson", { token: gestor.token });

      assert.match(r.headers.get("content-type") ?? "", /geo\+json/);
      assert.equal(r.corpo.type, "FeatureCollection");
      assert.equal(r.corpo.features.length, 1);
      assert.deepEqual(r.corpo.features[0].geometry.coordinates, [-48.84, -26.3]);
      assert.equal(r.corpo.features[0].properties.faixaPreco, "Gratuito");
    });

    it("recusa formato desconhecido e registra a exportação no log", async () => {
      assert.equal((await api("GET", "/pontos/exportar?formato=xml", { token: gestor.token })).status, 400);

      await api("GET", "/pontos/exportar", { token: gestor.token });
      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "exportar", idUsuario: gestor.usuario.id } }));
    });

    it("o que se exporta em GeoJSON pode ser importado de volta", async () => {
      await criarPonto({ nome: "Ponto de ida e volta", categoria: "Cultura", cidade: "Blumenau", horarioFuncionamento: "24h" });
      const exportado = await api("GET", "/pontos/exportar?formato=geojson", { token: gestor.token });
      await limparBanco();
      const novoGestor = await criarUsuario({ tipoConta: TipoConta.GESTOR });

      const r = await api("POST", "/pontos/importar", {
        token: novoGestor.token,
        form: arquivo(exportado.texto, "pontos.geojson", "application/geo+json"),
      });

      assert.equal(r.corpo.sucesso, 1);
      const importado = await prisma.pontoTuristico.findFirstOrThrow({ where: { nome: "Ponto de ida e volta" } });
      assert.equal(importado.cidade, "Blumenau");
      assert.equal(importado.latitude, -26.3045);
    });
  });

  describe("modelos de arquivo (AF09)", () => {
    it("oferece um modelo CSV e outro GeoJSON que a própria importação aceita", async () => {
      const csv = await api("GET", "/pontos/importar/modelo?formato=csv", { token: gestor.token });
      const geo = await api("GET", "/pontos/importar/modelo?formato=geojson", { token: gestor.token });

      assert.equal(csv.status, 200);
      assert.ok(csv.texto.startsWith("nome,categoria,cidade"));
      assert.equal(geo.corpo.type, "FeatureCollection");

      const r1 = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo(csv.texto, "modelo.csv", "text/csv") });
      assert.equal(r1.corpo.sucesso, 1, "o modelo CSV precisa ser importável");
      assert.equal(r1.corpo.falhas.length, 0);

      const r2 = await api("POST", "/pontos/importar?confirmarDuplicidade=true", {
        token: gestor.token,
        form: arquivo(geo.texto, "modelo.geojson", "application/geo+json"),
      });
      assert.equal(r2.corpo.sucesso, 1, "o modelo GeoJSON precisa ser importável");
    });

    it("recusa formato de modelo inexistente", async () => {
      assert.equal((await api("GET", "/pontos/importar/modelo?formato=pdf", { token: gestor.token })).status, 400);
    });
  });

  describe("importação de CSV", () => {
    it("importa as linhas válidas como rascunho do usuário e relata as inválidas com o número da linha", async () => {
      const csv = [
        CABECALHO,
        "Museu A,Cultura,Joinville,Rua 1,-26.30,-48.84,Seg-Sex 9h-18h",
        ",Cultura,Joinville,,,,", // sem nome
        "Parque B,Natureza,Joinville,,-26.40,-48.90,24h",
        "Praça C,Natureza,Joinville,,99,-48.90,24h", // latitude fora do intervalo
      ].join("\n");

      const r = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo(csv, "pontos.csv", "text/csv") });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.total, 4);
      assert.equal(r.corpo.sucesso, 2);
      assert.deepEqual(
        r.corpo.falhas.map((f: { linha: number }) => f.linha),
        [3, 5],
      );
      assert.match(r.corpo.falhas[0].motivo, /nome/);
      assert.match(r.corpo.falhas[1].motivo, /latitude/);

      const criados = await prisma.pontoTuristico.findMany({ orderBy: { nome: "asc" } });
      assert.deepEqual(criados.map((p) => [p.nome, p.status, p.idResponsavel]), [
        ["Museu A", "RASCUNHO", gestor.usuario.id],
        ["Parque B", "RASCUNHO", gestor.usuario.id],
      ]);
    });

    it("barra duplicados do inventário e do próprio arquivo, a menos que se confirme", async () => {
      await criarPonto({ nome: "Museu A", cidade: "Joinville" });
      const csv = [CABECALHO, "Museu A,Cultura,Joinville,,,,24h", "Novo,Cultura,Joinville,,,,24h", "novo,Cultura,Joinville,,,,24h"].join("\n");

      const r = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo(csv, "pontos.csv", "text/csv") });

      assert.equal(r.corpo.sucesso, 1);
      assert.deepEqual(r.corpo.falhas.map((f: { linha: number }) => f.linha), [2, 4]);
      assert.match(r.corpo.falhas[0].motivo, /Possível duplicado de "Museu A"/);

      const confirmado = await api("POST", "/pontos/importar?confirmarDuplicidade=true", {
        token: gestor.token,
        form: arquivo(csv, "pontos.csv", "text/csv"),
      });
      assert.equal(confirmado.corpo.sucesso, 3);
    });

    it('"confirmarDuplicidade=false" vale como falso', async () => {
      await criarPonto({ nome: "Museu A", cidade: "Joinville" });
      const csv = [CABECALHO, "Museu A,Cultura,Joinville,,,,24h"].join("\n");

      const r = await api("POST", "/pontos/importar?confirmarDuplicidade=false", {
        token: gestor.token,
        form: arquivo(csv, "pontos.csv", "text/csv"),
      });

      assert.equal(r.corpo.sucesso, 0);
    });

    it("recusa o arquivo inteiro quando faltam colunas obrigatórias", async () => {
      const r = await api("POST", "/pontos/importar", {
        token: gestor.token,
        form: arquivo("titulo,lugar\nA,B", "errado.csv", "text/csv"),
      });

      assert.equal(r.status, 400);
      assert.match(r.corpo.erro, /colunas: nome, categoria, cidade/);
      assert.equal(await prisma.pontoTuristico.count(), 0);
    });

    it("trata arquivo sem linhas de dados, sem arquivo e de tipo errado", async () => {
      const vazio = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo(CABECALHO, "vazio.csv", "text/csv") });
      assert.equal(vazio.status, 200);
      assert.equal(vazio.corpo.total, 0);

      assert.equal((await api("POST", "/pontos/importar", { token: gestor.token, form: new FormData() })).status, 400);

      const pdf = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo("%PDF", "doc.pdf", "application/pdf") });
      assert.equal(pdf.status, 400);
      assert.match(pdf.corpo.erro, /\.csv ou \.geojson/);
    });

    it("recusa arquivo acima de 2 MB com 413", async () => {
      const grande = CABECALHO + "\n" + "x".repeat(2 * 1024 * 1024 + 100);
      const r = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo(grande, "grande.csv", "text/csv") });

      assert.equal(r.status, 413);
      assert.match(r.corpo.erro, /2 MB/);
    });

    it("só gestores, moderadores e administradores importam", async () => {
      const negocio = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
      const csv = [CABECALHO, "A,B,C,,,,24h"].join("\n");

      assert.equal((await api("POST", "/pontos/importar", { form: arquivo(csv, "a.csv", "text/csv") })).status, 401);
      assert.equal((await api("POST", "/pontos/importar", { token: negocio.token, form: arquivo(csv, "a.csv", "text/csv") })).status, 403);
    });

    it("aceita CSV com aspas, quebra de linha dentro do campo e CRLF, e registra no log", async () => {
      const csv = `${CABECALHO}\r\n"Café, Bar",Gastronomia,Joinville,"Rua A,\n100",-26.31,-48.85,"Seg-Sex 8h-18h"\r\n`;

      const r = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo(csv, "pontos.csv", "text/csv") });

      assert.equal(r.corpo.sucesso, 1);
      const ponto = await prisma.pontoTuristico.findFirstOrThrow();
      assert.equal(ponto.nome, "Café, Bar");
      assert.equal(ponto.endereco, "Rua A,\n100");
      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "importar" } }));
    });
  });

  describe("importação de GeoJSON", () => {
    it("importa Points (longitude primeiro) e relata Features inválidas pela posição", async () => {
      const conteudo = geojson(
        feature({ nome: "Mirante", categoria: "Natureza", cidade: "Joinville", horarioFuncionamento: "24h" }, [-48.84, -26.3]),
        { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { nome: "Área" } },
        feature({ nome: "Sem categoria", cidade: "Joinville" }),
      );

      const r = await api("POST", "/pontos/importar", {
        token: gestor.token,
        form: arquivo(conteudo, "pontos.geojson", "application/geo+json"),
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo.total, 3);
      assert.equal(r.corpo.sucesso, 1);
      assert.deepEqual(r.corpo.falhas.map((f: { linha: number }) => f.linha), [2, 3]);
      assert.match(r.corpo.falhas[0].motivo, /Polygon/);

      const ponto = await prisma.pontoTuristico.findFirstOrThrow({ where: { nome: "Mirante" } });
      assert.equal(ponto.latitude, -26.3);
      assert.equal(ponto.longitude, -48.84);
    });

    it("recusa JSON inválido e documento que não é FeatureCollection", async () => {
      const quebrado = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo("{nao é json", "a.geojson", "application/json") });
      const errado = await api("POST", "/pontos/importar", { token: gestor.token, form: arquivo('{"type":"Feature"}', "a.geojson", "application/json") });

      assert.equal(quebrado.status, 400);
      assert.match(quebrado.corpo.erro, /JSON válido/);
      assert.equal(errado.status, 400);
      assert.match(errado.corpo.erro, /FeatureCollection/);
    });
  });
});
