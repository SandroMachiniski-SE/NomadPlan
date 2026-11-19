import type { CidadeNaRota } from "./corredor";
import type { ResumoOsm } from "./resumoOsm";
import { kmApos, type PerfilDaRota } from "./rotas";

// Divide uma perna da viagem de carro em dias. Cada dia termina perto do alvo de km (ou de
// horas ao volante, o que vier primeiro), numa cidade da faixa alvo ± 50 km contada a partir do
// pernoite anterior. Entre as cidades da faixa, a nota pesa proximidade do alvo, quantidade de
// hospedagens e de atrações (sem a contagem de hotéis, o porte da cidade pela população do IBGE).
// Quando o fim da perna está "perto" (até um dia curto além da faixa), a pessoa decide entre esticar
// e chegar ou dormir antes; o padrão é dormir antes, para nenhum dia passar do limite.

export const FAIXA_KM = 50;
export const FRACAO_DIA_CURTO = 0.3;
// A faixa nunca passa de 30% do alvo do dia. Com 500 km por dia continua ±50 km; com um limite de
// horas baixo (ou estrada lenta) o alvo do dia cai e uma faixa fixa de ±50 km deixaria uma cidade
// a 30 km da saída ganhar de uma a 80 km, e o dia ficaria quase vazio.
export const FRACAO_FAIXA = 0.3;
// Sem hospedagem na faixa do alvo, a busca vai se ampliando (2, 3 e 4 vezes a faixa: ±100, 150 e
// 200 km com 500 km por dia) antes de deixar o pernoite a definir; numa estrada com poucas cidades,
// como a de Manaus a Boa Vista, ±100 km não bastava. A ampliação nunca passa de 60% do alvo do dia,
// para nenhum dia encolher a menos de 40% do alvo.
const MULTIPLOS_DA_FAIXA = [2, 3, 4];
const FRACAO_MAXIMA_AMPLIADA = 0.6;
export const MAX_ALTERNATIVAS = 3;
// Cidades de cada faixa cujo resumo é buscado (as mais perto do alvo): numa região metropolitana a
// faixa tem dezenas de municípios e a consulta ao Overpass ficaria pesada demais.
export const MAX_RESUMOS_POR_FAIXA = 10;
const PESOS = { proximidade: 0.4, hospedagens: 0.35, atracoes: 0.25 };
// Sem a contagem de hotéis (o Overpass ainda não respondeu), o porte da cidade ocupa só o lugar das
// hospedagens: cidade maior tem onde dormir; um vilarejo, quase nunca. Atrações, sem contagem, não
// somam, para uma cidade com hotéis confirmados não perder para uma maior ainda sem contagem.
const HOSPEDAGENS_PARA_NOTA_CHEIA = 20;
const ATRACOES_PARA_NOTA_CHEIA = 10;
const HABITANTES_SEM_PORTE = 5_000;
const HABITANTES_PARA_PORTE_CHEIO = 100_000;
// Trava contra laço infinito: nenhuma viagem válida chega perto disso (o limite é 21 dias).
const MAX_NOITES = 100;

export interface CandidatoDePernoite extends CidadeNaRota {
  /** null: não foi possível contar; undefined: ainda não foi buscado. */
  resumo: ResumoOsm | null | undefined;
}

export interface PernoiteEscolhido {
  cidade: CandidatoDePernoite | null;
  km: number;
  fracao: number;
  /** Km da rota onde o dia "deveria" terminar (pernoite anterior + alvo do dia). */
  kmAlvo: number;
  aDefinir: boolean;
  alternativas: CandidatoDePernoite[];
}

export interface DecisaoDeChegada {
  esticar: boolean;
  kmEsticando: number;
  kmNoDiaSeguinte: number;
}

export interface DivisaoDaPerna {
  noites: PernoiteEscolhido[];
  kmFinal: number;
  decisao: DecisaoDeChegada | null;
  avisos: string[];
  semResumo: number[];
}

export interface EntradaDaDivisao {
  totalKm: number;
  alvoKm: number;
  horasPorDia: number | null;
  perfil: PerfilDaRota;
  candidatos: CandidatoDePernoite[];
  /** noite → código IBGE da cidade que a pessoa escolheu. */
  escolhas: Map<number, number>;
  esticar?: boolean;
}

const temResumo = (c: CandidatoDePernoite): c is CandidatoDePernoite & { resumo: ResumoOsm } => !!c.resumo;

const escalaLog = (quantidade: number, cheia: number) => Math.min(1, Math.log(1 + quantidade) / Math.log(1 + cheia));

/** De 0 (até 5 mil habitantes, ou sem população conhecida) a 1 (100 mil ou mais), em escala logarítmica. */
function porteDaCidade(populacao: number | null | undefined): number {
  if (!populacao || populacao <= HABITANTES_SEM_PORTE) return 0;

  return Math.min(1, Math.log(populacao / HABITANTES_SEM_PORTE) / Math.log(HABITANTES_PARA_PORTE_CHEIO / HABITANTES_SEM_PORTE));
}

export function notaDoCandidato(c: CandidatoDePernoite, kmAlvo: number, largura: number): number {
  const proximidade = Math.max(0, 1 - Math.abs(c.km - kmAlvo) / largura);

  if (!temResumo(c)) {
    return PESOS.proximidade * proximidade + PESOS.hospedagens * porteDaCidade(c.populacao);
  }

  return (
    PESOS.proximidade * proximidade +
    PESOS.hospedagens * escalaLog(c.resumo.totalHospedagens, HOSPEDAGENS_PARA_NOTA_CHEIA) +
    PESOS.atracoes * escalaLog(c.resumo.totalAtracoes, ATRACOES_PARA_NOTA_CHEIA)
  );
}

const km = (valor: number) => Math.round(valor);

/** Larguras da busca ampliada, da menor para a maior, para a faixa e o alvo do dia. */
export function faixasAmpliadas(faixa: number, alvoDoDia: number): number[] {
  const teto = FRACAO_MAXIMA_AMPLIADA * alvoDoDia;

  return [...new Set(MULTIPLOS_DA_FAIXA.map((multiplo) => Math.min(multiplo * faixa, teto)))].filter((largura) => largura > faixa);
}

export function dividirEmDias(entrada: EntradaDaDivisao): DivisaoDaPerna {
  const { totalKm, alvoKm, horasPorDia, perfil, candidatos, escolhas } = entrada;
  const noites: PernoiteEscolhido[] = [];
  const avisos: string[] = [];
  const semResumo = new Set<number>();
  let decisao: DecisaoDeChegada | null = null;
  let pos = 0;

  const avisar = (texto: string) => {
    if (!avisos.includes(texto)) avisos.push(texto);
  };

  const naFaixa = (inicio: number, fim: number) => candidatos.filter((c) => c.km >= inicio && c.km <= fim);

  // Quem tem hospedagem conhecida, ou não tem contagem (não dá para descartar sem saber).
  const elegiveis = (lista: CandidatoDePernoite[], kmAlvo: number) => {
    // As 10 mais perto do alvo, tenham resumo ou não: assim a rodada seguinte não pede outras 10.
    [...lista]
      .sort((a, b) => Math.abs(a.km - kmAlvo) - Math.abs(b.km - kmAlvo) || a.km - b.km)
      .slice(0, MAX_RESUMOS_POR_FAIXA)
      .filter((c) => c.resumo === undefined)
      .forEach((c) => semResumo.add(c.codigoIbge));

    return lista.filter((c) => !temResumo(c) || c.resumo.totalHospedagens >= 1);
  };

  for (let noite = 1; noite <= MAX_NOITES; noite += 1) {
    const restante = totalKm - pos;
    const alvoDoDia = horasPorDia ? Math.min(alvoKm, kmApos(perfil, pos, horasPorDia * 3600) - pos) : alvoKm;

    const faixa = Math.min(FAIXA_KM, alvoDoDia * FRACAO_FAIXA);
    const ampliadas = faixasAmpliadas(faixa, alvoDoDia);
    const faixaMaxima = ampliadas.length > 0 ? ampliadas[ampliadas.length - 1] : faixa;

    if (restante <= alvoDoDia + faixa) break;

    if (restante <= alvoDoDia + faixa + FRACAO_DIA_CURTO * alvoDoDia) {
      const esticar = entrada.esticar ?? false;
      decisao = { esticar, kmEsticando: restante, kmNoDiaSeguinte: restante - alvoDoDia };

      if (esticar) break;
    }

    const kmAlvo = pos + alvoDoDia;
    let largura = faixa;
    let opcoes = elegiveis(naFaixa(kmAlvo - faixa, kmAlvo + faixa), kmAlvo);

    for (const ampliada of ampliadas) {
      if (opcoes.length > 0) break;

      largura = ampliada;
      opcoes = elegiveis(naFaixa(kmAlvo - ampliada, kmAlvo + ampliada), kmAlvo);
    }

    const ordenadas = [...opcoes].sort(
      (a, b) =>
        notaDoCandidato(b, kmAlvo, largura) - notaDoCandidato(a, kmAlvo, largura) || a.desvioKm - b.desvioKm || a.km - b.km,
    );

    if (ordenadas.length === 0) {
      // Nenhuma hospedagem nem na maior faixa ampliada: dorme "a definir" na cidade mais perto do alvo.
      const maisPerto = naFaixa(kmAlvo - faixaMaxima, kmAlvo + faixaMaxima).sort(
        (a, b) => Math.abs(a.km - kmAlvo) - Math.abs(b.km - kmAlvo) || a.km - b.km,
      )[0];

      avisar(`Não há cidade com hospedagem perto do km ${km(kmAlvo)}; o pernoite ficou a definir.`);
      noites.push(
        maisPerto
          ? { cidade: maisPerto, km: maisPerto.km, fracao: maisPerto.fracao, kmAlvo, aDefinir: true, alternativas: [] }
          : { cidade: null, km: kmAlvo, fracao: kmAlvo / totalKm, kmAlvo, aDefinir: true, alternativas: [] },
      );
      pos = noites[noites.length - 1].km;
      continue;
    }

    const pedida = escolhas.get(noite);
    let escolhida = ordenadas[0];

    if (pedida !== undefined) {
      const achada = ordenadas.find((c) => c.codigoIbge === pedida);

      if (achada) escolhida = achada;
      else avisar(`A cidade escolhida para a noite ${noite} não está mais na faixa e foi trocada.`);
    }

    // Só a noite que ficou sem a contagem de hotéis avisa (outras cidades da faixa não importam).
    if (!temResumo(escolhida)) {
      avisar(
        "Os hotéis de algumas cidades do caminho ainda estão sendo buscados; elas aparecem só pela distância. Gere de novo em instantes para ver os hotéis.",
      );
    }

    if (largura > faixa) {
      avisar(
        `Nenhuma cidade com hospedagem entre ${km(kmAlvo - faixa)} e ${km(kmAlvo + faixa)} km; ` +
          `a mais próxima é ${escolhida.cidade}, no km ${km(escolhida.km)}.`,
      );
    }

    noites.push({
      cidade: escolhida,
      km: escolhida.km,
      fracao: escolhida.fracao,
      kmAlvo,
      aDefinir: false,
      alternativas: ordenadas.filter((c) => c !== escolhida).slice(0, MAX_ALTERNATIVAS),
    });
    pos = escolhida.km;
  }

  return { noites, kmFinal: totalKm - pos, decisao, avisos, semResumo: [...semResumo] };
}
