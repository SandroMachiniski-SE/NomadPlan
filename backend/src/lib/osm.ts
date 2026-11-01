// Leitura dos dados do OpenStreetMap (OSM) para o inventário: quais elementos viram pontos,
// em que categoria entram e como as etiquetas ("tags") do OSM viram os nossos campos.
// Os dados do OSM são abertos (licença ODbL) e exigem a atribuição "© colaboradores do
// OpenStreetMap" onde forem exibidos.

import { distanciaMetros } from "./geo";
import { converterHorarioOsm } from "./horariosOsm";

export interface ElementoOsm {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  /** Centro calculado pelo Overpass ("out center") para áreas e relações. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Ponto pronto para entrar no banco, já nos campos do NomadPlan. */
export interface PontoOsm {
  idOsm: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  cidade: string;
  endereco: string | null;
  latitude: number;
  longitude: number;
  faixaPreco: string | null;
  acessibilidade: string | null;
  siteOficial: string | null;
  telefoneContato: string | null;
  horarioFuncionamento: string | null;
  imagemUrl: string | null;
  imagemCredito: string | null;
  imagemFonte: string | null;
  /** Para buscar foto e descrição; não vão para o banco. */
  wikidata?: string;
  wikimediaCommons?: string;
  /** A descrição foi montada a partir do tipo do lugar (o OSM não tinha uma). */
  descricaoGerada?: boolean;
}

type Classificacao = { categoria: string; tipo: string };

// Etiqueta → [categoria do NomadPlan, tipo do lugar em português].
const CLASSIFICACAO: Record<string, Record<string, [string, string]>> = {
  tourism: {
    museum: ["Cultura", "Museu"],
    gallery: ["Cultura", "Galeria de arte"],
    artwork: ["Cultura", "Obra de arte"],
    viewpoint: ["Natureza", "Mirante"],
    zoo: ["Natureza", "Zoológico"],
    theme_park: ["Aventura", "Parque temático"],
    hotel: ["Hospedagem", "Hotel"],
    hostel: ["Hospedagem", "Hostel"],
    guest_house: ["Hospedagem", "Pousada"],
    camp_site: ["Hospedagem", "Camping"],
  },
  amenity: {
    restaurant: ["Gastronomia", "Restaurante"],
    cafe: ["Gastronomia", "Café"],
    bar: ["Gastronomia", "Bar"],
    pub: ["Gastronomia", "Bar"],
    biergarten: ["Gastronomia", "Cervejaria"],
    ice_cream: ["Gastronomia", "Sorveteria"],
    theatre: ["Cultura", "Teatro"],
    arts_centre: ["Cultura", "Centro cultural"],
    marketplace: ["Compras", "Mercado"],
    place_of_worship: ["Religioso", "Templo religioso"],
  },
  historic: {
    monument: ["Cultura", "Monumento"],
    memorial: ["Cultura", "Memorial"],
    building: ["Cultura", "Patrimônio histórico"],
    architecture: ["Cultura", "Patrimônio histórico"],
    heritage: ["Cultura", "Patrimônio histórico"],
    castle: ["Cultura", "Castelo"],
    city_gate: ["Cultura", "Portal"],
    fort: ["Cultura", "Fortaleza"],
    ruins: ["Cultura", "Ruínas"],
  },
  leisure: {
    park: ["Natureza", "Parque"],
    nature_reserve: ["Natureza", "Reserva natural"],
    garden: ["Natureza", "Jardim"],
    water_park: ["Aventura", "Parque aquático"],
  },
  natural: {
    beach: ["Natureza", "Praia"],
    waterfall: ["Natureza", "Cachoeira"],
    peak: ["Aventura", "Morro"],
    cave_entrance: ["Aventura", "Gruta"],
  },
  // Cachoeiras costumam vir como "waterway=waterfall", não como "natural".
  waterway: {
    waterfall: ["Natureza", "Cachoeira"],
  },
  shop: {
    mall: ["Compras", "Shopping"],
    gift: ["Compras", "Loja de presentes e lembranças"],
    souvenir: ["Compras", "Loja de presentes e lembranças"],
    craft: ["Compras", "Artesanato"],
  },
};

const ORDEM_DAS_CHAVES = ["tourism", "amenity", "historic", "leisure", "natural", "waterway", "shop"];

// Para o "tourism=attraction" sem outra etiqueta, o próprio nome costuma dizer o que é.
const ATRACAO_PELO_NOME: [RegExp, Classificacao][] = [
  [/^(cachoeira|cascata|salto)\b/i, { categoria: "Natureza", tipo: "Cachoeira" }],
  [/^(praia|prainha)\b/i, { categoria: "Natureza", tipo: "Praia" }],
  [/^(mirante|morro|pico|serra|pedra)\b/i, { categoria: "Natureza", tipo: "Mirante" }],
  [/^(trilha|caminho)\b/i, { categoria: "Aventura", tipo: "Trilha" }],
  [/^(gruta|caverna)s?\b/i, { categoria: "Aventura", tipo: "Gruta" }],
  [/^(parque|reserva|jardim|bosque)\b/i, { categoria: "Natureza", tipo: "Parque" }],
];

const TIPO_DO_TEMPLO: Record<string, string> = {
  cathedral: "Catedral",
  basilica: "Basílica",
  church: "Igreja",
  chapel: "Capela",
};

// Praças de bairro e rotatórias também são "leisure=park" no OSM; só entram se tiverem
// algum sinal de interesse turístico.
const NOME_DE_PRACA = /^(praça|pracinha|largo|rótula|rotatória|área verde|área de lazer|canteiro)\b/i;

const MORADIA = new Set(["house", "residential", "apartments", "detached", "terrace", "semidetached_house"]);

function temInteresseTuristico(tags: Record<string, string>): boolean {
  return Boolean(tags.wikidata || tags.tourism || tags.heritage || tags.historic || tags.website);
}

/**
 * Diz em que categoria o elemento entra, ou null se ele não interessa ao inventário
 * (sem nome, privado, desativado, praça de bairro, igreja sem interesse turístico...).
 */
export function classificarElemento(tags: Record<string, string>): Classificacao | null {
  if (!tags.name?.trim()) return null;
  if (tags.access === "private" || tags.access === "no") return null;
  if (tags.disused === "yes" || tags.abandoned === "yes" || tags["disused:amenity"]) return null;

  for (const chave of ORDEM_DAS_CHAVES) {
    const regra = CLASSIFICACAO[chave][tags[chave]];

    if (!regra) continue;

    const [categoria, tipo] = regra;

    if (tags.leisure === "park" && chave === "leisure" && NOME_DE_PRACA.test(tags.name) && !temInteresseTuristico(tags)) {
      return null;
    }

    if (tags.amenity === "place_of_worship" && chave === "amenity") {
      // Ter site não basta aqui: quase toda igreja tem um.
      const relevante =
        Boolean(tags.wikidata || tags.tourism || tags.heritage || tags.historic) ||
        tags.building === "cathedral" ||
        tags.building === "basilica";

      return relevante ? { categoria, tipo: TIPO_DO_TEMPLO[tags.building] ?? tipo } : null;
    }

    // Casas antigas (como as de enxaimel) são patrimônio, mas são residências particulares.
    if (chave === "historic" && MORADIA.has(tags.building) && !tags.wikidata && !tags.tourism && !tags.heritage) {
      return null;
    }

    if (tags.natural === "peak" && chave === "natural" && !tags.wikidata && !tags.tourism) {
      return null;
    }

    if (tags.leisure === "garden" && tags["garden:type"] === "residential") {
      return null;
    }

    return { categoria, tipo };
  }

  // "tourism=attraction" sozinho é genérico demais para escolher a categoria por ele.
  if (tags.tourism !== "attraction") {
    return null;
  }

  const peloNome = ATRACAO_PELO_NOME.find(([padrao]) => padrao.test(tags.name.trim()));

  return peloNome ? peloNome[1] : { categoria: "Cultura", tipo: "Atração turística" };
}

const COZINHAS: Record<string, string> = {
  pizza: "pizza",
  italian: "comida italiana",
  japanese: "comida japonesa",
  sushi: "sushi",
  chinese: "comida chinesa",
  asian: "comida asiática",
  thai: "comida tailandesa",
  indian: "comida indiana",
  brazilian: "comida brasileira",
  regional: "comida regional",
  german: "comida alemã",
  portuguese: "comida portuguesa",
  french: "comida francesa",
  mexican: "comida mexicana",
  peruvian: "comida peruana",
  arab: "comida árabe",
  lebanese: "comida árabe",
  international: "cozinha internacional",
  seafood: "frutos do mar",
  fish: "peixes",
  steak_house: "churrasco",
  barbecue: "churrasco",
  burger: "hambúrguer",
  sandwich: "lanches",
  chicken: "frango",
  vegetarian: "opções vegetarianas",
  vegan: "opções veganas",
  coffee_shop: "café",
  cake: "bolos",
  pastry: "doces",
  ice_cream: "sorvete",
  crepe: "crepe",
  beer: "cerveja",
  buffet: "bufê",
};

function juntarComE(itens: string[]): string {
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

function primeiroValor(valor: string | undefined): string | null {
  const primeiro = valor?.split(";")[0].trim();

  return primeiro ? primeiro : null;
}

function limitar(texto: string | null, tamanho: number): string | null {
  return texto && texto.length <= tamanho ? texto : null;
}

function descricaoOriginal(tags: Record<string, string>): string | null {
  const descricao = (tags["description:pt"] ?? tags.description)?.trim();

  return descricao ? descricao.slice(0, 2000) : null;
}

function descricaoPeloTipo(tags: Record<string, string>, tipo: string): string {

  const cozinhas = [
    ...new Set(
      (tags.cuisine ?? "")
        .split(";")
        .map((c) => COZINHAS[c.trim().toLowerCase()])
        .filter(Boolean),
    ),
  ].slice(0, 3);

  return cozinhas.length > 0 ? `${tipo}. Cardápio: ${juntarComE(cozinhas)}.` : `${tipo}.`;
}

function montarEndereco(tags: Record<string, string>): string | null {
  const rua = tags["addr:street"]?.trim();

  if (!rua) {
    return null;
  }

  const numero = tags["addr:housenumber"]?.trim();
  const bairro = (tags["addr:suburb"] ?? tags["addr:neighbourhood"])?.trim();
  let endereco = numero ? `${rua}, ${numero}` : rua;

  if (bairro) endereco += ` - ${bairro}`;

  return limitar(endereco, 200);
}

/** Aceita só endereços http(s); "www.exemplo.com.br" ganha o "https://" que falta. */
export function normalizarSite(valor: string | undefined): string | null {
  const bruto = primeiroValor(valor);

  if (!bruto) {
    return null;
  }

  const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(bruto) ? `https://${bruto}` : null;

  if (!comProtocolo) {
    return null;
  }

  try {
    const url = new URL(comProtocolo);

    return url.protocol === "http:" || url.protocol === "https:" ? limitar(comProtocolo, 200) : null;
  } catch {
    return null;
  }
}

// Os textos seguem as palavras-chave de preferencias.ts ("cadeira de rodas", "banheiro
// adaptado"); a frase do "não" evita essas palavras para não contar como acessível.
function descreverAcessibilidade(tags: Record<string, string>): string | null {
  const partes: string[] = [];

  if (tags.wheelchair === "yes" || tags.wheelchair === "designated") {
    partes.push("Acesso para cadeira de rodas");
  } else if (tags.wheelchair === "limited") {
    partes.push("Acesso parcial para cadeira de rodas");
  } else if (tags.wheelchair === "no") {
    partes.push("Sem adaptação para pessoas com deficiência física");
  }

  if (tags["toilets:wheelchair"] === "yes") {
    partes.push("banheiro adaptado");
  }

  return partes.length > 0 ? partes.join(", ") : null;
}

// Horários que alguém escreveu em português direto no OSM ("8:00 às 23:30") já estão no
// formato que o sistema entende; os que usam a sintaxe do OSM e não deu para converter
// ficam de fora, para não serem lidos errado.
function descreverHorario(tags: Record<string, string>): string | null {
  const bruto = tags.opening_hours?.trim();

  if (!bruto) {
    return null;
  }

  const convertido = converterHorarioOsm(bruto);

  if (convertido) {
    return convertido;
  }

  const sintaxeOsm = /\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH|off|open|closed|sunrise|sunset)\b|[+"[\]|]/;

  return !sintaxeOsm.test(bruto) && /\d/.test(bruto) ? limitar(bruto, 200) : null;
}

/** Converte um elemento do OSM em ponto, ou null se ele não entra no inventário. */
export function pontoDoElemento(elemento: ElementoOsm, cidade: string): PontoOsm | null {
  const tags = elemento.tags ?? {};
  const classificacao = classificarElemento(tags);
  const latitude = elemento.lat ?? elemento.center?.lat;
  const longitude = elemento.lon ?? elemento.center?.lon;

  if (!classificacao || latitude === undefined || longitude === undefined) {
    return null;
  }

  // Placas e marcos com o próprio nome da cidade ("Pomerode") não são um passeio.
  if (tags.name.trim().toLowerCase() === cidade.trim().toLowerCase()) {
    return null;
  }

  return {
    idOsm: `${elemento.type}/${elemento.id}`,
    nome: tags.name.trim().slice(0, 160),
    descricao: descricaoOriginal(tags) ?? descricaoPeloTipo(tags, classificacao.tipo),
    categoria: classificacao.categoria,
    cidade,
    endereco: montarEndereco(tags),
    latitude,
    longitude,
    faixaPreco: tags.fee === "no" ? "Gratuito" : null,
    acessibilidade: descreverAcessibilidade(tags),
    siteOficial: normalizarSite(tags.website ?? tags["contact:website"] ?? tags.url),
    telefoneContato: limitar(primeiroValor(tags.phone ?? tags["contact:phone"] ?? tags["contact:mobile"]), 40),
    horarioFuncionamento: descreverHorario(tags),
    imagemUrl: null,
    imagemCredito: null,
    imagemFonte: null,
    ...(tags.wikidata ? { wikidata: tags.wikidata } : {}),
    ...(tags.wikimedia_commons?.startsWith("File:") ? { wikimediaCommons: tags.wikimedia_commons } : {}),
    ...(descricaoOriginal(tags) ? {} : { descricaoGerada: true }),
  };
}

function quantidadeDeInformacao(ponto: PontoOsm): number {
  return Object.values(ponto).filter((valor) => valor !== null && valor !== undefined).length;
}

/**
 * O mesmo lugar às vezes aparece duas vezes no OSM (um ponto e a área do prédio, por
 * exemplo). Fica o registro mais completo entre os que têm o mesmo nome a menos de 150 m.
 */
export function removerDuplicadosOsm(pontos: PontoOsm[]): PontoOsm[] {
  const ordenados = [...pontos].sort((a, b) => quantidadeDeInformacao(b) - quantidadeDeInformacao(a));
  const mantidos: PontoOsm[] = [];

  for (const ponto of ordenados) {
    const nome = ponto.nome.toLowerCase();
    const repetido = mantidos.some(
      (outro) =>
        outro.nome.toLowerCase() === nome &&
        distanciaMetros(outro.latitude, outro.longitude, ponto.latitude, ponto.longitude) <= 150,
    );

    if (!repetido) {
      mantidos.push(ponto);
    }
  }

  return mantidos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.idOsm.localeCompare(b.idOsm));
}

/**
 * Nomes genéricos repetidos na mesma cidade ("Casa Enxaimel", redes de lojas) ganham a rua
 * para a pessoa saber de qual se trata; sem endereço, não há como diferenciar e ficam de fora.
 */
export function diferenciarNomesRepetidos(pontos: PontoOsm[], minimoDeRepeticoes = 3): PontoOsm[] {
  const contagem = new Map<string, number>();

  for (const ponto of pontos) {
    const chave = ponto.nome.toLowerCase();
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }

  return pontos.flatMap((ponto) => {
    if ((contagem.get(ponto.nome.toLowerCase()) ?? 0) < minimoDeRepeticoes) {
      return [ponto];
    }

    const rua = ponto.endereco?.split(" - ")[0];

    return rua ? [{ ...ponto, nome: `${ponto.nome} (${rua})`.slice(0, 160) }] : [];
  });
}

/** Consulta da Overpass API com todos os tipos de lugar que o inventário usa. */
export function consultaOverpass(cidade: string, uf: string): string {
  const nome = cidade.replace(/["\\]/g, "");
  const filtros = ORDEM_DAS_CHAVES.map((chave) => {
    const valores = Object.keys(CLASSIFICACAO[chave]).concat(chave === "tourism" ? ["attraction"] : []);

    return `nwr["${chave}"~"^(${valores.join("|")})$"]["name"](area.cidade);`;
  }).join("\n  ");

  return `[out:json][timeout:180];
area["ISO3166-2"="BR-${uf.toUpperCase()}"]->.uf;
rel(area.uf)["boundary"="administrative"]["admin_level"="8"]["name"="${nome}"];
map_to_area->.cidade;
(
  ${filtros}
);
out center tags;`;
}
