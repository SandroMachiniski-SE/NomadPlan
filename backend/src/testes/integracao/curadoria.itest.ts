import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { aplicarCuradoria, lerCuradoria, type ItemCuradoria } from "../../lib/curadoria";
import { importarPontosOsm, type PontoParaImportar } from "../../lib/importacaoOsm";
import { estaAbertoNoHorario } from "../../lib/horarios";
import { iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

const importado: PontoParaImportar = {
  idOsm: "node/1",
  nome: "Museu Nacional de Imigração e Colonização",
  descricao: "Museu.",
  categoria: "Cultura",
  cidade: "Joinville",
  endereco: null,
  latitude: -26.3036,
  longitude: -48.8432,
  faixaPreco: null,
  acessibilidade: null,
  siteOficial: null,
  telefoneContato: "+55 47 3433 3736",
  horarioFuncionamento: "Ter-Sex 9h-17h; Sáb-Dom e feriados 12h-18h; Seg fechado",
  imagemUrl: null,
  imagemCredito: null,
  imagemFonte: null,
};

const conferido: ItemCuradoria = {
  cidade: "Joinville",
  nome: "Museu Nacional de Imigração e Colonização",
  fonte: "https://www.joinville.sc.gov.br/guia.pdf",
  conferidoEm: "2026-10-29",
  campos: {
    descricao: "Museu sobre a imigração no Sul do país.",
    horarioFuncionamento: "Ter-Dom 10h-16h; Seg fechado",
    telefoneContato: "(47) 3453-3499",
    acessibilidade: "Rampas e elevador",
  },
};

describe("curadoria com fontes oficiais", () => {
  let servidor: ServidorDeTeste;

  before(async () => {
    servidor = await iniciarServidor();
  });

  beforeEach(async () => {
    await limparBanco();
    await importarPontosOsm([importado]);
  });

  after(async () => {
    await servidor.fechar();
  });

  it("corrige o que veio desatualizado da importação e dá o selo de verificado", async () => {
    const resumo = await aplicarCuradoria([conferido], new Map([[importado.idOsm, importado]]));

    assert.deepEqual(resumo, { aplicados: 1, semMudanca: 0, naoEncontrados: [] });

    const ponto = await prisma.pontoTuristico.findUniqueOrThrow({ where: { idOsm: "node/1" } });
    assert.equal(ponto.horarioFuncionamento, "Ter-Dom 10h-16h; Seg fechado");
    assert.equal(ponto.descricao, "Museu sobre a imigração no Sul do país.");
    assert.equal(ponto.telefoneContato, "(47) 3453-3499");
    assert.equal(ponto.seloVerificado, true);

    const [versao] = await prisma.versaoPonto.findMany({ where: { idPonto: ponto.id } });
    assert.match(versao.motivo, /^Conferido na fonte oficial \(https:\/\/www\.joinville/);

    const repetida = await aplicarCuradoria([conferido], new Map([[importado.idOsm, importado]]));
    assert.deepEqual(repetida, { aplicados: 0, semMudanca: 1, naoEncontrados: [] });
  });

  it("não sobrescreve o que a comunidade editou depois da importação", async () => {
    await prisma.pontoTuristico.update({
      where: { idOsm: "node/1" },
      data: { horarioFuncionamento: "Ter-Dom 9h-17h (horário de verão)" },
    });

    await aplicarCuradoria([conferido], new Map([[importado.idOsm, importado]]));

    const ponto = await prisma.pontoTuristico.findUniqueOrThrow({ where: { idOsm: "node/1" } });
    assert.equal(ponto.horarioFuncionamento, "Ter-Dom 9h-17h (horário de verão)");
    assert.equal(ponto.telefoneContato, "(47) 3453-3499", "o campo não editado é corrigido");
  });

  it("avisa quando o ponto da curadoria não está no banco", async () => {
    const resumo = await aplicarCuradoria([{ ...conferido, nome: "Museu que não existe" }], new Map());

    assert.deepEqual(resumo.naoEncontrados, ["Museu que não existe (Joinville)"]);
  });

  it("o arquivo de curadoria do projeto só tem horários que o sistema entende", () => {
    const itens = lerCuradoria();

    assert.ok(itens.length > 0);
    for (const item of itens) {
      const horario = item.campos.horarioFuncionamento;
      assert.ok(item.fonte.startsWith("https://"), item.nome);
      if (!horario) continue;
      // Uma terça às 11h todos estão abertos; uma segunda às 11h, os museus municipais não.
      assert.equal(estaAbertoNoHorario(horario, new Date(2026, 9, 27, 11, 0)), true, `${item.nome}: ${horario}`);
    }
  });
});
