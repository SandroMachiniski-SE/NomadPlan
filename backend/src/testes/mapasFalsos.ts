// Servidores de mapas de mentira para os testes: intercepta o Nominatim (busca de cidades),
// o Overpass (lugares do OpenStreetMap) e o Wikidata/Commons (fotos). O resto, como o cliente
// HTTP dos testes de integração, segue para o fetch de verdade.

export interface ChamadaDeMapa {
  url: string;
  servico: "nominatim" | "overpass" | "wikidata" | "commons";
  corpo: string | null;
}

export type RespostaDeMapa = { status?: number; corpo: unknown };

export interface MapasFalsos {
  /** Resposta do Nominatim para cada texto buscado (parâmetro "q"). */
  nominatim?: (texto: string) => RespostaDeMapa;
  /** Elementos devolvidos pelo Overpass para a consulta recebida. */
  overpass?: (consulta: string) => RespostaDeMapa;
}

export function instalarMapasFalsos(respostas: MapasFalsos) {
  const original = globalThis.fetch;
  const chamadas: ChamadaDeMapa[] = [];

  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const corpo = init?.body instanceof URLSearchParams ? (init.body.get("data") ?? "") : typeof init?.body === "string" ? init.body : null;

    let servico: ChamadaDeMapa["servico"] | null = null;
    let resposta: RespostaDeMapa | undefined;

    if (url.startsWith("https://nominatim.openstreetmap.org/")) {
      servico = "nominatim";
      resposta = respostas.nominatim?.(new URL(url).searchParams.get("q") ?? "");
    } else if (url.includes("overpass")) {
      servico = "overpass";
      resposta = respostas.overpass?.(corpo ?? "");
    } else if (url.startsWith("https://www.wikidata.org/")) {
      servico = "wikidata";
      resposta = { corpo: { entities: {} } };
    } else if (url.startsWith("https://commons.wikimedia.org/")) {
      servico = "commons";
      resposta = { corpo: { query: { pages: {} } } };
    }

    if (!servico) {
      return original(entrada, init);
    }

    chamadas.push({ url, servico, corpo });

    const { status = 200, corpo: conteudo } = resposta ?? { status: 500, corpo: { erro: "sem resposta combinada" } };

    return new Response(JSON.stringify(conteudo), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  return {
    chamadas,
    desinstalar: () => {
      globalThis.fetch = original;
    },
  };
}

/** Um município do Brasil como o Nominatim o devolve. */
export function municipioNominatim(nome: string, uf: string, latitude: number, longitude: number) {
  return {
    name: nome,
    lat: String(latitude),
    lon: String(longitude),
    category: "boundary",
    type: "administrative",
    addresstype: "city",
    address: { city: nome, "ISO3166-2-lvl4": `BR-${uf}`, country_code: "br" },
  };
}

/** Um museu e um restaurante do OpenStreetMap, perto das coordenadas informadas. */
export function elementosOverpass(latitude: number, longitude: number) {
  return [
    { type: "node", id: 9001, lat: latitude, lon: longitude, tags: { name: "Museu da Colônia", tourism: "museum" } },
    { type: "node", id: 9002, lat: latitude + 0.002, lon: longitude, tags: { name: "Restaurante da Praça", amenity: "restaurant" } },
    { type: "node", id: 9003, lat: latitude, lon: longitude + 0.002, tags: { name: "Mirante do Vale", tourism: "viewpoint" } },
  ];
}
