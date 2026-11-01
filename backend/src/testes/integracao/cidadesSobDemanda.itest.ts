import "../ambiente";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";
import { elementosOverpass, instalarMapasFalsos, municipioNominatim } from "../mapasFalsos";

describe("qualquer cidade do Brasil: busca e preparação sob demanda", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let mapas: ReturnType<typeof instalarMapasFalsos> | null = null;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
  });

  afterEach(() => {
    mapas?.desinstalar();
    mapas = null;
  });

  after(async () => {
    await servidor.fechar();
  });

  async function esperarPreparo(token: string, cidade: string, uf: string) {
    for (let tentativa = 0; tentativa < 50; tentativa += 1) {
      const r = await api("GET", `/cidades/preparar?cidade=${encodeURIComponent(cidade)}&uf=${uf}`, { token });

      if (r.corpo.estado !== "preparando") {
        return r.corpo;
      }

      await new Promise((resolver) => setTimeout(resolver, 100));
    }

    throw new Error("O preparo da cidade não terminou a tempo.");
  }

  describe("busca de cidade", () => {
    it("exige ao menos 2 letras", async () => {
      assert.equal((await api("GET", "/cidades/buscar?q=a")).status, 400);
      assert.equal((await api("GET", "/cidades/buscar")).status, 400);
    });

    it("acha um município de qualquer estado e diz que ele ainda não tem dados", async () => {
      mapas = instalarMapasFalsos({
        nominatim: () => ({
          corpo: [
            municipioNominatim("Gramado", "RS", -29.379, -50.873),
            // bairro com o mesmo nome: não é município e não deve aparecer
            { ...municipioNominatim("Gramado", "SP", -23.33, -47.43), addresstype: "suburb" },
          ],
        }),
      });

      const r = await api("GET", "/cidades/buscar?q=Gramado");

      assert.equal(r.status, 200);
      assert.equal(r.corpo.dados.length, 1);
      assert.deepEqual(
        { cidade: r.corpo.dados[0].cidade, uf: r.corpo.dados[0].uf, pontos: r.corpo.dados[0].pontos, disponivel: r.corpo.dados[0].disponivel },
        { cidade: "Gramado", uf: "RS", pontos: 0, disponivel: false },
      );
    });

    it("separa cidades de mesmo nome em estados diferentes pela distância dos pontos", async () => {
      // "Bom Jesus" de Santa Catarina já tem pontos; a do Rio Grande do Sul não.
      for (let i = 0; i < 3; i += 1) {
        await criarPonto({ cidade: "Bom Jesus", latitude: -26.73 + i * 0.001, longitude: -52.39 });
      }

      mapas = instalarMapasFalsos({
        nominatim: () => ({
          corpo: [municipioNominatim("Bom Jesus", "SC", -26.73, -52.39), municipioNominatim("Bom Jesus", "RS", -28.67, -50.43)],
        }),
      });

      const r = await api("GET", "/cidades/buscar?q=Bom Jesus");
      const porUf = Object.fromEntries(r.corpo.dados.map((c: { uf: string; disponivel: boolean }) => [c.uf, c.disponivel]));

      assert.deepEqual(porUf, { SC: true, RS: false });
    });

    it("sem o servidor de mapas, ainda lista as cidades que já têm dados", async () => {
      await criarPonto({ cidade: "Joinville" });
      mapas = instalarMapasFalsos({ nominatim: () => ({ status: 503, corpo: {} }) });

      const r = await api("GET", "/cidades/buscar?q=joinv");

      assert.equal(r.status, 200);
      assert.equal(r.corpo.semServidorDeMapas, true);
      assert.deepEqual(
        r.corpo.dados.map((c: { cidade: string; disponivel: boolean }) => [c.cidade, c.disponivel]),
        [["Joinville", true]],
      );
    });
  });

  describe("preparar uma cidade nova", () => {
    const PEDIDO = { cidade: "Treze Tílias", uf: "SC", latitude: -27.0, longitude: -51.4 };

    it("exige login e uma cidade válida do Brasil", async () => {
      const { token } = await criarUsuario();

      assert.equal((await api("POST", "/cidades/preparar", { json: PEDIDO })).status, 401);
      assert.equal((await api("POST", "/cidades/preparar", { token, json: { ...PEDIDO, uf: "XX" } })).status, 400);
      assert.equal((await api("POST", "/cidades/preparar", { token, json: { ...PEDIDO, latitude: 48.8, longitude: 2.3 } })).status, 400);
      assert.equal((await api("POST", "/cidades/preparar", { token, json: { ...PEDIDO, cidade: '"; drop table x;--' } })).status, 400);
    });

    it("baixa os lugares do OpenStreetMap, grava no banco e a cidade passa a estar disponível", async () => {
      const { token } = await criarUsuario();
      mapas = instalarMapasFalsos({
        overpass: () => ({ corpo: { elements: elementosOverpass(PEDIDO.latitude, PEDIDO.longitude) } }),
        nominatim: () => ({ corpo: [municipioNominatim(PEDIDO.cidade, PEDIDO.uf, PEDIDO.latitude, PEDIDO.longitude)] }),
      });

      const pedido = await api("POST", "/cidades/preparar", { token, json: PEDIDO });

      assert.equal(pedido.status, 202);
      assert.equal(pedido.corpo.estado, "preparando");

      const fim = await esperarPreparo(token, PEDIDO.cidade, PEDIDO.uf);

      assert.equal(fim.estado, "pronta", JSON.stringify(fim));
      assert.ok(fim.pontos >= 3);

      const gravados = await prisma.pontoTuristico.findMany({ where: { cidade: PEDIDO.cidade } });
      assert.equal(gravados.length, fim.pontos);
      assert.ok(gravados.every((p) => p.status === "PUBLICADO" && p.idOsm !== null));

      // a consulta do Overpass tem de ser pela cidade e pela UF pedidas
      const consulta = mapas.chamadas.find((c) => c.servico === "overpass")!.corpo!;
      assert.match(consulta, /BR-SC/);
      assert.match(consulta, /Treze Tílias/);

      // pedir de novo não baixa nada: a cidade já tem dados
      const denovo = await api("POST", "/cidades/preparar", { token, json: PEDIDO });
      assert.equal(denovo.status, 200);
      assert.equal(denovo.corpo.estado, "pronta");
      assert.equal(mapas.chamadas.filter((c) => c.servico === "overpass").length, 1);

      const busca = await api("GET", "/cidades/buscar?q=Treze");
      assert.equal(busca.corpo.dados[0].disponivel, true);

      // e já dá para buscar os pontos da cidade pelo caminho de sempre
      const pontos = await api("GET", `/pontos?cidade=${encodeURIComponent(PEDIDO.cidade)}`);
      assert.equal(pontos.corpo.dados.length, fim.pontos);
    });

    it("avisa quando o OpenStreetMap não tem lugares para a cidade", async () => {
      const { token } = await criarUsuario();
      mapas = instalarMapasFalsos({ overpass: () => ({ corpo: { elements: [] } }) });

      await api("POST", "/cidades/preparar", { token, json: { cidade: "Vila Vazia", uf: "AC", latitude: -9.9, longitude: -67.8 } });
      const fim = await esperarPreparo(token, "Vila Vazia", "AC");

      assert.equal(fim.estado, "erro");
      assert.match(fim.erro, /não tem lugares/);
    });

    it("explica de forma amigável quando o servidor de mapas está ocupado", async () => {
      const { token } = await criarUsuario();
      mapas = instalarMapasFalsos({ overpass: () => ({ status: 429, corpo: {} }) });

      await api("POST", "/cidades/preparar", { token, json: { cidade: "Vila Ocupada", uf: "AC", latitude: -9.9, longitude: -67.8 } });
      const fim = await esperarPreparo(token, "Vila Ocupada", "AC");

      assert.equal(fim.estado, "erro");
      assert.match(fim.erro, /ocupado/);
    });

    it("a consulta de acompanhamento responde 404 para cidade que não está sendo preparada", async () => {
      const r = await api("GET", "/cidades/preparar?cidade=Lugar+Nenhum&uf=SC");

      assert.equal(r.status, 404);
    });
  });
});
