import prisma from "./prisma";
import { AGENTE } from "./baixarCidade";
import { distanciaMetros } from "./geo";
import type { ElementoOsm } from "./osm";

// Resumo de cada cidade candidata a pernoite: quantas hospedagens e atrações há a até 8 km da
// sede, pelo Overpass (OpenStreetMap). É o que ordena as sugestões ("mais hospedagens", "ter o
// que ver"). Fica no próprio município por 30 dias; vencido, ainda serve se o Overpass falhar.

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
export const RAIO_DA_CIDADE_KM = 8;
const VALIDADE_DO_RESUMO_MS = 30 * 24 * 60 * 60 * 1000;
// A geração da viagem espera o Overpass por pouco tempo; a consulta continua depois disso e grava o
// resumo para a próxima geração. O Overpass público às vezes leva quase um minuto.
const ESPERA_PADRAO_MS = 10_000;
const CONSULTA_EM_SEGUNDO_PLANO_MS = 90_000;
// Depois de uma falha, a mesma cidade não volta a esperar o Overpass por um tempo.
const PAUSA_DEPOIS_DE_FALHA_MS = 3 * 60 * 1000;
// O aquecimento de madrugada espera o Overpass sem pressa e, quando ele recusa, tenta de novo.
const ESPERA_DO_AQUECIMENTO_MS = 175_000;
const PAUSA_DO_AQUECIMENTO_MS = 60_000;
const TENTATIVAS_DO_AQUECIMENTO = 3;
const INTERVALO_ENTRE_CONSULTAS_MS = 1000;
const MAX_HOSPEDAGENS = 40;
const MAX_ATRACOES = 10;

const TIPOS_DE_HOSPEDAGEM = new Set(["hotel", "motel", "guest_house", "hostel", "chalet", "apartment", "camp_site"]);
const TURISMO_ATRACAO = new Set(["attraction", "museum", "viewpoint", "gallery", "zoo", "theme_park"]);

export interface HospedagemDoResumo {
  idOsm: string;
  nome: string;
  tipo: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
}

export interface ResumoOsm {
  hospedagens: HospedagemDoResumo[];
  atracoes: { idOsm: string; nome: string }[];
  totalHospedagens: number;
  totalAtracoes: number;
}

interface CidadeParaResumo {
  codigoIbge: number;
  latitude: number;
  longitude: number;
}

const grau = (valor: number) => Number(valor.toFixed(4));

/** Retângulo (sul, oeste, norte, leste) que contém o círculo de `raioKm` em volta do ponto. */
function retangulo(latitude: number, longitude: number, raioKm: number): string {
  const dLat = raioKm / 111.32;
  const dLon = raioKm / (111.32 * Math.cos((latitude * Math.PI) / 180));

  return `${grau(latitude - dLat)},${grau(longitude - dLon)},${grau(latitude + dLat)},${grau(longitude + dLon)}`;
}

export function consultaDoResumo(cidades: { latitude: number; longitude: number }[], timeoutSegundos = 25): string {
  // Monumentos (historic) e praças (leisure=park) ficam de fora: nas regiões metropolitanas são
  // milhares e a consulta estourava o tempo limite do Overpass. Pelo mesmo motivo a busca é por
  // retângulo, bem mais rápida que "around"; o raio de 8 km é conferido depois, no código.
  const filtros = [
    `["tourism"~"^(${[...TIPOS_DE_HOSPEDAGEM, ...TURISMO_ATRACAO].join("|")})$"]`,
    `["natural"~"^(beach|waterfall)$"]`,
    `["waterway"="waterfall"]`,
  ];
  const linhas = cidades.flatMap(({ latitude, longitude }) => {
    const caixa = retangulo(latitude, longitude, RAIO_DA_CIDADE_KM);

    return filtros.map((filtro) => `  nwr${filtro}["name"](${caixa});`);
  });

  return `[out:json][timeout:${timeoutSegundos}];\n(\n${linhas.join("\n")}\n);\nout center tags;\n`;
}

function ehAtracao(tags: Record<string, string>): boolean {
  return (
    TURISMO_ATRACAO.has(tags.tourism ?? "") ||
    tags.historic !== undefined ||
    tags.leisure === "park" ||
    tags.natural === "beach" ||
    tags.natural === "waterfall" ||
    tags.waterway === "waterfall"
  );
}

/** Quantos dos dados de contato a hospedagem tem: as mais completas aparecem primeiro. */
function completude(tags: Record<string, string>): number {
  return ["phone", "website", "stars"].filter((chave) => tags[chave] || tags[`contact:${chave}`]).length;
}

function resumoVazio(): ResumoOsm {
  return { hospedagens: [], atracoes: [], totalHospedagens: 0, totalAtracoes: 0 };
}

export function distribuirElementos(
  elementos: ElementoOsm[],
  cidades: CidadeParaResumo[],
  raioKm = RAIO_DA_CIDADE_KM,
): Map<number, ResumoOsm> {
  const resumos = new Map(cidades.map((c) => [c.codigoIbge, resumoVazio()]));
  const vistos = new Set<string>();

  for (const elemento of elementos) {
    const tags = elemento.tags ?? {};
    const nome = tags.name?.trim();
    const latitude = elemento.lat ?? elemento.center?.lat;
    const longitude = elemento.lon ?? elemento.center?.lon;
    const idOsm = `${elemento.type}/${elemento.id}`;

    if (!nome || latitude === undefined || longitude === undefined || vistos.has(idOsm)) continue;

    let maisPerto: { codigo: number; metros: number } | null = null;

    for (const cidade of cidades) {
      const metros = distanciaMetros(cidade.latitude, cidade.longitude, latitude, longitude);

      if (metros <= raioKm * 1000 && (!maisPerto || metros < maisPerto.metros)) {
        maisPerto = { codigo: cidade.codigoIbge, metros };
      }
    }

    if (!maisPerto) continue;

    const resumo = resumos.get(maisPerto.codigo)!;
    vistos.add(idOsm);

    if (TIPOS_DE_HOSPEDAGEM.has(tags.tourism ?? "")) {
      resumo.totalHospedagens += 1;
      resumo.hospedagens.push({ idOsm, nome, tipo: tags.tourism, latitude, longitude, tags });
    } else if (ehAtracao(tags)) {
      resumo.totalAtracoes += 1;
      resumo.atracoes.push({ idOsm, nome });
    }
  }

  for (const resumo of resumos.values()) {
    resumo.hospedagens = resumo.hospedagens
      .sort((a, b) => completude(b.tags) - completude(a.tags) || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAX_HOSPEDAGENS);
    resumo.atracoes = resumo.atracoes.slice(0, MAX_ATRACOES);
  }

  return resumos;
}

let fila: Promise<unknown> = Promise.resolve();
let ultimaConsultaEm = 0;

function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(async () => {
    const espera = ultimaConsultaEm + INTERVALO_ENTRE_CONSULTAS_MS - Date.now();

    if (espera > 0) {
      await new Promise((resolver) => setTimeout(resolver, espera));
    }

    ultimaConsultaEm = Date.now();

    return tarefa();
  });

  fila = resultado.catch(() => undefined);

  return resultado;
}

async function consultarOverpass(cidades: CidadeParaResumo[], tempoLimiteMs: number): Promise<ElementoOsm[]> {
  // O servidor desiste 5 s antes de nós, para a resposta (mesmo vazia) ainda chegar.
  const timeoutDoServidor = Math.max(5, Math.round(tempoLimiteMs / 1000) - 5);

  return naFila(async () => {
    const resposta = await fetch(OVERPASS_URL, {
      method: "POST",
      body: new URLSearchParams({ data: consultaDoResumo(cidades, timeoutDoServidor) }),
      headers: { "User-Agent": AGENTE, Accept: "application/json" },
      signal: AbortSignal.timeout(tempoLimiteMs),
    });

    if (!resposta.ok) {
      throw new Error(`O Overpass respondeu ${resposta.status}.`);
    }

    const corpo = (await resposta.json()) as { elements?: ElementoOsm[]; remark?: string };

    // Quando estoura o próprio tempo limite, o Overpass responde 200 com os elementos vazios (ou
    // pela metade) e o aviso no "remark": isso é falha, não "nenhum hotel" (que ficaria 30 dias).
    if (/runtime error/i.test(corpo.remark ?? "")) {
      throw new Error(`O Overpass não terminou a consulta: ${corpo.remark}`);
    }

    return corpo.elements ?? [];
  });
}

interface MunicipioComResumo extends CidadeParaResumo {
  resumo: ResumoOsm | null;
  resumoEm: Date | null;
}

// Consultas em andamento (uma por cidade, mesmo com gerações simultâneas) e cidades em pausa.
const emAndamento = new Map<number, Promise<void>>();
const pausadasAte = new Map<number, number>();

/** Para os testes: esquece as consultas em andamento e as pausas. */
export function esquecerConsultasDosResumos(): void {
  emAndamento.clear();
  pausadasAte.clear();
}

async function buscarEGravar(cidades: MunicipioComResumo[], tempoLimiteMs: number, agora: Date): Promise<void> {
  try {
    const resumos = distribuirElementos(await consultarOverpass(cidades, tempoLimiteMs), cidades);

    for (const [codigo, resumo] of resumos) {
      await prisma.$executeRaw`
        UPDATE municipio SET resumo_osm = ${JSON.stringify(resumo)}::jsonb, resumo_em = ${agora}
        WHERE codigo_ibge = ${codigo}
      `;
    }
  } catch (erro) {
    console.error("Overpass indisponível para o resumo das cidades:", erro instanceof Error ? erro.message : erro);

    const ate = Date.now() + PAUSA_DEPOIS_DE_FALHA_MS;

    for (const c of cidades) pausadasAte.set(c.codigoIbge, ate);
  } finally {
    for (const c of cidades) emAndamento.delete(c.codigoIbge);
  }
}

/** Trava compartilhada por várias chamadas (as pernas de uma viagem): depois de uma falha, não se consulta de novo. */
export interface TravaDoOverpass {
  falhou: boolean;
}

/**
 * Resumo de cada município pedido: do cache (30 dias) ou de uma consulta só ao Overpass para
 * todos os que faltam. Espera a consulta por até `esperaMs`; o que não chegou a tempo vem com o
 * resumo vencido (ou `null`) e a consulta segue em segundo plano, gravando para a próxima vez.
 *
 * Com `trava`, o Overpass que falha ou não responde a tempo arma a trava (mesmo que haja resumo
 * vencido para usar no lugar) e, com a trava armada, não há nova consulta nem nova espera: valem o
 * cache válido e, na falta dele, o vencido.
 */
export async function resumirCidades(
  codigos: number[],
  agora: Date = new Date(),
  esperaMs = ESPERA_PADRAO_MS,
  trava?: TravaDoOverpass,
): Promise<Map<number, ResumoOsm | null>> {
  const resultado = new Map<number, ResumoOsm | null>();

  if (codigos.length === 0) return resultado;

  const ler = (lista: number[]) => prisma.$queryRaw<MunicipioComResumo[]>`
    SELECT codigo_ibge AS "codigoIbge", latitude, longitude, resumo_osm AS resumo, resumo_em AS "resumoEm"
    FROM municipio
    WHERE codigo_ibge = ANY(${lista}::int[])
  `;
  const valido = (m: MunicipioComResumo) =>
    m.resumo !== null && m.resumoEm !== null && agora.getTime() - m.resumoEm.getTime() < VALIDADE_DO_RESUMO_MS;
  const municipios = await ler(codigos);
  const faltando = municipios.filter((m) => !valido(m));

  for (const m of municipios) {
    if (valido(m)) resultado.set(m.codigoIbge, m.resumo);
  }

  if (faltando.length === 0) return resultado;

  if (trava?.falhou) {
    for (const m of faltando) resultado.set(m.codigoIbge, m.resumo);

    return resultado;
  }

  const novas = faltando.filter(
    (m) => !emAndamento.has(m.codigoIbge) && (pausadasAte.get(m.codigoIbge) ?? 0) <= Date.now(),
  );

  if (novas.length > 0) {
    const consulta = buscarEGravar(novas, Math.max(esperaMs, CONSULTA_EM_SEGUNDO_PLANO_MS), agora);

    for (const m of novas) emAndamento.set(m.codigoIbge, consulta);
  }

  const aguardando = [...new Set(faltando.flatMap((m) => emAndamento.get(m.codigoIbge) ?? []))];

  if (aguardando.length > 0) {
    let relogio: ReturnType<typeof setTimeout> | undefined;

    await Promise.race([
      Promise.all(aguardando),
      new Promise((resolver) => {
        relogio = setTimeout(resolver, esperaMs);
      }),
    ]);
    clearTimeout(relogio);
  }

  // O que chegou a tempo já está no banco; o resto vem com o resumo vencido (ou nenhum).
  const releitura = new Map((await ler(faltando.map((m) => m.codigoIbge))).map((m) => [m.codigoIbge, m]));

  for (const m of faltando) {
    const atual = releitura.get(m.codigoIbge) ?? m;
    const novo = valido(atual);

    resultado.set(m.codigoIbge, novo ? atual.resumo : m.resumo);
    if (!novo && trava) trava.falhou = true;
  }

  return resultado;
}

/**
 * Busca de antemão os resumos das cidades das UFs pedidas que ainda não têm um válido, as maiores
 * primeiro (mais chance de virar pernoite), em lotes. Feito para rodar de madrugada, num processo
 * próprio: um lote que falha (o Overpass público recusa com 429 quando está cheio) é tentado de novo
 * depois de uma pausa.
 */
export async function aquecerResumos(
  ufs: string[],
  opcoes: { lote?: number; pausaDepoisDeFalhaMs?: number; aoAvancar?: (mensagem: string) => void } = {},
): Promise<{ cidades: number; comResumo: number; falhas: number }> {
  const lote = opcoes.lote ?? 8;
  const pausa = opcoes.pausaDepoisDeFalhaMs ?? PAUSA_DO_AQUECIMENTO_MS;
  const validoDesde = new Date(Date.now() - VALIDADE_DO_RESUMO_MS);
  const pendentes = await prisma.$queryRaw<{ codigoIbge: number; nome: string; uf: string }[]>`
    SELECT codigo_ibge AS "codigoIbge", nome, uf
    FROM municipio
    WHERE uf = ANY(${ufs}::text[])
      AND (resumo_osm IS NULL OR resumo_em IS NULL OR resumo_em < ${validoDesde})
    ORDER BY populacao DESC NULLS LAST, codigo_ibge
  `;
  const totalDeLotes = Math.ceil(pendentes.length / lote);
  let comResumo = 0;
  let falhas = 0;

  for (let i = 0; i < pendentes.length; i += lote) {
    const grupo = pendentes.slice(i, i + lote);
    let faltando = grupo.map((c) => c.codigoIbge);

    for (let tentativa = 1; tentativa <= TENTATIVAS_DO_AQUECIMENTO && faltando.length > 0; tentativa += 1) {
      if (tentativa > 1) {
        await new Promise((resolver) => setTimeout(resolver, pausa));
        esquecerConsultasDosResumos();
      }

      await resumirCidades(faltando, new Date(), ESPERA_DO_AQUECIMENTO_MS);

      // Conta só o que foi gravado agora (um resumo vencido devolvido na falha não vale).
      const gravados = await prisma.$queryRaw<{ codigoIbge: number }[]>`
        SELECT codigo_ibge AS "codigoIbge" FROM municipio
        WHERE codigo_ibge = ANY(${faltando}::int[]) AND resumo_em >= ${validoDesde}
      `;
      const prontos = new Set(gravados.map((g) => g.codigoIbge));

      faltando = faltando.filter((codigo) => !prontos.has(codigo));
    }

    comResumo += grupo.length - faltando.length;
    falhas += faltando.length;
    opcoes.aoAvancar?.(
      `lote ${i / lote + 1} de ${totalDeLotes}: ${grupo.map((c) => `${c.nome}/${c.uf}`).join(", ")}` +
        (faltando.length > 0 ? ` (${faltando.length} sem resumo)` : ""),
    );
  }

  return { cidades: pendentes.length, comResumo, falhas };
}
