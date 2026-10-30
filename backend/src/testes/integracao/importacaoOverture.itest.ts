import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrigemRegistro, StatusPonto } from "@prisma/client";
import prisma from "../../lib/prisma";
import { importarOverture, type DadosOvertureDaCidade } from "../../lib/importacaoOverture";
import type { LugarOverture } from "../../lib/overture";
import { criarCliente, criarPonto, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

function lugar(parcial: Partial<LugarOverture>): LugarOverture {
  return {
    idOverture: "08f-museu",
    nome: "Museu de Arte de Joinville",
    categoriaOverture: "museum",
    confianca: 0.9,
    sites: ["www.museudearte.sc.gov.br"],
    telefones: ["+554734333736"],
    redesSociais: [],
    endereco: "Rua XV de Novembro, 1400",
    localidade: "Joinville",
    latitude: -26.3045,
    longitude: -48.8487,
    fontes: ["meta (CDLA-Permissive-2.0)"],
    ...parcial,
  };
}

const cidade = (lugares: LugarOverture[]): DadosOvertureDaCidade => ({
  fonte: "Overture Maps",
  licenca: "CDLA Permissive 2.0",
  cidade: "Joinville",
  baixadoEm: "2026-10-29T00:00:00Z",
  lugares,
});

describe("importação do Overture Maps", () => {
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

  it("completa telefone e site vazios de um ponto que já existe, sem sobrescrever", async () => {
    const semContato = await criarPonto({
      nome: "Museu de Arte",
      categoria: "Cultura",
      latitude: -26.3046,
      longitude: -48.8488,
      telefoneContato: null,
    });
    const comTelefone = await criarPonto({
      nome: "Hotel Mattes",
      categoria: "Hospedagem",
      latitude: -26.31,
      longitude: -48.85,
      telefoneContato: "(47) 3000-0000",
    });

    const resumo = await importarOverture([
      cidade([
        lugar({}),
        lugar({ idOverture: "08f-hotel", nome: "Hotel Mattes", categoriaOverture: "hotel", latitude: -26.3101, longitude: -48.8501 }),
      ]),
    ]);

    assert.equal(resumo.complementados, 2);

    const museu = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: semContato.id } });
    assert.equal(museu.telefoneContato, "+55 47 3433-3736");
    assert.equal(museu.siteOficial, "https://www.museudearte.sc.gov.br");
    assert.equal(museu.idOverture, "08f-museu");
    assert.equal(museu.versao, semContato.versao + 1);
    assert.equal(await prisma.versaoPonto.count({ where: { idPonto: museu.id } }), 1);

    const hotel = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: comTelefone.id } });
    assert.equal(hotel.telefoneContato, "(47) 3000-0000", "o telefone que já existia é mantido");
    assert.equal(hotel.siteOficial, "https://www.museudearte.sc.gov.br");

    const detalhe = await api("GET", `/pontos/${museu.id}`);
    assert.equal(detalhe.corpo.idOverture, "08f-museu");
  });

  it("não usa contato de outro negócio com nome parecido, nem completa praias e parques", async () => {
    const parque = await criarPonto({ nome: "Parque Ramiro Ruediger", categoria: "Natureza", latitude: -26.3045, longitude: -48.8487 });
    const catedral = await criarPonto({ nome: "Catedral Metropolitana", categoria: "Religioso", latitude: -26.3045, longitude: -48.8487 });

    await importarOverture([
      cidade([
        lugar({ idOverture: "08f-p", nome: "Parque Ramiro Ruediger", categoriaOverture: "park" }),
        lugar({ idOverture: "08f-g", nome: "Radical - Luggage Storage Catedral Metropolitana", categoriaOverture: "storage" }),
      ]),
    ]);

    for (const id of [parque.id, catedral.id]) {
      const ponto = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id } });
      assert.equal(ponto.telefoneContato, null);
      assert.equal(ponto.idOverture, null);
    }
  });

  it("traz hospedagens novas uma vez só, e não traz de volta as rejeitadas", async () => {
    const hoteis = [
      lugar({ idOverture: "08f-h1", nome: "Hotel Novo", categoriaOverture: "hotel", latitude: -26.32, longitude: -48.84 }),
      // O mesmo hotel repetido, com confiança menor.
      lugar({ idOverture: "08f-h1b", nome: "Hotel Novo", categoriaOverture: "hotel", confianca: 0.86, latitude: -26.3201, longitude: -48.8401 }),
      lugar({ idOverture: "08f-h2", nome: "Pousada da Serra", categoriaOverture: "bed_and_breakfast", latitude: -26.25, longitude: -49.0 }),
      lugar({ idOverture: "08f-h3", nome: "Hotel de outra cidade", categoriaOverture: "hotel", localidade: "Araquari" }),
    ];

    const primeira = await importarOverture([cidade(hoteis)]);
    assert.equal(primeira.criados, 2);

    const novo = await prisma.pontoTuristico.findUniqueOrThrow({ where: { idOverture: "08f-h1" } });
    assert.equal(novo.categoria, "Hospedagem");
    assert.equal(novo.descricao, "Hotel.");
    assert.equal(novo.origem, OrigemRegistro.API);
    assert.equal(novo.status, StatusPonto.PUBLICADO);
    assert.equal(novo.telefoneContato, "+55 47 3433-3736");

    await prisma.pontoTuristico.update({ where: { idOverture: "08f-h2" }, data: { status: StatusPonto.REJEITADO } });

    const segunda = await importarOverture([cidade(hoteis)]);
    assert.equal(segunda.criados, 0);
    assert.equal(await prisma.pontoTuristico.count(), 2);
  });
});
