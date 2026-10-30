import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { StatusPonto } from "@prisma/client";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

// Dia da semana (abreviado, como o texto de horário usa) de hoje + deslocamento.
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const diaDaSemana = (deslocamento: number) => DIAS[(new Date().getDay() + deslocamento + 7) % 7];

describe("busca de pontos turísticos", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
  });

  after(async () => {
    await servidor.fechar();
  });

  const nomes = (r: { corpo: { dados: { nome: string }[] } }) => r.corpo.dados.map((p) => p.nome);

  async function avaliar(idPonto: number, nota: number, status: "APROVADA" | "PENDENTE" | "REJEITADA" = "APROVADA") {
    const { usuario } = await criarUsuario();

    return prisma.avaliacao.create({ data: { idPonto, idAutor: usuario.id, nota, status } });
  }

  describe("filtros de texto", () => {
    it("devolve só pontos publicados", async () => {
      await criarPonto({ nome: "Publicado" });
      await criarPonto({ nome: "Rascunho", status: StatusPonto.RASCUNHO });
      await criarPonto({ nome: "Em análise", status: StatusPonto.PENDENTE_VERIFICACAO });
      await criarPonto({ nome: "Rejeitado", status: StatusPonto.REJEITADO });

      const r = await api("GET", "/pontos");

      assert.equal(r.status, 200);
      assert.deepEqual(nomes(r), ["Publicado"]);
      assert.equal(r.corpo.total, 1);
    });

    it("filtra por cidade, categoria, acessibilidade e preço, sem diferenciar maiúsculas", async () => {
      await criarPonto({ nome: "A", cidade: "Joinville", categoria: "Natureza", acessibilidade: "Rampa de acesso", faixaPreco: "Gratuito" });
      await criarPonto({ nome: "B", cidade: "Blumenau", categoria: "Cultura", acessibilidade: null, faixaPreco: "$$" });

      assert.deepEqual(nomes(await api("GET", "/pontos?cidade=joinv")), ["A"]);
      assert.deepEqual(nomes(await api("GET", "/pontos?categoria=CULTURA")), ["B"]);
      assert.deepEqual(nomes(await api("GET", "/pontos?acessibilidade=rampa")), ["A"]);
      assert.deepEqual(nomes(await api("GET", "/pontos?faixaPreco=gratuito")), ["A"]);
      assert.deepEqual(nomes(await api("GET", "/pontos?cidade=Joinville&categoria=Cultura")), []);
    });

    it("busca por texto no nome e na descrição", async () => {
      await criarPonto({ nome: "Museu da Imigração", descricao: "Acervo histórico" });
      await criarPonto({ nome: "Parque", descricao: "Tem uma exposição de imigração" });
      await criarPonto({ nome: "Praça" });

      const r = await api("GET", "/pontos?busca=imigra%C3%A7%C3%A3o");

      assert.equal(r.corpo.total, 2);
    });

    it("ordena por relevância: nome que começa com o termo, depois nome que contém, depois descrição", async () => {
      await criarPonto({ nome: "Parque", descricao: "Ótimo para praia e lazer" });
      await criarPonto({ nome: "Grande Praia Norte" });
      await criarPonto({ nome: "Praia Brava" });

      const r = await api("GET", "/pontos?busca=praia");

      assert.deepEqual(nomes(r), ["Praia Brava", "Grande Praia Norte", "Parque"]);
    });

    it("sem termo de busca, mostra primeiro os verificados e os de cadastro mais completo", async () => {
      await criarPonto({ nome: "A sem nada", horarioFuncionamento: null });
      await criarPonto({ nome: "B com foto", horarioFuncionamento: null, imagemUrl: "https://upload.wikimedia.org/b.jpg" });
      await criarPonto({ nome: "C verificado", horarioFuncionamento: null, seloVerificado: true });
      await criarPonto({ nome: "D com horário", horarioFuncionamento: "Seg-Sex 9h-18h" });

      assert.deepEqual(nomes(await api("GET", "/pontos")), ["C verificado", "B com foto", "D com horário", "A sem nada"]);
    });

    it("trata % e _ digitados como texto comum, não como curinga", async () => {
      await criarPonto({ nome: "Promoção 100% off" });
      await criarPonto({ nome: "Praça Central" });

      assert.deepEqual(nomes(await api("GET", "/pontos?busca=100%25")), ["Promoção 100% off"]);
      assert.equal((await api("GET", "/pontos?busca=%25")).corpo.total, 1);
      assert.equal((await api("GET", "/pontos?cidade=_")).corpo.total, 0);
    });

    it("respeita o limite de resultados", async () => {
      for (let i = 0; i < 5; i += 1) await criarPonto({ nome: `Ponto ${i}` });

      assert.equal((await api("GET", "/pontos?limite=3")).corpo.total, 3);
    });

    it("rejeita parâmetros inválidos com 400", async () => {
      const invalidos = [
        "limite=0",
        "limite=101",
        "lat=-26.3",
        "lng=-48.8",
        "lat=100&lng=0",
        "raioKm=500&lat=-26&lng=-48",
        "notaMinima=6",
        "ordenar=aleatorio",
        "abertoAgora=talvez",
      ];

      for (const consulta of invalidos) {
        assert.equal((await api("GET", `/pontos?${consulta}`)).status, 400, consulta);
      }
    });
  });

  describe("proximidade (PostGIS)", () => {
    it("ordena pelo mais perto e informa a distância em metros", async () => {
      await criarPonto({ nome: "Longe", latitude: -26.31, longitude: -48.84 });
      await criarPonto({ nome: "Perto", latitude: -26.3001, longitude: -48.84 });
      await criarPonto({ nome: "Médio", latitude: -26.305, longitude: -48.84 });

      const r = await api("GET", "/pontos?lat=-26.3&lng=-48.84&raioKm=10");

      assert.deepEqual(nomes(r), ["Perto", "Médio", "Longe"]);

      const distancias = r.corpo.dados.map((p: { distanciaMetros: number }) => p.distanciaMetros);
      assert.ok(distancias[0] < 20, `distância do mais perto: ${distancias[0]}`);
      assert.deepEqual([...distancias].sort((a, b) => a - b), distancias);
    });

    it("respeita o raio e combina com outros filtros", async () => {
      await criarPonto({ nome: "Dentro", latitude: -26.3, longitude: -48.84, categoria: "Natureza" });
      await criarPonto({ nome: "Fora do raio", latitude: -26.5, longitude: -48.84, categoria: "Natureza" });
      await criarPonto({ nome: "Outra categoria", latitude: -26.3, longitude: -48.8401, categoria: "Cultura" });

      assert.deepEqual(nomes(await api("GET", "/pontos?lat=-26.3&lng=-48.84&raioKm=5")), ["Dentro", "Outra categoria"]);
      assert.deepEqual(nomes(await api("GET", "/pontos?lat=-26.3&lng=-48.84&raioKm=5&categoria=Natureza")), ["Dentro"]);
      assert.equal((await api("GET", "/pontos?lat=-26.3&lng=-48.84&raioKm=50")).corpo.total, 3);
    });

    it("ignora na busca por proximidade os pontos sem coordenadas", async () => {
      await criarPonto({ nome: "Sem mapa", latitude: null, longitude: null });
      await criarPonto({ nome: "No mapa" });

      assert.deepEqual(nomes(await api("GET", "/pontos?lat=-26.3&lng=-48.84")), ["No mapa"]);
      assert.equal((await api("GET", "/pontos")).corpo.total, 2);
    });
  });

  describe("avaliações na busca (RF08)", () => {
    it("informa média e quantidade, contando só avaliações aprovadas", async () => {
      const ponto = await criarPonto({ nome: "Avaliado" });
      await avaliar(ponto.id, 5);
      await avaliar(ponto.id, 4);
      await avaliar(ponto.id, 1, "PENDENTE");
      await avaliar(ponto.id, 1, "REJEITADA");
      await criarPonto({ nome: "Sem avaliação" });

      const r = await api("GET", "/pontos?ordenar=nome");
      const avaliado = r.corpo.dados.find((p: { nome: string }) => p.nome === "Avaliado");
      const semAvaliacao = r.corpo.dados.find((p: { nome: string }) => p.nome === "Sem avaliação");

      assert.equal(avaliado.mediaAvaliacao, 4.5);
      assert.equal(avaliado.totalAvaliacoes, 2);
      assert.equal(semAvaliacao.mediaAvaliacao, null);
      assert.equal(semAvaliacao.totalAvaliacoes, 0);
    });

    it("filtra por nota mínima (quem não tem avaliação fica de fora)", async () => {
      const bom = await criarPonto({ nome: "Bom" });
      const regular = await criarPonto({ nome: "Regular" });
      await criarPonto({ nome: "Sem nota" });
      await avaliar(bom.id, 5);
      await avaliar(regular.id, 3);

      assert.deepEqual(nomes(await api("GET", "/pontos?notaMinima=4")), ["Bom"]);
      assert.deepEqual(nomes(await api("GET", "/pontos?notaMinima=3&ordenar=nome")), ["Bom", "Regular"]);
    });

    it("ordena por melhor avaliação, deixando os sem nota por último", async () => {
      const a = await criarPonto({ nome: "A" });
      const b = await criarPonto({ nome: "B" });
      await criarPonto({ nome: "C" });
      await avaliar(a.id, 3);
      await avaliar(b.id, 5);

      assert.deepEqual(nomes(await api("GET", "/pontos?ordenar=avaliacao")), ["B", "A", "C"]);
    });
  });

  describe("aberto agora", () => {
    it("tira da lista os pontos fechados no momento da consulta", async () => {
      await criarPonto({ nome: "Sempre aberto", horarioFuncionamento: "Todos os dias, 24h" });
      await criarPonto({ nome: "Sem horário informado", horarioFuncionamento: null });
      await criarPonto({ nome: "Fecha hoje", horarioFuncionamento: `${diaDaSemana(1)}-${diaDaSemana(1)} 0h-24h` });

      const aberto = await api("GET", "/pontos?abertoAgora=true&ordenar=nome");
      const todos = await api("GET", "/pontos?abertoAgora=false&ordenar=nome");

      assert.deepEqual(nomes(aberto), ["Sem horário informado", "Sempre aberto"]);
      assert.equal(todos.corpo.total, 3, '"false" não pode virar verdadeiro');
    });

    it("ainda entrega o limite pedido quando muitos primeiros resultados estão fechados", async () => {
      for (let i = 0; i < 6; i += 1) {
        await criarPonto({ nome: `A fechado ${i}`, horarioFuncionamento: `${diaDaSemana(1)}-${diaDaSemana(1)} 0h-24h` });
      }
      await criarPonto({ nome: "Z aberto", horarioFuncionamento: "24h" });

      const r = await api("GET", "/pontos?abertoAgora=true&limite=2&ordenar=nome");

      assert.deepEqual(nomes(r), ["Z aberto"]);
    });
  });

  describe("métricas de uso", () => {
    it("cada busca entra na contagem diária", async () => {
      const { descarregarMetricas } = require("../../lib/metricasUso") as typeof import("../../lib/metricasUso.js");
      await descarregarMetricas();
      await prisma.metricaDiaria.deleteMany();

      await api("GET", "/pontos");
      await api("GET", "/pontos?cidade=x");
      await api("GET", "/pontos?limite=0"); // inválida: não conta

      await descarregarMetricas();

      const linha = await prisma.metricaDiaria.findFirst({ where: { tipo: "busca" } });
      assert.equal(linha?.total, 2);
    });
  });
});
