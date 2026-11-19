import { beforeEach, describe, expect, it } from "vitest";
import {
  FILTROS_VAZIOS,
  enderecoDaBusca,
  enderecoDaUltimaBusca,
  guardarUltimaBusca,
  lerEnderecoDaBusca,
  parametrosDaBusca,
  zoomDaArea,
} from "./buscaNaUrl";

describe("busca guardada no endereço da página", () => {
  beforeEach(() => sessionStorage.clear());

  it("a busca por cidade com filtros vai e volta do endereço sem perder nada", () => {
    const filtros = {
      ...FILTROS_VAZIOS,
      cidade: " Joinville ",
      categoria: "Cultura",
      notaMinima: "4",
      abertoAgora: true,
      ordenar: "nome" as const,
    };
    const endereco = enderecoDaBusca(parametrosDaBusca(filtros), { pelaArea: false, mapa: false });

    expect(endereco.toString()).toBe("cidade=Joinville&categoria=Cultura&notaMinima=4&abertoAgora=true&ordenar=nome");
    expect(lerEnderecoDaBusca(endereco)).toEqual({
      filtros: { ...filtros, cidade: "Joinville" },
      pelaArea: false,
      area: null,
      mapa: false,
    });
  });

  it("a busca perto de mim guarda a posição e o raio", () => {
    const filtros = { ...FILTROS_VAZIOS, localizacao: { lat: -26.3, lng: -48.85 }, raioKm: "25", ordenar: "distancia" as const };
    const lida = lerEnderecoDaBusca(enderecoDaBusca(parametrosDaBusca(filtros), { pelaArea: false, mapa: true }));

    expect(lida?.filtros).toEqual(filtros);
    expect(lida?.mapa).toBe(true);
  });

  it("a busca pela área do mapa guarda a região, sem o limite interno nem a cidade digitada", () => {
    const params = parametrosDaBusca({ ...FILTROS_VAZIOS, cidade: "Joinville", categoria: "Natureza" }, {
      latitude: -26.3,
      longitude: -48.85,
      raioKm: 12.3456,
    });
    const endereco = enderecoDaBusca(params, { pelaArea: true, mapa: true });

    expect(params.limite).toBe("100");
    expect(endereco.has("limite")).toBe(false);
    expect(endereco.has("cidade")).toBe(false);
    expect(lerEnderecoDaBusca(endereco)).toEqual({
      filtros: { ...FILTROS_VAZIOS, categoria: "Natureza" },
      pelaArea: true,
      area: { latitude: -26.3, longitude: -48.85, raioKm: 12.35 },
      mapa: true,
    });
  });

  it("sem parâmetros de busca é a página inicial limpa; o mapa livre volta aberto", () => {
    expect(lerEnderecoDaBusca(new URLSearchParams(""))).toBeNull();
    expect(lerEnderecoDaBusca(new URLSearchParams("ver=mapa"))).toBeNull();
    expect(lerEnderecoDaBusca(new URLSearchParams("area=1&ver=mapa"))).toMatchObject({ pelaArea: true, area: null, mapa: true });
  });

  it("valores estranhos no endereço viram o padrão em vez de quebrar a busca", () => {
    const lida = lerEnderecoDaBusca(new URLSearchParams("cidade=Rio&ordenar=xyz&notaMinima=9&raioKm=999&lat=abc&lng=10"));

    expect(lida?.filtros).toEqual({ ...FILTROS_VAZIOS, cidade: "Rio" });
  });

  it("o zoom da região fica entre o Brasil inteiro e a rua", () => {
    expect(zoomDaArea({ latitude: -26.3, longitude: -48.85, raioKm: 10 })).toBe(13);
    expect(zoomDaArea({ latitude: -15, longitude: -50, raioKm: 5000 })).toBe(4);
    expect(zoomDaArea({ latitude: -15, longitude: -50, raioKm: 0.01 })).toBe(17);
  });

  it("o Voltar para a busca leva à última busca da aba, ou à página inicial", () => {
    expect(enderecoDaUltimaBusca()).toBe("/");

    guardarUltimaBusca(new URLSearchParams("cidade=Joinville&categoria=Cultura"));

    expect(enderecoDaUltimaBusca()).toBe("/?cidade=Joinville&categoria=Cultura");
  });
});
