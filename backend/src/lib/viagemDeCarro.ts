import prisma from "./prisma";
import { municipioPorCodigo, procurarMunicipio, separarUf, type Municipio } from "./municipios";
import { buscarRota, SemEstrada, segundosAte, type Rota } from "./rotas";
import { candidatosDaRota, tracadoEntre } from "./corredor";
import { resumirCidades, type ResumoOsm } from "./resumoOsm";
import { dividirEmDias, type CandidatoDePernoite, type DivisaoDaPerna } from "./divisaoEmDias";
import type { EtapaDoRoteiro } from "./recomendacao";
import { estimarCombustivel } from "./combustivel";
import { consultarPreparo, PONTOS_PARA_CIDADE_PRONTA, pontosDaCidade, prepararCidade } from "./cidadesSobDemanda";

// Viagem de carro saindo de casa: cada perna (casa → 1ª cidade, …) é dividida em dias de estrada
// com pernoite, e o trecho que chega a uma cidade é descontado do 1º dia nela quando sobram ao
// menos 2 horas de passeio; senão vira um dia só de estrada.

export const HORAS_MINIMAS_DE_PASSEIO_NA_CHEGADA = 2;
export const KM_POR_DIA_PADRAO = 500;
export const MAX_DIAS_DA_VIAGEM = 21;
// Rodadas de "divide, busca os resumos que faltam e divide de novo" por perna.
const RODADAS_DE_RESUMO = 3;
const MAX_ATRACOES_NA_RESPOSTA = 5;

/** Pedido inválido para a viagem (vira 400 com a mensagem). */
export class ErroDaViagem extends Error {}

export interface EscolhaDaNoite {
  perna: number;
  noite: number;
  codigoIbge: number;
}

export interface DecisaoDaPerna {
  perna: number;
  esticar: boolean;
}

/** O bloco `viagemDeCarro` do pedido, já validado. */
export interface PedidoDeViagem {
  origem?: number;
  kmPorDia?: number;
  horasPorDia?: number;
  comVolta?: boolean;
  consumoKmPorLitro?: number;
  precoLitroCentavos?: number;
  escolhas?: EscolhaDaNoite[];
  decisoes?: DecisaoDaPerna[];
}

export interface EntradaDaViagem {
  origem: Municipio;
  etapas: (Municipio & { dias: number })[];
  kmPorDia: number;
  horasPorDia: number | null;
  comVolta: boolean;
  horasDisponiveis: number;
  consumoKmPorLitro: number | null;
  precoLitroCentavos: number | null;
  escolhas: EscolhaDaNoite[];
  decisoes: DecisaoDaPerna[];
}

export interface CidadeDePernoite {
  codigoIbge: number | null;
  cidade: string;
  uf: string | null;
  km: number;
  distanciaDoAlvoKm: number;
  totalHospedagens: number | null;
  totalAtracoes: number | null;
  hospedagens: { idOsm: string; nome: string; tipo: string }[];
  atracoes: string[];
  aDefinir: boolean;
}

export interface TrechoPlanejado {
  dia: number;
  noite: number | null;
  de: string;
  para: string;
  metros: number;
  segundos: number;
  ocupaODia: boolean;
  noFimDoDia: boolean;
  litros: number | null;
  custoCentavos: number | null;
  tracado: [number, number][];
  pernoite: CidadeDePernoite | null;
  alternativas: CidadeDePernoite[];
}

export interface PernaPlanejada {
  perna: number;
  de: Municipio;
  para: Municipio;
  metros: number;
  segundos: number;
  trechos: TrechoPlanejado[];
  decisao: { esticar: boolean; metrosEsticando: number; metrosNoDiaSeguinte: number } | null;
}

export interface PlanoDaViagem {
  pernas: PernaPlanejada[];
  etapasDoGerador: EtapaDoRoteiro[];
  totalDeDias: number;
  combustivel: { litros: number; custoCentavos: number } | null;
  avisos: string[];
  /** Resumo (com as tags das hospedagens) de cada cidade de pernoite, para o salvamento. Não vai na resposta. */
  resumos: Map<number, ResumoOsm>;
}

export interface TrechoParaAgenda {
  km: number;
  segundos: number;
  /** 1ª, 2ª… noite da perna; null no trecho que chega ao fim dela. */
  noite: number | null;
}

export interface TrechoNaAgenda extends TrechoParaAgenda {
  dia: number;
  /** false: o trecho é descontado de um dia na cidade (não ocupa um dia só de estrada). */
  ocupaODia: boolean;
  noFimDoDia: boolean;
}

export interface EtapaNaAgenda {
  primeiroDia: number;
  /** Trecho descontado do 1º dia; null quando a chegada foi num dia só de estrada (ou não houve
   *  estrada); undefined quando esta etapa não tem perna calculada (vale a estimativa de hoje). */
  chegada: TrechoNaAgenda | null | undefined;
  minutosNoFimDoUltimoDia: number;
}

export interface PernaParaAgenda {
  trechos: TrechoParaAgenda[];
  terminaEmCasa: boolean;
}

/**
 * Numera os dias da viagem. `pernas[i]` é a estrada que chega à etapa i (null: sem estrada, a
 * casa é a própria cidade; ausente: perna não calculada); a perna depois da última etapa, se
 * houver, volta para casa.
 */
export function montarAgenda(
  pernas: (PernaParaAgenda | null)[],
  diasDasEtapas: number[],
  horasDisponiveis: number,
): { trechos: TrechoNaAgenda[][]; etapas: EtapaNaAgenda[]; totalDeDias: number } {
  const trechos: TrechoNaAgenda[][] = pernas.map(() => []);
  const etapas: EtapaNaAgenda[] = [];
  let dia = 0;

  const sobraPasseio = (t: TrechoParaAgenda) => horasDisponiveis - t.segundos / 3600 >= HORAS_MINIMAS_DE_PASSEIO_NA_CHEGADA;

  diasDasEtapas.forEach((diasDaEtapa, i) => {
    const perna = pernas[i];
    let chegada: EtapaNaAgenda["chegada"] = perna === undefined ? undefined : null;

    if (perna) {
      for (const trecho of perna.trechos) {
        if (trecho.noite !== null) {
          dia += 1;
          trechos[i].push({ ...trecho, dia, ocupaODia: true, noFimDoDia: false });
        } else if (sobraPasseio(trecho)) {
          const descontado = { ...trecho, dia: dia + 1, ocupaODia: false, noFimDoDia: false };
          trechos[i].push(descontado);
          chegada = descontado;
        } else {
          dia += 1;
          trechos[i].push({ ...trecho, dia, ocupaODia: true, noFimDoDia: false });
        }
      }
    }

    etapas.push({ primeiroDia: dia + 1, chegada, minutosNoFimDoUltimoDia: 0 });
    dia += diasDaEtapa;
  });

  // A volta para casa: curta e sem noites, fica no fim do último dia na cidade (se sobrarem 2 h
  // de passeio); senão cada trecho vira um dia só de estrada, até a chegada em casa.
  const indiceDaVolta = diasDasEtapas.length;
  const volta = pernas[indiceDaVolta];

  if (volta) {
    const [unico] = volta.trechos;
    const ultimaEtapa = etapas[etapas.length - 1];

    // Cidade de um dia só com a chegada descontada: a volta divide o mesmo dia com ela.
    const chegadaNoMesmoDia =
      ultimaEtapa && diasDasEtapas[diasDasEtapas.length - 1] === 1 && ultimaEtapa.chegada ? ultimaEtapa.chegada.segundos : 0;
    const sobraDepoisDasDuas = (t: TrechoParaAgenda) =>
      horasDisponiveis - (t.segundos + chegadaNoMesmoDia) / 3600 >= HORAS_MINIMAS_DE_PASSEIO_NA_CHEGADA;

    if (volta.trechos.length === 1 && unico.noite === null && ultimaEtapa && sobraDepoisDasDuas(unico)) {
      trechos[indiceDaVolta].push({ ...unico, dia, ocupaODia: false, noFimDoDia: true });
      ultimaEtapa.minutosNoFimDoUltimoDia = Math.round(unico.segundos / 60);
    } else {
      for (const trecho of volta.trechos) {
        dia += 1;
        trechos[indiceDaVolta].push({ ...trecho, dia, ocupaODia: true, noFimDoDia: false });
      }
    }
  }

  return { trechos, etapas, totalDeDias: dia };
}

const rotulo = (m: { cidade: string; uf: string }) => `${m.cidade}/${m.uf}`;
const umaCasa = (valor: number) => Math.round(valor * 10) / 10;

/** Resolve a origem (ou a casa da pessoa) e as cidades das etapas nos municípios do IBGE. */
export async function resolverEntradaDaViagem(
  pedido: PedidoDeViagem,
  etapas: { cidade: string; codigoIbge?: number; dias: number }[],
  idUsuario: number,
  horasDisponiveis: number,
): Promise<EntradaDaViagem> {
  const usuario = await prisma.usuario.findUnique({ where: { id: idUsuario }, select: { codigoMunicipioBase: true } });
  const codigoDaOrigem = pedido.origem ?? usuario?.codigoMunicipioBase ?? null;

  if (codigoDaOrigem === null) {
    throw new ErroDaViagem("Informe de onde você sai.");
  }

  const origem = await municipioPorCodigo(codigoDaOrigem);

  if (!origem) {
    throw new ErroDaViagem("Município de saída não encontrado.");
  }

  const resolvidas: EntradaDaViagem["etapas"] = [];

  for (const etapa of etapas) {
    const porCodigo = etapa.codigoIbge ? await municipioPorCodigo(etapa.codigoIbge) : null;
    const achados = etapa.codigoIbge ? (porCodigo ? [porCodigo] : []) : await procurarMunicipio(etapa.cidade);
    const nome = separarUf(etapa.cidade).nome;

    // Pelo código (salvamento): o nome não veio, então a mensagem cita o código.
    if (etapa.codigoIbge && !porCodigo) {
      throw new ErroDaViagem(`Uma das cidades da viagem não foi encontrada (código IBGE ${etapa.codigoIbge}).`);
    }
    if (achados.length === 0) throw new ErroDaViagem(`Não encontrei o município ${nome}.`);
    if (achados.length > 1) throw new ErroDaViagem(`Informe a UF de ${nome}.`);

    resolvidas.push({ ...achados[0], dias: etapa.dias });
  }

  return {
    origem,
    etapas: resolvidas,
    kmPorDia: pedido.kmPorDia ?? KM_POR_DIA_PADRAO,
    horasPorDia: pedido.horasPorDia ?? null,
    comVolta: pedido.comVolta ?? false,
    horasDisponiveis,
    consumoKmPorLitro: pedido.consumoKmPorLitro ?? null,
    precoLitroCentavos: pedido.precoLitroCentavos ?? null,
    escolhas: pedido.escolhas ?? [],
    decisoes: pedido.decisoes ?? [],
  };
}

interface PernaDividida {
  numero: number;
  de: Municipio;
  para: Municipio;
  rota: Rota;
  divisao: DivisaoDaPerna;
  marcos: { km: number; fracao: number }[];
  trechos: TrechoParaAgenda[];
}

/** Compartilhado entre as pernas: depois de uma falha do Overpass, não se tenta de novo nesta viagem. */
interface EstadoDoOverpass {
  falhou: boolean;
  /** Quanto esperar por cada consulta (o preparo antes da banca espera bem mais que a tela). */
  tempoLimiteMs?: number;
}

async function dividirPerna(
  numero: number,
  de: Municipio,
  para: Municipio,
  entrada: EntradaDaViagem,
  overpass: EstadoDoOverpass,
): Promise<PernaDividida> {
  let rota: Rota;

  try {
    rota = await buscarRota(de, para);
  } catch (erro) {
    if (erro instanceof SemEstrada) throw new SemEstrada(`Não há estrada entre ${rotulo(de)} e ${rotulo(para)}.`);
    throw erro;
  }

  const totalKm = rota.metros / 1000;
  const candidatos: CandidatoDePernoite[] = (await candidatosDaRota(rota.id, [de.codigoIbge, para.codigoIbge])).map((c) => ({
    ...c,
    resumo: undefined,
  }));
  const escolhas = new Map(entrada.escolhas.filter((e) => e.perna === numero).map((e) => [e.noite, e.codigoIbge]));
  const esticar = entrada.decisoes.find((d) => d.perna === numero)?.esticar;
  const dividir = () =>
    dividirEmDias({ totalKm, alvoKm: entrada.kmPorDia, horasPorDia: entrada.horasPorDia, perfil: rota.perfil, candidatos, escolhas, esticar });

  // A faixa da noite 2 depende do pernoite da noite 1: divide, busca os resumos que faltam e divide de novo.
  let divisao = dividir();

  for (let rodada = 0; rodada < RODADAS_DE_RESUMO && divisao.semResumo.length > 0; rodada += 1) {
    const pedidos = divisao.semResumo;
    // Com o Overpass fora do ar, as cidades ficam sem contagem (só pela distância) sem nova espera.
    const resumos = overpass.falhou ? new Map<number, null>() : await resumirCidades(pedidos, new Date(), overpass.tempoLimiteMs);

    if (pedidos.some((codigo) => !resumos.get(codigo))) overpass.falhou = true;

    for (const c of candidatos) {
      if (pedidos.includes(c.codigoIbge)) c.resumo = resumos.get(c.codigoIbge) ?? null;
    }

    divisao = dividir();
  }

  const marcos = [{ km: 0, fracao: 0 }, ...divisao.noites.map((n) => ({ km: n.km, fracao: n.fracao })), { km: totalKm, fracao: 1 }];
  const trechos = marcos.slice(1).map((fim, j) => ({
    km: fim.km - marcos[j].km,
    segundos: Math.round(segundosAte(rota.perfil, fim.km) - segundosAte(rota.perfil, marcos[j].km)),
    noite: j < divisao.noites.length ? j + 1 : null,
  }));

  return { numero, de, para, rota, divisao, marcos, trechos };
}

function cidadeDePernoite(c: CandidatoDePernoite, kmAlvo: number, aDefinir: boolean): CidadeDePernoite {
  const resumo = c.resumo ?? null;

  return {
    codigoIbge: c.codigoIbge,
    cidade: c.cidade,
    uf: c.uf,
    km: umaCasa(c.km),
    distanciaDoAlvoKm: umaCasa(Math.abs(c.km - kmAlvo)),
    totalHospedagens: resumo?.totalHospedagens ?? null,
    totalAtracoes: resumo?.totalAtracoes ?? null,
    hospedagens: resumo ? resumo.hospedagens.map(({ idOsm, nome, tipo }) => ({ idOsm, nome, tipo })) : [],
    atracoes: resumo ? resumo.atracoes.slice(0, MAX_ATRACOES_NA_RESPOSTA).map((a) => a.nome) : [],
    aDefinir,
  };
}

function pernoiteNoKm(km: number): CidadeDePernoite {
  return {
    codigoIbge: null,
    cidade: `Km ${Math.round(km)}`,
    uf: null,
    km: umaCasa(km),
    distanciaDoAlvoKm: 0,
    totalHospedagens: null,
    totalAtracoes: null,
    hospedagens: [],
    atracoes: [],
    aDefinir: true,
  };
}

async function planejarTrechos(
  d: PernaDividida,
  naAgenda: TrechoNaAgenda[],
  resumos: Map<number, ResumoOsm>,
  entrada: EntradaDaViagem,
) {
  const nomeDoMarco = (j: number) => {
    if (j === 0) return rotulo(d.de);
    if (j === d.marcos.length - 1) return rotulo(d.para);

    const noite = d.divisao.noites[j - 1];

    return noite.cidade ? rotulo(noite.cidade) : `Km ${Math.round(noite.km)}`;
  };
  const trechos: TrechoPlanejado[] = [];

  for (const [j, t] of naAgenda.entries()) {
    const noite = t.noite === null ? null : d.divisao.noites[t.noite - 1];

    if (noite?.cidade?.resumo) resumos.set(noite.cidade.codigoIbge, noite.cidade.resumo);

    const metros = Math.round(t.km * 1000);
    const combustivel = estimarCombustivel(metros / 1000, entrada.consumoKmPorLitro, entrada.precoLitroCentavos);

    trechos.push({
      dia: t.dia,
      noite: t.noite,
      de: nomeDoMarco(j),
      para: nomeDoMarco(j + 1),
      metros,
      segundos: t.segundos,
      ocupaODia: t.ocupaODia,
      noFimDoDia: t.noFimDoDia,
      litros: combustivel?.litros ?? null,
      custoCentavos: combustivel?.custoCentavos ?? null,
      tracado: await tracadoEntre(d.rota.id, d.marcos[j].fracao, d.marcos[j + 1].fracao),
      pernoite: !noite ? null : noite.cidade ? cidadeDePernoite(noite.cidade, noite.kmAlvo, noite.aDefinir) : pernoiteNoKm(noite.km),
      alternativas: noite ? noite.alternativas.map((c) => cidadeDePernoite(c, noite.kmAlvo, false)) : [],
    });
  }

  return trechos;
}

/** Planeja as pernas de carro e devolve, além delas, as etapas no formato do gerador de roteiro. */
export async function planejarViagemDeCarro(
  entrada: EntradaDaViagem,
  opcoes: { tempoLimiteDosResumosMs?: number } = {},
): Promise<PlanoDaViagem> {
  const { etapas, origem } = entrada;
  // Perna i chega à etapa i (a 0 sai de casa); com volta, a perna depois da última volta para casa.
  const pontas: { de: Municipio; para: Municipio }[] = etapas.map((para, i) => ({ de: i === 0 ? origem : etapas[i - 1], para }));

  if (entrada.comVolta && etapas.length > 0) {
    pontas.push({ de: etapas[etapas.length - 1], para: origem });
  }

  const overpass: EstadoDoOverpass = { falhou: false, tempoLimiteMs: opcoes.tempoLimiteDosResumosMs };
  const divididas: PernaDividida[] = [];
  const pernasDaAgenda: (PernaParaAgenda | null)[] = [];

  for (const [numero, { de, para }] of pontas.entries()) {
    if (de.codigoIbge === para.codigoIbge) {
      pernasDaAgenda.push(null);
      continue;
    }

    const dividida = await dividirPerna(numero, de, para, entrada, overpass);

    divididas.push(dividida);
    pernasDaAgenda.push({ trechos: dividida.trechos, terminaEmCasa: numero === etapas.length });
  }

  const agenda = montarAgenda(
    pernasDaAgenda,
    etapas.map((e) => e.dias),
    entrada.horasDisponiveis,
  );

  if (agenda.totalDeDias > MAX_DIAS_DA_VIAGEM) {
    throw new ErroDaViagem(
      `Com ${entrada.kmPorDia} km por dia a viagem passa de ${MAX_DIAS_DA_VIAGEM} dias; aumente os km por dia ou diminua os dias nas cidades.`,
    );
  }

  const resumos = new Map<number, ResumoOsm>();
  const pernas: PernaPlanejada[] = [];

  for (const d of divididas) {
    const trechos = await planejarTrechos(d, agenda.trechos[d.numero], resumos, entrada);
    const decisao = d.divisao.decisao;

    pernas.push({
      perna: d.numero,
      de: d.de,
      para: d.para,
      metros: trechos.reduce((soma, t) => soma + t.metros, 0),
      segundos: trechos.reduce((soma, t) => soma + t.segundos, 0),
      trechos,
      decisao: decisao
        ? {
            esticar: decisao.esticar,
            metrosEsticando: Math.round(decisao.kmEsticando * 1000),
            metrosNoDiaSeguinte: Math.round(decisao.kmNoDiaSeguinte * 1000),
          }
        : null,
    });
  }

  const chegadaDaEtapa = (indice: number): EtapaDoRoteiro["chegada"] => {
    const chegada = agenda.etapas[indice].chegada;

    if (chegada === undefined) return undefined;
    if (chegada === null) return null;

    const trecho = pernas.find((p) => p.perna === indice)?.trechos.find((t) => t.noite === null && !t.ocupaODia);

    return trecho ? { de: trecho.de, metros: trecho.metros, minutos: Math.round(trecho.segundos / 60) } : null;
  };

  const etapasDoGerador: EtapaDoRoteiro[] = entrada.etapas.map((etapa, indice) => {
    const chegada = chegadaDaEtapa(indice);
    const minutosNoFim = agenda.etapas[indice].minutosNoFimDoUltimoDia;

    return {
      cidade: etapa.cidade,
      dias: etapa.dias,
      primeiroDia: agenda.etapas[indice].primeiroDia,
      ...(chegada === undefined ? {} : { chegada }),
      ...(minutosNoFim > 0 ? { minutosNoFimDoUltimoDia: minutosNoFim } : {}),
    };
  });

  const avisos = [...new Set(divididas.flatMap((d) => d.divisao.avisos))];

  if (pernas.length > 0 && pernas.every((p) => p.trechos.every((t) => t.noite === null))) {
    avisos.push("Nenhuma perna passa de um dia de estrada.");
  }

  const comCarro = entrada.consumoKmPorLitro !== null && entrada.precoLitroCentavos !== null;

  if (pernas.length > 0 && !comCarro && (entrada.consumoKmPorLitro !== null || entrada.precoLitroCentavos !== null)) {
    avisos.push("Informe o consumo e o preço do litro para estimar o combustível.");
  }

  const todosOsTrechos = pernas.flatMap((p) => p.trechos);
  const combustivel =
    comCarro && todosOsTrechos.length > 0
      ? {
          litros: Math.round(todosOsTrechos.reduce((soma, t) => soma + (t.litros ?? 0), 0) * 10) / 10,
          custoCentavos: todosOsTrechos.reduce((soma, t) => soma + (t.custoCentavos ?? 0), 0),
        }
      : null;

  return { pernas, etapasDoGerador, totalDeDias: agenda.totalDeDias, combustivel, avisos, resumos };
}

export interface PreparoDoDestino {
  cidade: string;
  uf: string;
  /**
   * ocupado: outras cidades já estão sendo preparadas (o limite de preparos simultâneos);
   * poucos e erro: um preparo recente já terminou assim e não é refeito tão cedo.
   */
  estado: "preparando" | "pronta" | "ocupado" | "poucos" | "erro";
}

/**
 * Cidades da viagem sem pontos para visitar (ex.: Rio de Janeiro na primeira viagem para lá):
 * dispara o preparo sob demanda de cada uma, o mesmo de "Buscar outra cidade do Brasil".
 */
export async function prepararDestinosSemPontos(etapas: Municipio[], idUsuario: number): Promise<PreparoDoDestino[]> {
  const preparos: PreparoDoDestino[] = [];

  for (const etapa of etapas) {
    if ((await pontosDaCidade(etapa.cidade, etapa.latitude, etapa.longitude)) >= PONTOS_PARA_CIDADE_PRONTA) continue;
    if (preparos.some((p) => p.cidade === etapa.cidade && p.uf === etapa.uf)) continue;

    // Um preparo que terminou há pouco (guardado por 30 min) não é refeito a cada nova geração:
    // pronto com menos de 3 pontos quer dizer que o OpenStreetMap tem poucos lugares ali.
    const anterior = consultarPreparo(etapa.cidade, etapa.uf);

    if (anterior && anterior.estado !== "preparando") {
      preparos.push({ cidade: etapa.cidade, uf: etapa.uf, estado: anterior.estado === "pronta" ? "poucos" : "erro" });
      continue;
    }

    const resultado = await prepararCidade(etapa.cidade, etapa.uf, etapa.latitude, etapa.longitude, idUsuario);

    preparos.push({ cidade: etapa.cidade, uf: etapa.uf, estado: resultado.situacao });
  }

  return preparos;
}
