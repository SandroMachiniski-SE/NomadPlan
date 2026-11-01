import {
  consultaOverpass,
  diferenciarNomesRepetidos,
  pontoDoElemento,
  removerDuplicadosOsm,
  type ElementoOsm,
  type PontoOsm,
} from "./osm";
import { ATRIBUICAO_OSM, LICENCA_OSM, type DadosOsmDaCidade } from "./dadosOsm";
import type { PontoParaImportar } from "./importacaoOsm";

// Baixa do OpenStreetMap (Overpass API) os lugares de uma cidade e acrescenta foto e
// descrição do Wikidata/Wikimedia Commons. Usado pelo comando "npm run osm:baixar" e pela
// preparação sob demanda de uma cidade nova (rota POST /cidades/preparar).
//
// Os servidores são públicos e mantidos por voluntários: as consultas se identificam
// (User-Agent) e quem chama deve espaçá-las. OVERPASS_URL troca o servidor (há espelhos,
// como https://overpass.kumi.systems/api/interpreter).

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
export const AGENTE = "NomadPlan/1.0 (projeto academico; https://github.com/SandroMachiniski-SE/NomadPlan)";
const LOTE_WIKIMEDIA = 50;

export async function buscarJson<T>(url: string, corpo?: URLSearchParams): Promise<T> {
  const resposta = await fetch(url, {
    method: corpo ? "POST" : "GET",
    body: corpo,
    headers: { "User-Agent": AGENTE, Accept: "application/json" },
    signal: AbortSignal.timeout(200_000),
  });

  if (!resposta.ok) {
    const dica =
      resposta.status === 429 || resposta.status === 504
        ? " O servidor está ocupado: tente de novo em alguns minutos ou use outro com OVERPASS_URL."
        : "";

    throw new Error(`${url} respondeu ${resposta.status}.${dica}`);
  }

  return (await resposta.json()) as T;
}

async function baixarElementos(cidade: string, uf: string): Promise<ElementoOsm[]> {
  const { elements } = await buscarJson<{ elements: ElementoOsm[] }>(
    OVERPASS_URL,
    new URLSearchParams({ data: consultaOverpass(cidade, uf) }),
  );

  return elements;
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const resultado: T[][] = [];

  for (let i = 0; i < itens.length; i += tamanho) {
    resultado.push(itens.slice(i, i + tamanho));
  }

  return resultado;
}

interface EntidadeWikidata {
  claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] };
  descriptions?: Record<string, { value: string }>;
}

async function dadosDoWikidata(ids: string[]) {
  const resultado = new Map<string, { arquivo?: string; descricao?: string }>();

  for (const lote of lotes(ids, LOTE_WIKIMEDIA)) {
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|descriptions" +
      `&languages=pt|pt-br&ids=${encodeURIComponent(lote.join("|"))}`;
    const { entities = {} } = await buscarJson<{ entities?: Record<string, EntidadeWikidata> }>(url);

    for (const [id, entidade] of Object.entries(entities)) {
      const descricao = entidade.descriptions?.pt?.value ?? entidade.descriptions?.["pt-br"]?.value;

      resultado.set(id, {
        arquivo: entidade.claims?.P18?.[0]?.mainsnak?.datavalue?.value,
        descricao,
      });
    }
  }

  return resultado;
}

function textoSemHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface PaginaCommons {
  title: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
}

async function fotosDoCommons(arquivos: string[]) {
  const resultado = new Map<string, { url: string; credito: string; fonte: string }>();

  for (const lote of lotes(arquivos, LOTE_WIKIMEDIA)) {
    const titulos = lote.map((arquivo) => `File:${arquivo}`).join("|");
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
      `&iiprop=url|extmetadata&iiurlwidth=960&titles=${encodeURIComponent(titulos)}`;
    const { query } = await buscarJson<{
      query?: { pages?: Record<string, PaginaCommons>; normalized?: { from: string; to: string }[] };
    }>(url);

    // A API devolve o título normalizado ("File:A_b.jpg" vira "File:A b.jpg").
    const original = new Map((query?.normalized ?? []).map((n) => [n.to, n.from]));

    for (const pagina of Object.values(query?.pages ?? {})) {
      const info = pagina.imageinfo?.[0];
      const metadados = info?.extmetadata ?? {};

      if (!info?.thumburl || !info.descriptionurl) continue;

      const autor = textoSemHtml(metadados.Artist?.value ?? "").slice(0, 80) || "autor não identificado";
      const licenca = textoSemHtml(metadados.LicenseShortName?.value ?? "") || "licença livre";
      const titulo = (original.get(pagina.title) ?? pagina.title).replace(/^File:/, "").replace(/_/g, " ");

      resultado.set(titulo, {
        url: info.thumburl.split("?")[0],
        credito: `Foto: ${autor} (${licenca}), via Wikimedia Commons`.slice(0, 200),
        fonte: info.descriptionurl,
      });
    }
  }

  return resultado;
}

function capitalizar(texto: string): string {
  const limpo = texto.trim();

  return limpo.charAt(0).toUpperCase() + limpo.slice(1) + (/[.!?]$/.test(limpo) ? "" : ".");
}

/** Acrescenta foto e descrição do Wikidata/Commons e tira os campos que não vão ao banco. */
async function enriquecer(pontos: PontoOsm[]): Promise<PontoParaImportar[]> {
  const wikidata = await dadosDoWikidata([...new Set(pontos.flatMap((p) => (p.wikidata ? [p.wikidata] : [])))]);
  const arquivoDe = (p: PontoOsm) => {
    const arquivo = p.wikimediaCommons?.replace(/^File:/, "") ?? (p.wikidata ? wikidata.get(p.wikidata)?.arquivo : undefined);

    return arquivo?.replace(/_/g, " ");
  };
  const fotos = await fotosDoCommons([...new Set(pontos.flatMap((p) => arquivoDe(p) ?? []))]);

  return pontos.map((original) => {
    const { wikidata: idWikidata, wikimediaCommons: _commons, descricaoGerada, ...ponto } = original;
    const descricaoWikidata = idWikidata ? wikidata.get(idWikidata)?.descricao : undefined;
    const arquivo = arquivoDe(original);
    const foto = arquivo ? fotos.get(arquivo) : undefined;

    return {
      ...ponto,
      descricao: descricaoGerada && descricaoWikidata ? capitalizar(descricaoWikidata) : ponto.descricao,
      imagemUrl: foto?.url ?? null,
      imagemCredito: foto?.credito ?? null,
      imagemFonte: foto?.fonte ?? null,
    };
  });
}

export interface CidadeBaixada {
  dados: DadosOsmDaCidade;
  elementosLidos: number;
}

/** Baixa os lugares da cidade; devolve null quando o OpenStreetMap não tem nenhum (nome ou UF errados). */
export async function baixarDadosDaCidade(cidade: string, uf: string): Promise<CidadeBaixada | null> {
  const elementos = await baixarElementos(cidade, uf);

  if (elementos.length === 0) {
    return null;
  }

  const lidos = diferenciarNomesRepetidos(
    removerDuplicadosOsm(elementos.flatMap((elemento) => pontoDoElemento(elemento, cidade) ?? [])),
  );
  const pontos = await enriquecer(lidos);

  return {
    elementosLidos: elementos.length,
    dados: {
      fonte: "OpenStreetMap (Overpass API), com fotos e descrições do Wikidata e do Wikimedia Commons",
      licenca: LICENCA_OSM,
      atribuicao: ATRIBUICAO_OSM,
      cidade,
      uf,
      baixadoEm: new Date().toISOString(),
      pontos,
    },
  };
}
