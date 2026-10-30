import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  correspondente,
  ehHospedagemNova,
  formatarTelefone,
  nomesParecidos,
  siteDoLugar,
  telefoneDoLugar,
  type LugarOverture,
} from "./overture";

function lugar(parcial: Partial<LugarOverture> = {}): LugarOverture {
  return {
    idOverture: "08f-1",
    nome: "Museu de Arte de Joinville",
    categoriaOverture: "museum",
    confianca: 0.9,
    sites: [],
    telefones: [],
    redesSociais: [],
    endereco: "Rua XV de Novembro, 1400",
    localidade: "Joinville",
    latitude: -26.3044,
    longitude: -48.8487,
    fontes: ["meta (CDLA-Permissive-2.0)"],
    ...parcial,
  };
}

describe("Overture Maps", () => {
  it("formata telefones brasileiros e mantém os outros como vieram", () => {
    assert.equal(formatarTelefone("+554734333736"), "+55 47 3433-3736");
    assert.equal(formatarTelefone("+5548999031307"), "+55 48 99903-1307");
    assert.equal(formatarTelefone("4734333736"), "+55 47 3433-3736");
    assert.equal(formatarTelefone("+1 415 555 0100"), "+1 415 555 0100");
    assert.equal(telefoneDoLugar(lugar({ telefones: ["123", "+554734333736"] })), "+55 47 3433-3736");
    assert.equal(telefoneDoLugar(lugar()), null);
  });

  it("prefere o site próprio; sem ele, o Instagram, depois o Facebook", () => {
    assert.equal(siteDoLugar(lugar({ sites: ["www.museu.com.br"], redesSociais: ["https://instagram.com/museu"] })), "https://www.museu.com.br");
    assert.equal(
      siteDoLugar(lugar({ redesSociais: ["https://www.facebook.com/123", "https://www.instagram.com/museu/"] })),
      "https://www.instagram.com/museu/",
    );
    assert.equal(siteDoLugar(lugar({ sites: ["javascript:alert(1)"] })), null);
  });

  it("reconhece o mesmo lugar pelo nome parecido e pela distância", () => {
    assert.ok(nomesParecidos("Museu de Arte", "Museu de Arte de Joinville"));
    assert.ok(nomesParecidos("Café São Paulo", "cafe sao paulo"));
    assert.ok(nomesParecidos("Hotel Mattes", "Mattes Hotel"));
    assert.ok(nomesParecidos("Zum Schlauch", "Restaurante Zum Schlauch"));
    assert.ok(!nomesParecidos("Bar", "Bar do Zé"), "nome curto demais para comparar por trecho");
    assert.ok(!nomesParecidos("Parque Ramiro Ruediger", "Radical - Luggage Storage Parque Ramiro Ruediger"));
    assert.ok(!nomesParecidos("Catedral Metropolitana", "Radical - Luggage Storage Catedral Metropolitana"));

    const ponto = { nome: "Museu de Arte", latitude: -26.3045, longitude: -48.8488 };
    const longe = lugar({ idOverture: "longe", latitude: -26.32 });
    const perto = lugar({ idOverture: "perto", confianca: 0.7 });
    const pertoMaisConfiavel = lugar({ idOverture: "melhor", confianca: 0.95 });

    assert.equal(correspondente(ponto, [longe, perto, pertoMaisConfiavel])?.idOverture, "melhor");
    assert.equal(correspondente(ponto, [longe]), null);
    assert.equal(correspondente({ ...ponto, latitude: null }, [perto]), null);
  });

  it("só traz como hospedagem nova o que é confiável e fica na cidade certa", () => {
    const hotel = lugar({ nome: "Hotel Mattes", categoriaOverture: "hotel", confianca: 0.9 });

    assert.ok(ehHospedagemNova(hotel, "Joinville"));
    assert.ok(!ehHospedagemNova({ ...hotel, confianca: 0.6 }, "Joinville"));
    assert.ok(!ehHospedagemNova({ ...hotel, localidade: "Araquari" }, "Joinville"));
    assert.ok(!ehHospedagemNova({ ...hotel, categoriaOverture: "motel" }, "Joinville"));
    assert.ok(!ehHospedagemNova({ ...hotel, categoriaOverture: "restaurant" }, "Joinville"));
  });
});
