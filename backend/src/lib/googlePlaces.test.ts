import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { acessibilidadeDoGoogle, buscarIdGoogle, detalhesDoGoogle, horarioDoGoogle } from "./googlePlaces";
import { instalarGoogleFalso, PERIODOS_TER_A_DOM_9_17 } from "../testes/googleFalso";
import { estaAbertoNoHorario } from "./horarios";

describe("horarioDoGoogle", () => {
  it("converte os períodos do Google para o formato do sistema", () => {
    assert.equal(horarioDoGoogle(PERIODOS_TER_A_DOM_9_17), "Ter-Dom 9h-17h; Seg fechado");
    assert.equal(horarioDoGoogle([{ open: { day: 0, hour: 0, minute: 0 } }]), "Todos os dias, 24h");
    assert.equal(horarioDoGoogle(undefined), null);
  });

  it("junta duas faixas no mesmo dia e trata o fechamento depois da meia-noite", () => {
    const periodos = [1, 2, 3, 4, 5].flatMap((dia) => [
      { open: { day: dia, hour: 11, minute: 30 }, close: { day: dia, hour: 14, minute: 30 } },
      { open: { day: dia, hour: 18, minute: 0 }, close: { day: (dia + 1) % 7, hour: 1, minute: 0 } },
    ]);
    const texto = horarioDoGoogle(periodos);

    assert.equal(texto, "Seg-Sex 11h30-14h30 e 18h-1h; Sáb-Dom fechado");
    // Sexta 23h aberto; madrugada de sábado (0h30) ainda é o expediente de sexta.
    assert.equal(estaAbertoNoHorario(texto, new Date(2026, 9, 30, 23, 0)), true);
    assert.equal(estaAbertoNoHorario(texto, new Date(2026, 9, 31, 0, 30)), true);
    assert.equal(estaAbertoNoHorario(texto, new Date(2026, 9, 31, 12, 0)), false);
  });

  it("fecha à meia-noite em ponto quando o Google marca o fim no dia seguinte às 0h", () => {
    const periodos = [{ open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 0, minute: 0 } }];

    assert.equal(horarioDoGoogle(periodos), "Sex 18h-24h; Sáb-Qui fechado");
  });
});

describe("acessibilidadeDoGoogle", () => {
  it("usa as mesmas palavras das preferências do perfil", () => {
    assert.equal(
      acessibilidadeDoGoogle({ wheelchairAccessibleEntrance: true, wheelchairAccessibleRestroom: true, wheelchairAccessibleParking: false }),
      "Entrada acessível para cadeira de rodas, banheiro adaptado",
    );
    assert.equal(acessibilidadeDoGoogle({ wheelchairAccessibleEntrance: false }), null);
  });
});

describe("chamadas ao Google Places", () => {
  let google: ReturnType<typeof instalarGoogleFalso>;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "chave-de-teste";
  });

  afterEach(() => {
    google?.desinstalar();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("procura o lugar pedindo só o id, perto das coordenadas do ponto", async () => {
    google = instalarGoogleFalso(() => ({ corpo: { places: [{ id: "ChIJ-museu" }] } }));

    const id = await buscarIdGoogle({ nome: "Museu de Arte", cidade: "Joinville", latitude: -26.3, longitude: -48.84 });

    assert.equal(id, "ChIJ-museu");
    const [chamada] = google.chamadas;
    assert.equal(chamada.metodo, "POST");
    assert.equal(chamada.campos, "places.id");
    assert.equal(chamada.chave, "chave-de-teste");
    assert.equal((chamada.corpo as { textQuery: string }).textQuery, "Museu de Arte, Joinville");
    assert.ok((chamada.corpo as { locationRestriction?: unknown }).locationRestriction);
  });

  it("traz horário, nota e foto (sem expor a chave no endereço da imagem)", async () => {
    google = instalarGoogleFalso((c) => {
      if (c.url.includes("/media")) return { corpo: { photoUri: "https://lh3.googleusercontent.com/foto" } };
      return {
        corpo: {
          regularOpeningHours: { periods: PERIODOS_TER_A_DOM_9_17 },
          rating: 4.7,
          userRatingCount: 1234,
          nationalPhoneNumber: "(47) 3433-3736",
          googleMapsUri: "https://maps.google.com/?cid=1",
          photos: [{ name: "places/ChIJ-museu/photos/abc", authorAttributions: [{ displayName: "Ana", uri: "https://maps.google.com/ana" }] }],
        },
      };
    });

    const info = await detalhesDoGoogle("ChIJ-museu", { comFoto: true });

    assert.equal(info?.horario, "Ter-Dom 9h-17h; Seg fechado");
    assert.equal(info?.nota, 4.7);
    assert.equal(info?.totalAvaliacoes, 1234);
    assert.deepEqual(info?.foto, { url: "https://lh3.googleusercontent.com/foto", autor: "Ana", urlAutor: "https://maps.google.com/ana" });
    assert.match(google.chamadas[0].campos ?? "", /photos/);
    assert.match(google.chamadas[1].url, /skipHttpRedirect=true/);
    assert.ok(!google.chamadas[1].url.includes("chave-de-teste"));
  });

  it("devolve null sem chave configurada ou quando o Google falha", async () => {
    google = instalarGoogleFalso(() => ({ status: 500, corpo: {} }));

    assert.equal(await detalhesDoGoogle("ChIJ-x"), null);

    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.equal(await buscarIdGoogle({ nome: "X", cidade: "Y", latitude: null, longitude: null }), null);
    assert.equal(google.chamadas.length, 1, "sem chave, nem chega a chamar o Google");
  });
});
