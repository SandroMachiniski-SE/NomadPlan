import "../ambiente";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import type { Municipio } from "../../lib/municipios";
import { criarCliente, criarMunicipio, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";
import { BRASILIA, estradaReta, instalarViagemFalsa, JOINVILLE, noKm, prepararBrasilia, type ViagemFalsa } from "../viagemFalsa";

// Segunda-feira 9h (local) fixa.
const INICIO = new Date(2026, 9, 26, 9, 0, 0).toISOString();

describe("viagem de carro no gerador de roteiro", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let viagem: ViagemFalsa;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    viagem = instalarViagemFalsa();
  });

  afterEach(() => {
    viagem.desinstalar();
  });

  after(async () => {
    await servidor.fechar();
  });

  async function comCasa(municipio: Municipio | null) {
    const pessoa = await criarUsuario();

    if (municipio) {
      await prisma.usuario.update({ where: { id: pessoa.usuario.id }, data: { codigoMunicipioBase: municipio.codigoIbge } });
    }

    return pessoa;
  }

  const gerar = (token: string, json: Record<string, unknown>) =>
    api("POST", "/roteiros/gerar", { token, json: { horasDisponiveis: 6, dataHoraInicio: INICIO, ...json } });

  it("Joinville → Brasília 4 dias, alvo 500: 2 noites, dia 3 de estrada e Brasília do dia 4 ao 7", async () => {
    await prepararBrasilia(viagem);
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 4 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const [ida] = r.corpo.viagemDeCarro.pernas;
    assert.deepEqual(
      ida.trechos.map((t: { dia: number; noite: number | null; ocupaODia: boolean }) => [t.dia, t.noite, t.ocupaODia]),
      [
        [1, 1, true],
        [2, 2, true],
        [3, null, true],
      ],
    );
    assert.deepEqual(
      ida.trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Cidade A", "Cidade B", null],
    );
    assert.equal(ida.trechos[0].pernoite.totalHospedagens, 6);
    assert.ok(ida.trechos[0].alternativas.length >= 1 && ida.trechos[0].alternativas.length <= 3);
    assert.equal(ida.trechos[0].de, "Joinville/SC");
    assert.equal(ida.trechos[2].para, "Brasília/DF");
    assert.ok(ida.trechos[0].tracado.length >= 2);
    assert.deepEqual(
      r.corpo.dias.map((d: { dia: number }) => d.dia),
      [4, 5, 6, 7],
    );
    assert.ok(r.corpo.pontos.every((p: { dia: number }) => p.dia >= 4));
    assert.equal(r.corpo.viagemDeCarro.origem.codigoIbge, 4209102);
    // As etapas voltam resolvidas nos municípios, para o salvamento mandar os códigos.
    assert.deepEqual(r.corpo.viagemDeCarro.etapas, [{ codigoIbge: 5300108, cidade: "Brasília", uf: "DF", dias: 4 }]);
  });

  it("sem casa e sem origem dá 400 'Informe de onde você sai.'", async () => {
    await prepararBrasilia(viagem);
    const { token } = await comCasa(null);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 2 }], viagemDeCarro: {} });

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Informe de onde você sai.");

    const comOrigem = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 2 }], viagemDeCarro: { origem: 4209102 } });
    assert.equal(comOrigem.status, 200);
  });

  it("casa igual à 1ª cidade: nenhum dia de estrada e nenhuma chamada ao OSRM", async () => {
    await criarMunicipio(JOINVILLE);
    await criarPonto({ nome: "Museu de Joinville", cidade: "Joinville" });
    await criarPonto({ nome: "Parque de Joinville", cidade: "Joinville", latitude: -26.31 });
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Joinville", dias: 2 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo.viagemDeCarro.pernas, []);
    assert.equal(viagem.chamadas("osrm").length, 0);
    assert.deepEqual(
      r.corpo.dias.map((d: { dia: number }) => d.dia),
      [1, 2],
    );
  });

  it("etapa ambígua sem UF dá 400 'Informe a UF de Bom Jesus.'", async () => {
    await criarMunicipio(JOINVILLE);
    await criarMunicipio({ codigoIbge: 4302402, cidade: "Bom Jesus", uf: "RS", latitude: -28.67, longitude: -50.43 });
    await criarMunicipio({ codigoIbge: 2201903, cidade: "Bom Jesus", uf: "PI", latitude: -9.07, longitude: -44.36 });
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Bom Jesus", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Informe a UF de Bom Jesus.");
  });

  it("etapa sem município dá 400 'Não encontrei o município Cidade Inexistente.'", async () => {
    await criarMunicipio(JOINVILLE);
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Cidade Inexistente", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, "Não encontrei o município Cidade Inexistente.");
  });

  it("a escolha da noite 1 troca a cidade e a decisão esticar=false acrescenta uma noite", async () => {
    await criarMunicipio(JOINVILLE);
    const destino = await criarMunicipio(noKm(1000020, "Destino", 1120, 0));
    await criarPonto({ nome: "Atração do Destino", cidade: "Destino", latitude: destino.latitude, longitude: destino.longitude });
    const c500 = await criarMunicipio(noKm(1000021, "Km 500", 500));
    const c470 = await criarMunicipio(noKm(1000022, "Km 470", 470));
    const c1000 = await criarMunicipio(noKm(1000023, "Km 1000", 1000));
    viagem.estado.ofertas.push(
      { municipio: c500, hoteis: 8, atracoes: 2 },
      { municipio: c470, hoteis: 3, atracoes: 0 },
      { municipio: c1000, hoteis: 4, atracoes: 1 },
    );
    viagem.naEstrada(destino, () => ({ corpo: estradaReta(1120) }));
    const { token } = await comCasa(JOINVILLE);
    const etapas = [{ cidade: "Destino/GO", dias: 1 }];

    const padrao = (await gerar(token, { etapas, viagemDeCarro: {} })).corpo.viagemDeCarro.pernas[0];
    assert.deepEqual(
      padrao.trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Km 500", null],
    );
    assert.equal(padrao.decisao.esticar, true);
    assert.ok(Math.abs(padrao.decisao.metrosEsticando - 620_000) < 2000, `${padrao.decisao.metrosEsticando}`);

    const trocada = (
      await gerar(token, {
        etapas,
        viagemDeCarro: { escolhas: [{ perna: 0, noite: 1, codigoIbge: c470.codigoIbge }], decisoes: [{ perna: 0, esticar: false }] },
      })
    ).corpo.viagemDeCarro.pernas[0];
    assert.deepEqual(
      trocada.trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Km 470", "Km 1000", null],
    );
    assert.equal(trocada.decisao.esticar, false);
  });

  it("kmPorDia, horasPorDia, consumo e preço fora da faixa dão 400", async () => {
    await criarMunicipio(JOINVILLE);
    const { token } = await comCasa(JOINVILLE);
    const etapas = [{ cidade: "Joinville", dias: 1 }];

    for (const viagemDeCarro of [
      { kmPorDia: 1001 },
      { kmPorDia: 149 },
      { horasPorDia: 1 },
      { horasPorDia: 15 },
      { consumoKmPorLitro: 2 },
      { consumoKmPorLitro: 41 },
      { precoLitroCentavos: 99 },
      { precoLitroCentavos: 2001 },
    ]) {
      assert.equal((await gerar(token, { etapas, viagemDeCarro })).status, 400, JSON.stringify(viagemDeCarro));
    }
  });

  it("viagem curta sem nenhuma noite traz o aviso 'Nenhuma perna passa de um dia de estrada.'", async () => {
    await criarMunicipio(JOINVILLE);
    const perto = await criarMunicipio(noKm(1000030, "Cidade Perto", 180, 0));
    await criarPonto({ nome: "Praia Perto", cidade: "Cidade Perto", latitude: perto.latitude, longitude: perto.longitude });
    viagem.naEstrada(perto, () => ({ corpo: estradaReta(180) }));
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Cidade Perto/GO", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const [ida] = r.corpo.viagemDeCarro.pernas;
    assert.deepEqual(
      ida.trechos.map((t: { dia: number; ocupaODia: boolean }) => [t.dia, t.ocupaODia]),
      [[1, false]],
    );
    assert.ok(r.corpo.viagemDeCarro.avisos.includes("Nenhuma perna passa de um dia de estrada."));
    assert.equal(r.corpo.dias[0].viagem.de, "Joinville/SC");
    assert.equal(r.corpo.dias[0].viagem.minutos, Math.round(ida.segundos / 60));
  });

  it("mais de 21 dias dá 400 com a explicação", async () => {
    await criarMunicipio(JOINVILLE);
    const longe = await criarMunicipio(noKm(1000040, "Muito Longe", 3000, 0));
    viagem.naEstrada(longe, () => ({ corpo: estradaReta(3000) }));
    const { token } = await comCasa(JOINVILLE);

    // 19 noites de estrada (de 150 em 150 km) + a chegada descontada do 1º dia + 3 dias na cidade = 22.
    const r = await gerar(token, { etapas: [{ cidade: "Muito Longe/GO", dias: 3 }], viagemDeCarro: { kmPorDia: 150 } });

    assert.equal(r.status, 400);
    assert.equal(
      r.corpo.erro,
      "Com 150 km por dia a viagem passa de 21 dias; aumente os km por dia ou diminua os dias nas cidades.",
    );
  });

  it("sem estrada dá 422 com as duas cidades", async () => {
    await criarMunicipio(JOINVILLE);
    const noronha = await criarMunicipio({ codigoIbge: 2605459, cidade: "Fernando de Noronha", uf: "PE", latitude: -3.84, longitude: -32.41 });
    viagem.naEstrada(noronha, () => ({ status: 400, corpo: { code: "NoRoute" } }));
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Fernando de Noronha", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 422);
    assert.equal(r.corpo.erro, "Não há estrada entre Joinville/SC e Fernando de Noronha/PE.");
  });

  it("OSRM fora do ar sem cache dá 503", async () => {
    await prepararBrasilia(viagem);
    viagem.naEstrada(BRASILIA, () => ({ status: 503, corpo: {} }));
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 503);
    assert.equal(r.corpo.erro, "Não consegui calcular a rota agora; tente de novo em alguns minutos.");
  });

  it("Overpass fora do ar: uma consulta só e as cidades pela distância", async () => {
    await prepararBrasilia(viagem);
    viagem.estado.overpassFora = true;
    const { token } = await comCasa(JOINVILLE);

    const r = await gerar(token, { etapas: [{ cidade: "Brasília, DF", dias: 1 }], viagemDeCarro: {} });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(viagem.chamadas("overpass").length, 1);
    assert.ok(r.corpo.viagemDeCarro.avisos.includes("Não foi possível contar os hotéis agora; as cidades estão só pela distância."));
    assert.deepEqual(
      r.corpo.viagemDeCarro.pernas[0].trechos.map((t: { pernoite: { cidade: string } | null }) => t.pernoite?.cidade ?? null),
      ["Cidade A", "Cidade B", null],
    );
  });

  it("sem viagemDeCarro a resposta é a de hoje, com viagemDeCarro null", async () => {
    await criarPonto({ nome: "Museu de Joinville", cidade: "Joinville" });
    const { token } = await comCasa(null);

    const r = await gerar(token, { cidade: "Joinville" });

    assert.equal(r.status, 200);
    assert.equal(r.corpo.viagemDeCarro, null);
    assert.ok(r.corpo.pontos.length > 0);
  });
});
