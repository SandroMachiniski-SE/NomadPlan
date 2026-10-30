import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrigemRegistro, StatusPonto, TipoConta } from "@prisma/client";
import prisma from "../../lib/prisma";
import { importarPontosOsm, type PontoParaImportar } from "../../lib/importacaoOsm";
import {
  criarCliente,
  criarPonto,
  criarUsuario,
  formularioComArquivo,
  iniciarServidor,
  limparBanco,
  PNG_MINIMO,
  type ServidorDeTeste,
} from "../suporte";

function pontoOsm(parcial: Partial<PontoParaImportar> = {}): PontoParaImportar {
  return {
    idOsm: "node/100",
    nome: "Museu Nacional de Imigração e Colonização",
    descricao: "Museu em Joinville, Brasil.",
    categoria: "Cultura",
    cidade: "Joinville",
    endereco: "Rua Rio Branco, 229 - Centro",
    latitude: -26.3041,
    longitude: -48.8466,
    faixaPreco: "Gratuito",
    acessibilidade: "Acesso para cadeira de rodas",
    siteOficial: "https://www.museu.sc.gov.br",
    telefoneContato: "+55 47 3433-3736",
    horarioFuncionamento: "Ter-Sex 9h-17h; Sáb-Dom e feriados 12h-18h; Seg fechado",
    imagemUrl: "https://upload.wikimedia.org/museu.jpg",
    imagemCredito: "Foto: Fulano (CC BY-SA 4.0), via Wikimedia Commons",
    imagemFonte: "https://commons.wikimedia.org/wiki/File:Museu.jpg",
    ...parcial,
  };
}

describe("importação de pontos do OpenStreetMap (RNF19)", () => {
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

  it("cria os pontos publicados, com a origem e o elemento do OSM", async () => {
    const agora = new Date("2026-10-27T12:00:00Z");
    const resumo = await importarPontosOsm(
      [pontoOsm(), pontoOsm({ idOsm: "way/200", nome: "Praia da Vigorelli", categoria: "Natureza", imagemUrl: null })],
      agora,
    );

    assert.deepEqual(resumo, { criados: 2, complementados: 0, vinculados: 0, semMudanca: 0, ignorados: 0 });

    const museu = await prisma.pontoTuristico.findUniqueOrThrow({ where: { idOsm: "node/100" } });

    assert.equal(museu.status, StatusPonto.PUBLICADO);
    assert.equal(museu.origem, OrigemRegistro.API);
    assert.equal(museu.seloVerificado, false, "o selo é dado por quem confirma o ponto, não pela importação");
    assert.equal(museu.idResponsavel, null);
    assert.equal(museu.sincronizadoEm?.toISOString(), agora.toISOString());

    // A API mostra a origem e o crédito da foto, e o ponto aparece na busca (com geom).
    const detalhe = await api("GET", `/pontos/${museu.id}`);

    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.corpo.origem, "API");
    assert.equal(detalhe.corpo.idOsm, "node/100");
    assert.equal(detalhe.corpo.imagemCredito, "Foto: Fulano (CC BY-SA 4.0), via Wikimedia Commons");
    assert.equal(detalhe.corpo.imagemFonte, "https://commons.wikimedia.org/wiki/File:Museu.jpg");

    const perto = await api("GET", "/pontos?lat=-26.3041&lng=-48.8466&raioKm=1");

    assert.equal(perto.status, 200);
    assert.ok(perto.corpo.dados.some((p: { idOsm?: string; imagemCredito: string | null; nome: string }) =>
      p.nome === museu.nome && p.imagemCredito !== null,
    ));
  });

  it("pode ser repetida sem duplicar e só preenche o que está vazio", async () => {
    await importarPontosOsm([pontoOsm({ telefoneContato: null })]);

    const ponto = await prisma.pontoTuristico.findUniqueOrThrow({ where: { idOsm: "node/100" } });

    // A comunidade corrigiu o horário depois da primeira importação.
    await prisma.pontoTuristico.update({
      where: { id: ponto.id },
      data: { horarioFuncionamento: "Ter-Dom 10h-16h", versao: { increment: 1 } },
    });

    const segunda = await importarPontosOsm([pontoOsm({ telefoneContato: "+55 47 3433-3736" })]);

    assert.deepEqual(segunda, { criados: 0, complementados: 1, vinculados: 0, semMudanca: 0, ignorados: 0 });

    const depois = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } });

    assert.equal(depois.horarioFuncionamento, "Ter-Dom 10h-16h", "a edição da comunidade é mantida");
    assert.equal(depois.telefoneContato, "+55 47 3433-3736", "o campo vazio é preenchido");
    assert.equal(depois.versao, ponto.versao + 2, "o complemento conta como nova versão");

    const versoes = await prisma.versaoPonto.findMany({ where: { idPonto: ponto.id } });

    assert.equal(versoes.length, 1);
    assert.equal(versoes[0].motivo, "Complementado com dados do OpenStreetMap");

    const terceira = await importarPontosOsm([pontoOsm()]);

    assert.deepEqual(terceira, { criados: 0, complementados: 0, vinculados: 0, semMudanca: 1, ignorados: 0 });
    assert.equal(await prisma.pontoTuristico.count(), 1);
  });

  it("vincula ao ponto já cadastrado com o mesmo nome em vez de criar uma cópia", async () => {
    const { usuario } = await criarUsuario({ tipoConta: TipoConta.NEGOCIO });
    const cadastrado = await criarPonto({
      nome: "Museu Nacional de Imigracao e Colonizacao",
      cidade: "joinville",
      horarioFuncionamento: "Ter-Dom 9h-17h",
      idResponsavel: usuario.id,
    });
    const vizinho = await criarPonto({ nome: "Restaurante Ao Lado", cidade: "Joinville", latitude: -26.3042, longitude: -48.8467 });

    const resumo = await importarPontosOsm([
      pontoOsm(),
      // Nome mais longo no OSM, a poucos metros do ponto cadastrado.
      pontoOsm({ idOsm: "node/300", nome: "Restaurante Ao Lado do Museu", categoria: "Gastronomia" }),
    ]);

    assert.deepEqual(resumo, { criados: 0, complementados: 0, vinculados: 2, semMudanca: 0, ignorados: 0 });

    const vinculado = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: cadastrado.id } });

    assert.equal(vinculado.idOsm, "node/100");
    assert.equal(vinculado.origem, OrigemRegistro.USUARIO, "a origem continua sendo o cadastro do usuário");
    assert.equal(vinculado.idResponsavel, usuario.id);
    assert.equal(vinculado.horarioFuncionamento, "Ter-Dom 9h-17h");
    assert.equal(vinculado.siteOficial, "https://www.museu.sc.gov.br");
    assert.equal(vinculado.imagemUrl, "https://upload.wikimedia.org/museu.jpg");
    assert.equal((await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: vizinho.id } })).idOsm, "node/300");
  });

  it("não traz de volta um ponto que a moderação rejeitou", async () => {
    await importarPontosOsm([pontoOsm()]);
    await prisma.pontoTuristico.update({ where: { idOsm: "node/100" }, data: { status: StatusPonto.REJEITADO } });

    const resumo = await importarPontosOsm([pontoOsm()]);

    assert.equal(resumo.ignorados, 1);
    assert.equal(await prisma.pontoTuristico.count(), 1);
    assert.equal((await prisma.pontoTuristico.findFirstOrThrow()).status, StatusPonto.REJEITADO);
  });

  it("a foto enviada pelo responsável substitui a importada junto com o crédito", async () => {
    const { usuario, token } = await criarUsuario({ tipoConta: TipoConta.ADMIN });

    await importarPontosOsm([pontoOsm()]);

    const ponto = await prisma.pontoTuristico.update({
      where: { idOsm: "node/100" },
      data: { status: StatusPonto.RASCUNHO, idResponsavel: usuario.id },
    });

    const envio = await api("POST", `/pontos/${ponto.id}/imagem`, {
      token,
      form: formularioComArquivo("imagem", PNG_MINIMO, "foto.png", "image/png"),
    });

    assert.equal(envio.status, 200);
    assert.match(envio.corpo.imagemUrl, /^\/uploads\/pontos\//);
    assert.equal(envio.corpo.imagemCredito, null);
    assert.equal(envio.corpo.imagemFonte, null);
  });

  it("pontos importados por arquivo ficam com a origem IMPORTACAO e a exportação mostra a origem", async () => {
    const { token } = await criarUsuario({ tipoConta: TipoConta.GESTOR });
    const form = formularioComArquivo(
      "arquivo",
      Buffer.from("nome,categoria,cidade,latitude,longitude\nMirante Novo,Natureza,Joinville,-26.31,-48.85\n"),
      "pontos.csv",
      "text/csv",
    );

    const importacao = await api("POST", "/pontos/importar", { token, form });

    assert.equal(importacao.status, 200);
    assert.equal((await prisma.pontoTuristico.findFirstOrThrow({ where: { nome: "Mirante Novo" } })).origem, OrigemRegistro.IMPORTACAO);

    await importarPontosOsm([pontoOsm()]);

    const exportacao = await api("GET", "/pontos/exportar?formato=csv", { token });

    assert.equal(exportacao.status, 200);
    assert.match(exportacao.texto.split("\n")[0], /origem,idOsm/);
    assert.match(exportacao.texto, /API,node\/100/);
  });
});
