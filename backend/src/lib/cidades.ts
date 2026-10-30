import { StatusPonto } from "@prisma/client";
import prisma from "./prisma";

// A cidade é texto livre nos pontos e no perfil ("Florianópolis"), e as pessoas digitam
// "florianopolis", "Joinville, SC" ou "Blumenau - SC". Para buscar e gerar roteiros, o texto
// digitado é comparado sem acentos, sem maiúsculas e sem a UF com as cidades que têm pontos.

const SUFIXO_PAIS = /\s*[,\-/–]\s*brasil$/;
const SUFIXO_UF = /\s*(?:[,\-/–]\s*|\(\s*|\s+)(?:[a-z]{2}|santa catarina)\s*\)?$/;

export function normalizarCidade(texto: string): string {
  const simples = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SUFIXO_PAIS, "");

  // Só tira a UF quando sobra um nome: "Ilha (SC)" vira "ilha", mas "Ita" continua "ita".
  const semUf = simples.replace(SUFIXO_UF, "");

  return semUf.length >= 3 ? semUf : simples;
}

// No empate entre variações, "Florianópolis" ganha de "florianopolis".
function formalidade(nome: string): number {
  const comMaiuscula = nome.charAt(0) !== nome.charAt(0).toLowerCase() ? 2 : 0;
  const comAcento = nome !== nome.normalize("NFD").replace(/[̀-ͯ]/g, "") ? 1 : 0;

  return comMaiuscula + comAcento;
}

export interface CidadeComPontos {
  cidade: string;
  pontos: number;
}

/** Cidades que têm pontos publicados, com a quantidade de pontos de cada uma. */
export async function cidadesComPontos(): Promise<CidadeComPontos[]> {
  const grupos = await prisma.pontoTuristico.groupBy({
    by: ["cidade"],
    where: { status: StatusPonto.PUBLICADO },
    _count: { _all: true },
  });

  // Variações da mesma cidade ("Joinville" e "joinville") aparecem uma vez só, com o nome mais usado.
  const porNome = new Map<string, { cidade: string; pontos: number; maior: number }>();

  for (const grupo of grupos) {
    const chave = normalizarCidade(grupo.cidade);
    const atual = porNome.get(chave);
    const quantidade = grupo._count._all;

    if (!atual) {
      porNome.set(chave, { cidade: grupo.cidade, pontos: quantidade, maior: quantidade });
    } else {
      atual.pontos += quantidade;
      if (quantidade > atual.maior || (quantidade === atual.maior && formalidade(grupo.cidade) > formalidade(atual.cidade))) {
        atual.cidade = grupo.cidade;
        atual.maior = quantidade;
      }
    }
  }

  return [...porNome.values()]
    .map(({ cidade, pontos }) => ({ cidade, pontos }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));
}

/**
 * Todos os nomes gravados que correspondem à cidade digitada (pode haver "Joinville" e
 * "joinville" no banco). Lista vazia quando não há nenhum ponto publicado nessa cidade.
 */
export async function variantesDaCidade(texto: string): Promise<string[]> {
  const alvo = normalizarCidade(texto);

  if (!alvo) {
    return [];
  }

  const grupos = await prisma.pontoTuristico.groupBy({
    by: ["cidade"],
    where: { status: StatusPonto.PUBLICADO },
  });

  return grupos.map((g) => g.cidade).filter((cidade) => normalizarCidade(cidade) === alvo);
}
