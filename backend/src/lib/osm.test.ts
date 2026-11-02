import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classificarElemento,
  consultaOverpass,
  diferenciarNomesRepetidos,
  normalizarSite,
  pontoDoElemento,
  removerDuplicadosOsm,
  type ElementoOsm,
  type PontoOsm,
} from "./osm";
import { preferenciasAtendidas } from "./preferencias";

const no = (tags: Record<string, string>, id = 1): ElementoOsm => ({
  type: "node",
  id,
  lat: -26.3041,
  lon: -48.8466,
  tags,
});

describe("classificarElemento", () => {
  it("leva as etiquetas do OSM às categorias do NomadPlan", () => {
    assert.deepEqual(classificarElemento({ name: "Museu X", tourism: "museum" }), { categoria: "Cultura", tipo: "Museu" });
    assert.deepEqual(classificarElemento({ name: "Bistrô", amenity: "restaurant" }), {
      categoria: "Gastronomia",
      tipo: "Restaurante",
    });
    assert.deepEqual(classificarElemento({ name: "Praia Mole", natural: "beach" }), { categoria: "Natureza", tipo: "Praia" });
    assert.deepEqual(classificarElemento({ name: "Pousada Sol", tourism: "guest_house" }), {
      categoria: "Hospedagem",
      tipo: "Pousada",
    });
    assert.deepEqual(classificarElemento({ name: "Shopping Y", shop: "mall" }), { categoria: "Compras", tipo: "Shopping" });
  });

  it("usa a etiqueta mais específica quando há várias", () => {
    assert.deepEqual(classificarElemento({ name: "Mirante", tourism: "attraction", leisure: "park" }), {
      categoria: "Natureza",
      tipo: "Parque",
    });
    assert.deepEqual(classificarElemento({ name: "Castelinho", tourism: "attraction" }), {
      categoria: "Cultura",
      tipo: "Atração turística",
    });
  });

  it("descarta o que não interessa ao inventário", () => {
    assert.equal(classificarElemento({ amenity: "restaurant" }), null, "sem nome");
    assert.equal(classificarElemento({ name: "Clube", amenity: "restaurant", access: "private" }), null);
    assert.equal(classificarElemento({ name: "Antigo bar", amenity: "bar", disused: "yes" }), null);
    assert.equal(classificarElemento({ name: "Lanchonete", amenity: "fast_food" }), null);
    assert.equal(classificarElemento({ name: "Praça do Bairro", leisure: "park" }), null);
    assert.equal(classificarElemento({ name: "Igreja do Bairro", amenity: "place_of_worship", website: "https://x.org" }), null);
    assert.equal(classificarElemento({ name: "Morro sem nome conhecido", natural: "peak" }), null);
    assert.equal(
      classificarElemento({ name: "Casa Enxaimel", historic: "architecture", building: "house" }),
      null,
      "residência particular",
    );
  });

  it("reconhece cachoeiras marcadas como waterway e atrações pelo nome", () => {
    assert.deepEqual(classificarElemento({ name: "Cascata do Avencal", tourism: "attraction", waterway: "waterfall" }), {
      categoria: "Natureza",
      tipo: "Cachoeira",
    });
    assert.equal(classificarElemento({ name: "Cachoeira da Serrinha", tourism: "attraction" })?.categoria, "Natureza");
    assert.equal(classificarElemento({ name: "Trilha da Natureza", tourism: "attraction" })?.categoria, "Aventura");
    assert.equal(classificarElemento({ name: "Morro da Igreja", tourism: "attraction" })?.tipo, "Mirante");
    assert.equal(classificarElemento({ name: "Casa do Imigrante", tourism: "attraction" })?.categoria, "Cultura");
  });

  it("descarta o marco com o próprio nome da cidade", () => {
    assert.equal(pontoDoElemento(no({ name: "Pomerode", tourism: "attraction" }), "Pomerode"), null);
  });

  it("mantém praças, igrejas e casas antigas quando há sinal de interesse turístico", () => {
    assert.equal(classificarElemento({ name: "Praça XV", leisure: "park", wikidata: "Q1" })?.categoria, "Natureza");
    assert.deepEqual(classificarElemento({ name: "Catedral", amenity: "place_of_worship", building: "cathedral" }), {
      categoria: "Religioso",
      tipo: "Catedral",
    });
    assert.equal(
      classificarElemento({ name: "Casa X", historic: "building", building: "house", heritage: "2" })?.categoria,
      "Cultura",
    );
  });
});

describe("pontoDoElemento", () => {
  it("converte endereço, contato, acessibilidade, preço e horário", () => {
    const ponto = pontoDoElemento(
      no({
        name: "Museu Nacional de Imigração e Colonização",
        tourism: "museum",
        "addr:street": "Rua Rio Branco",
        "addr:housenumber": "229",
        "addr:suburb": "Centro",
        website: "www.museu.sc.gov.br",
        phone: "+55 47 3433-3736;+55 47 3433-0000",
        wheelchair: "yes",
        "toilets:wheelchair": "yes",
        fee: "no",
        opening_hours: "Tu-Fr 09:00-17:00;Sa, Su, PH 12:00-18:00",
        wikidata: "Q10333735",
      }, 42),
      "Joinville",
    );

    assert.ok(ponto);
    assert.equal(ponto.idOsm, "node/42");
    assert.equal(ponto.categoria, "Cultura");
    assert.equal(ponto.cidade, "Joinville");
    assert.equal(ponto.endereco, "Rua Rio Branco, 229 - Centro");
    assert.equal(ponto.siteOficial, "https://www.museu.sc.gov.br");
    assert.equal(ponto.telefoneContato, "+55 47 3433-3736");
    assert.equal(ponto.acessibilidade, "Acesso para cadeira de rodas, banheiro adaptado");
    assert.equal(ponto.faixaPreco, "Gratuito");
    assert.equal(ponto.horarioFuncionamento, "Ter-Sex 9h-17h; Sáb-Dom e feriados 12h-18h; Seg fechado");
    assert.equal(ponto.descricao, "Museu.");
    assert.equal(ponto.descricaoGerada, true);
    assert.equal(ponto.wikidata, "Q10333735");
  });

  it("usa o centro calculado das áreas e a descrição do OSM quando existe", () => {
    const ponto = pontoDoElemento(
      {
        type: "way",
        id: 7,
        center: { lat: -27.6, lon: -48.5 },
        tags: { name: "Bistrô", amenity: "restaurant", description: "Cozinha açoriana." },
      },
      "Florianópolis",
    );

    assert.equal(ponto?.idOsm, "way/7");
    assert.equal(ponto?.latitude, -27.6);
    assert.equal(ponto?.descricao, "Cozinha açoriana.");
    assert.equal(ponto?.descricaoGerada, undefined);
  });

  it("descreve restaurantes pela cozinha quando o OSM não tem descrição", () => {
    const ponto = pontoDoElemento(no({ name: "Cantina", amenity: "restaurant", cuisine: "italian;pizza;desconhecida" }), "Blumenau");

    assert.equal(ponto?.descricao, "Restaurante. Cardápio: comida italiana e pizza.");
  });

  it("não marca como acessível um lugar sem acesso para cadeira de rodas", () => {
    const ponto = pontoDoElemento(no({ name: "Bar", amenity: "bar", wheelchair: "no" }), "Joinville");

    assert.ok(ponto?.acessibilidade);
    assert.equal(preferenciasAtendidas(ponto.acessibilidade, ["mobilidade_reduzida"]), 0);
    assert.equal(
      preferenciasAtendidas(pontoDoElemento(no({ name: "Bar", amenity: "bar", wheelchair: "limited" }), "Joinville")?.acessibilidade, [
        "mobilidade_reduzida",
      ]),
      1,
    );
  });

  it("mantém horário já escrito em português e descarta sintaxe do OSM que não deu para converter", () => {
    const comHorario = (opening_hours: string) =>
      pontoDoElemento(no({ name: "Café", amenity: "cafe", opening_hours }), "Joinville")?.horarioFuncionamento;

    assert.equal(comHorario("8:00 às 23:30"), "8:00 às 23:30");
    assert.equal(comHorario("Mo-Sa 18:00+"), null);
    assert.equal(comHorario("sunrise-sunset"), null);
  });

  it("ignora elementos sem coordenadas", () => {
    assert.equal(pontoDoElemento({ type: "relation", id: 1, tags: { name: "Parque", leisure: "park" } }, "Joinville"), null);
  });
});

describe("normalizarSite", () => {
  it("aceita só http(s) e completa o protocolo que falta", () => {
    assert.equal(normalizarSite("https://exemplo.com.br/a"), "https://exemplo.com.br/a");
    assert.equal(normalizarSite("exemplo.com.br"), "https://exemplo.com.br");
    assert.equal(normalizarSite("javascript:alert(1)"), null);
    assert.equal(normalizarSite("ftp://exemplo.com"), null);
    assert.equal(normalizarSite("não é site"), null);
    assert.equal(normalizarSite(undefined), null);
  });
});

function ponto(parcial: Partial<PontoOsm>): PontoOsm {
  return {
    idOsm: "node/1",
    nome: "Lugar",
    descricao: null,
    categoria: "Cultura",
    cidade: "Joinville",
    endereco: null,
    latitude: -26.3,
    longitude: -48.84,
    faixaPreco: null,
    acessibilidade: null,
    siteOficial: null,
    telefoneContato: null,
    horarioFuncionamento: null,
    imagemUrl: null,
    imagemCredito: null,
    imagemFonte: null,
    ...parcial,
  };
}

describe("removerDuplicadosOsm e diferenciarNomesRepetidos", () => {
  it("fica com o registro mais completo do mesmo lugar", () => {
    const resultado = removerDuplicadosOsm([
      ponto({ idOsm: "node/1", nome: "Museu" }),
      ponto({ idOsm: "way/2", nome: "Museu", latitude: -26.3005, siteOficial: "https://museu.br" }),
      ponto({ idOsm: "node/3", nome: "Museu", latitude: -26.4 }), // outro lugar, longe
    ]);

    assert.deepEqual(resultado.map((p) => p.idOsm).sort(), ["node/3", "way/2"]);
  });

  it("acrescenta a rua aos nomes genéricos e descarta os que não têm endereço", () => {
    const resultado = diferenciarNomesRepetidos([
      ponto({ idOsm: "node/1", nome: "Casa Enxaimel", endereco: "Rua Concórdia - Anita Garibaldi" }),
      ponto({ idOsm: "node/2", nome: "Casa Enxaimel", endereco: "Rua Rondônia, 95" }),
      ponto({ idOsm: "node/3", nome: "Casa Enxaimel" }),
      ponto({ idOsm: "node/4", nome: "Museu" }),
    ]);

    assert.deepEqual(
      resultado.map((p) => p.nome),
      ["Casa Enxaimel (Rua Concórdia)", "Casa Enxaimel (Rua Rondônia, 95)", "Museu"],
    );
  });
});

describe("consultaOverpass", () => {
  it("procura a cidade dentro do estado e só elementos com nome", () => {
    const consulta = consultaOverpass('Joinville"', "sc");

    assert.match(consulta, /area\["ISO3166-2"="BR-SC"\]/);
    assert.match(consulta, /\["name"="Joinville"\]/, "aspas do nome não quebram a consulta");
    assert.match(consulta, /nwr\["tourism"~"\^\(museum\|.*attraction\)\$"\]\["name"\]\(area\.cidade\);/);
    assert.match(consulta, /out center tags;/);
  });
});
