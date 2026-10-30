import "../ambiente";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";
import { instalarGoogleFalso, PERIODOS_TER_A_DOM_9_17 } from "../googleFalso";

// Segunda-feira 10h (local): pelo horário do Google, o museu fica fechado (abre de terça a domingo).
const SEGUNDA_10H = new Date(2026, 9, 26, 10, 0, 0).toISOString();

describe("Google Places (consulta na hora, só o place_id fica guardado)", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let google: ReturnType<typeof instalarGoogleFalso> | null = null;

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
  });

  afterEach(() => {
    google?.desinstalar();
    google = null;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  after(async () => {
    await servidor.fechar();
  });

  function googleComMuseu() {
    return instalarGoogleFalso((c) => {
      if (c.url.endsWith("places:searchText")) return { corpo: { places: [{ id: "ChIJ-museu" }] } };
      if (c.url.includes("/media")) return { corpo: { photoUri: "https://lh3.googleusercontent.com/foto" } };
      if (c.url.includes("places/ChIJ-museu")) {
        return {
          corpo: {
            regularOpeningHours: { periods: PERIODOS_TER_A_DOM_9_17 },
            rating: 4.7,
            userRatingCount: 1234,
            googleMapsUri: "https://maps.google.com/?cid=1",
            photos: [{ name: "places/ChIJ-museu/photos/abc", authorAttributions: [{ displayName: "Ana" }] }],
          },
        };
      }
      return undefined;
    });
  }

  it("sem chave configurada, a página do ponto segue só com os dados abertos", async () => {
    const ponto = await criarPonto({ nome: "Museu" });

    const r = await api("GET", `/pontos/${ponto.id}/google`);

    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { disponivel: false });
  });

  it("mostra nota, horário e foto do Google e guarda só o place_id", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "chave-de-teste";
    google = googleComMuseu();
    const ponto = await criarPonto({ nome: "Museu de Arte", horarioFuncionamento: null });

    const r = await api("GET", `/pontos/${ponto.id}/google`);

    assert.equal(r.status, 200);
    assert.equal(r.corpo.disponivel, true);
    assert.equal(r.corpo.horario, "Ter-Dom 9h-17h; Seg fechado");
    assert.equal(r.corpo.nota, 4.7);
    assert.equal(r.corpo.foto.url, "https://lh3.googleusercontent.com/foto");

    const gravado = await prisma.pontoTuristico.findUniqueOrThrow({ where: { id: ponto.id } });
    assert.equal(gravado.idGoogle, "ChIJ-museu");
    assert.equal(gravado.horarioFuncionamento, null, "o horário do Google não é gravado");
    assert.equal(gravado.imagemUrl, null, "nem a foto");

    // Na segunda visita o place_id já está guardado: não procura de novo.
    await api("GET", `/pontos/${ponto.id}/google`);
    assert.equal(google.chamadas.filter((c) => c.url.endsWith("places:searchText")).length, 1);
  });

  it("não procura de novo, por 30 dias, um lugar que o Google não achou", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "chave-de-teste";
    google = instalarGoogleFalso((c) => (c.url.endsWith("places:searchText") ? { corpo: {} } : undefined));
    const ponto = await criarPonto({ nome: "Lugar desconhecido" });

    assert.deepEqual((await api("GET", `/pontos/${ponto.id}/google`)).corpo, { disponivel: false });
    assert.deepEqual((await api("GET", `/pontos/${ponto.id}/google`)).corpo, { disponivel: false });
    assert.equal(google.chamadas.length, 1);
  });

  it("o gerador consulta o horário que falta e não conta com o museu fechado", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "chave-de-teste";
    google = googleComMuseu();
    const { token } = await criarUsuario();
    await criarPonto({ nome: "Museu de Arte", categoria: "Cultura", horarioFuncionamento: null });
    await criarPonto({ nome: "Parque", categoria: "Natureza", longitude: -48.84 });

    const r = await api("POST", "/roteiros/gerar", {
      token,
      json: { cidade: "Joinville", horasDisponiveis: 3, interesses: ["Cultura"], dataHoraInicio: SEGUNDA_10H },
    });

    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.pontos.map((p: { nome: string }) => p.nome), ["Parque"]);
    assert.equal(r.corpo.avisos[0], "Horário de 1 ponto consultado agora no Google Maps.");
    assert.match(r.corpo.avisos[1], /Museu de Arte: estaria fechado às 10:00 \(horário: Ter-Dom 9h-17h; Seg fechado\)/);
    assert.equal((await prisma.pontoTuristico.findFirstOrThrow({ where: { nome: "Museu de Arte" } })).horarioFuncionamento, null);
  });
});
