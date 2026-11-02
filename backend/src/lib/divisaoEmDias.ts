import type { CidadeNaRota } from "./corredor";
import type { ResumoOsm } from "./resumoOsm";
import { kmApos, type PerfilDaRota } from "./rotas";

// Divide uma perna da viagem de carro em dias. Cada dia termina perto do alvo de km (ou de
// horas ao volante, o que vier primeiro), numa cidade da faixa alvo ± 50 km contada a partir do
// pernoite anterior. Entre as cidades da faixa, a nota pesa proximidade do alvo, quantidade de
// hospedagens e de atrações. Quando o fim da perna está "perto" (até um dia curto além da faixa),
// a pessoa decide entre esticar e chegar ou dormir antes; o padrão é esticar.

export const FAIXA_KM = 50;
export const FAIXA_ALARGADA_KM = 100;
export const FRACAO_DIA_CURTO = 0.3;
export const MAX_ALTERNATIVAS = 3;
// Cidades de cada faixa cujo resumo é buscado (as mais perto do alvo): numa região metropolitana a
// faixa tem dezenas de municípios e a consulta ao Overpass ficaria pesada demais.
export const MAX_RESUMOS_POR_FAIXA = 10;
const PESOS = { proximidade: 0.4, hospedagens: 0.35, atracoes: 0.25 };
const HOSPEDAGENS_PARA_NOTA_CHEIA = 20;
const ATRACOES_PARA_NOTA_CHEIA = 10;
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

export function notaDoCandidato(c: CandidatoDePernoite, kmAlvo: number, largura: number): number {
  const proximidade = Math.max(0, 1 - Math.abs(c.km - kmAlvo) / largura);

  if (!temResumo(c)) {
    return PESOS.proximidade * proximidade;
  }

  return (
    PESOS.proximidade * proximidade +
    PESOS.hospedagens * escalaLog(c.resumo.totalHospedagens, HOSPEDAGENS_PARA_NOTA_CHEIA) +
    PESOS.atracoes * escalaLog(c.resumo.totalAtracoes, ATRACOES_PARA_NOTA_CHEIA)
  );
}

const km = (valor: number) => Math.round(valor);

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
    lista
      .filter((c) => c.resumo === undefined)
      .sort((a, b) => Math.abs(a.km - kmAlvo) - Math.abs(b.km - kmAlvo) || a.km - b.km)
      .slice(0, MAX_RESUMOS_POR_FAIXA)
      .forEach((c) => semResumo.add(c.codigoIbge));

    if (lista.some((c) => !temResumo(c))) {
      avisar("Não foi possível contar os hotéis agora; as cidades estão só pela distância.");
    }

    return lista.filter((c) => !temResumo(c) || c.resumo.totalHospedagens >= 1);
  };

  for (let noite = 1; noite <= MAX_NOITES; noite += 1) {
    const restante = totalKm - pos;
    const alvoDoDia = horasPorDia ? Math.min(alvoKm, kmApos(perfil, pos, horasPorDia * 3600) - pos) : alvoKm;

    if (restante <= alvoDoDia + FAIXA_KM) break;

    if (restante <= alvoDoDia + FAIXA_KM + FRACAO_DIA_CURTO * alvoDoDia) {
      const esticar = entrada.esticar ?? true;
      decisao = { esticar, kmEsticando: restante, kmNoDiaSeguinte: restante - alvoDoDia };

      if (esticar) break;
    }

    const kmAlvo = pos + alvoDoDia;
    let largura = FAIXA_KM;
    let opcoes = elegiveis(naFaixa(kmAlvo - FAIXA_KM, kmAlvo + FAIXA_KM), kmAlvo);

    if (opcoes.length === 0) {
      largura = FAIXA_ALARGADA_KM;
      opcoes = elegiveis(naFaixa(kmAlvo - FAIXA_ALARGADA_KM, kmAlvo + FAIXA_ALARGADA_KM), kmAlvo);
    }

    const ordenadas = [...opcoes].sort(
      (a, b) =>
        notaDoCandidato(b, kmAlvo, largura) - notaDoCandidato(a, kmAlvo, largura) || a.desvioKm - b.desvioKm || a.km - b.km,
    );

    if (ordenadas.length === 0) {
      // Nenhuma hospedagem nem na faixa alargada: dorme "a definir" na cidade mais perto do alvo.
      const maisPerto = naFaixa(kmAlvo - FAIXA_ALARGADA_KM, kmAlvo + FAIXA_ALARGADA_KM).sort(
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

    if (largura === FAIXA_ALARGADA_KM) {
      avisar(
        `Nenhuma cidade com hospedagem entre ${km(kmAlvo - FAIXA_KM)} e ${km(kmAlvo + FAIXA_KM)} km; ` +
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
