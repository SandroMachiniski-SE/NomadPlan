import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { baixarDadosDaCidade } from "./baixarCidade";
import { importarPontosOsm } from "./importacaoOsm";
import { registrarAuditoria } from "./auditoria";
import { normalizarCidade, variantesDaCidade } from "./cidades";

// Preparação de uma cidade que ainda não tem dados: baixa os lugares do OpenStreetMap e
// grava no banco, em segundo plano. A pessoa acompanha pelo estado (consultarPreparo).
// Os preparos ficam em memória: se a API reiniciar no meio, basta pedir de novo (a
// importação não duplica nada: o que já entrou é reconhecido pelo id do OpenStreetMap).

export type EstadoDoPreparo = "preparando" | "pronta" | "erro";

export interface PreparoDeCidade {
  cidade: string;
  uf: string;
  estado: EstadoDoPreparo;
  etapa: string;
  /** Lugares encontrados no OpenStreetMap (só quando pronta). */
  pontos?: number;
  erro?: string;
  iniciadoEm: number;
  terminadoEm?: number;
}

/** Uma cidade com ao menos isto de pontos (num raio de 80 km do centro) já está pronta para uso. */
export const PONTOS_PARA_CIDADE_PRONTA = 3;
const RAIO_DA_CIDADE_METROS = 80_000;
const MAXIMO_SIMULTANEOS = 2;
const GUARDAR_RESULTADO_POR_MS = 30 * 60 * 1000;

const preparos = new Map<string, PreparoDeCidade>();

function chaveDe(cidade: string, uf: string): string {
  return `${normalizarCidade(cidade)}|${uf.toUpperCase()}`;
}

function limparAntigos(): void {
  const limite = Date.now() - GUARDAR_RESULTADO_POR_MS;

  for (const [chave, preparo] of preparos) {
    if (preparo.terminadoEm !== undefined && preparo.terminadoEm < limite) {
      preparos.delete(chave);
    }
  }
}

export function consultarPreparo(cidade: string, uf: string): PreparoDeCidade | undefined {
  limparAntigos();

  return preparos.get(chaveDe(cidade, uf));
}

/**
 * Quantos pontos publicados a cidade tem perto do centro informado (separa cidades de mesmo nome
 * em estados diferentes). Hospedagens não contam: as das cidades de pernoite da viagem de carro
 * entram no catálogo e não fazem a cidade estar "pronta" para um roteiro.
 */
export async function pontosDaCidade(cidade: string, latitude: number, longitude: number): Promise<number> {
  const nomes = await variantesDaCidade(cidade);

  if (nomes.length === 0) {
    return 0;
  }

  const [{ total }] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total
    FROM ponto_turistico p
    WHERE p.status = 'PUBLICADO'
      AND p.categoria <> 'Hospedagem'
      AND p.cidade IN (${Prisma.join(nomes)})
      AND p.geom IS NOT NULL
      AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${RAIO_DA_CIDADE_METROS})
  `);

  return Number(total);
}

// O Overpass público recusa (429) ou cai (502/503/504) quando está cheio: são falhas passageiras.
const ehFalhaPassageira = (erro: unknown) =>
  /\b(429|504|502|503)\b|timeout|aborted|fetch failed/i.test(erro instanceof Error ? erro.message : String(erro));

function mensagemDoErro(erro: unknown): string {
  if (ehFalhaPassageira(erro)) {
    return "O servidor de mapas está ocupado ou demorou a responder. Tente novamente em alguns minutos.";
  }

  return "Não foi possível preparar esta cidade agora. Tente novamente mais tarde.";
}

const TENTATIVAS_DO_PREPARO = 3;
// Pausa antes de tentar de novo depois de uma falha passageira (os testes usam uma curta).
const pausaDaNovaTentativaMs = () => Number(process.env.PREPARO_NOVA_TENTATIVA_MS) || 2 * 60 * 1000;

/**
 * Baixa os lugares da cidade (Overpass, com fotos e descrições do Wikidata e do Commons) e grava no
 * banco. null quando o OpenStreetMap não tem nenhum lugar ali; erro quando o servidor falha.
 */
export async function baixarEImportarCidade(
  cidade: string,
  uf: string,
  aoGravar?: () => void,
): Promise<{ pontosNoArquivo: number; resumo: Awaited<ReturnType<typeof importarPontosOsm>> } | null> {
  const baixada = await baixarDadosDaCidade(cidade, uf);

  if (!baixada) return null;

  aoGravar?.();

  return { pontosNoArquivo: baixada.dados.pontos.length, resumo: await importarPontosOsm(baixada.dados.pontos) };
}

/** Baixa e grava; com o servidor de mapas ocupado, tenta de novo sozinho depois de uma pausa. */
async function baixarComNovasTentativas(preparo: PreparoDeCidade) {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      preparo.etapa = "Baixando os lugares do OpenStreetMap (pode levar até 1 minuto)...";

      return await baixarEImportarCidade(preparo.cidade, preparo.uf, () => {
        preparo.etapa = "Gravando os lugares no banco...";
      });
    } catch (erro) {
      if (!ehFalhaPassageira(erro) || tentativa >= TENTATIVAS_DO_PREPARO) throw erro;

      const pausa = pausaDaNovaTentativaMs();

      console.error(`Preparo de ${preparo.cidade}/${preparo.uf}, tentativa ${tentativa}:`, erro instanceof Error ? erro.message : erro);
      preparo.etapa =
        `O servidor de mapas está ocupado; tentando de novo em ${Math.max(1, Math.round(pausa / 60_000))} min ` +
        `(tentativa ${tentativa + 1} de ${TENTATIVAS_DO_PREPARO})...`;
      await new Promise((resolver) => setTimeout(resolver, pausa));
    }
  }
}

async function executar(preparo: PreparoDeCidade, idUsuario: number): Promise<void> {
  try {
    const importada = await baixarComNovasTentativas(preparo);

    if (!importada) {
      preparo.estado = "erro";
      preparo.erro = `O OpenStreetMap não tem lugares cadastrados para ${preparo.cidade}/${preparo.uf}.`;

      return;
    }

    await registrarAuditoria({
      idUsuario,
      acao: "preparar_cidade",
      entidade: "ponto_turistico",
      detalhes: { cidade: preparo.cidade, uf: preparo.uf, pontosNoArquivo: importada.pontosNoArquivo, ...importada.resumo },
    });

    preparo.pontos = importada.pontosNoArquivo;
    preparo.estado = "pronta";
    preparo.etapa = "Pronta.";
  } catch (erro) {
    console.error(`Erro ao preparar ${preparo.cidade}/${preparo.uf}:`, erro);

    preparo.estado = "erro";
    preparo.erro = mensagemDoErro(erro);
  } finally {
    preparo.terminadoEm = Date.now();
  }
}

export type ResultadoDoPedido =
  | { situacao: "pronta"; pontos: number }
  | { situacao: "preparando"; preparo: PreparoDeCidade }
  | { situacao: "ocupado" };

/**
 * Pede a preparação de uma cidade. Se ela já tem dados, não baixa nada; se já está sendo
 * preparada, devolve o preparo em andamento; se o servidor já está com preparos demais, recusa.
 */
export async function prepararCidade(
  cidade: string,
  uf: string,
  latitude: number,
  longitude: number,
  idUsuario: number,
  /** Quem acabou de contar os pontos da cidade passa o número, para não contar de novo. */
  jaContados?: number,
): Promise<ResultadoDoPedido> {
  limparAntigos();

  const existentes = jaContados ?? (await pontosDaCidade(cidade, latitude, longitude));

  if (existentes >= PONTOS_PARA_CIDADE_PRONTA) {
    return { situacao: "pronta", pontos: existentes };
  }

  const chave = chaveDe(cidade, uf);
  const atual = preparos.get(chave);

  if (atual?.estado === "preparando") {
    return { situacao: "preparando", preparo: atual };
  }

  const emAndamento = [...preparos.values()].filter((p) => p.estado === "preparando").length;

  if (emAndamento >= MAXIMO_SIMULTANEOS) {
    return { situacao: "ocupado" };
  }

  const preparo: PreparoDeCidade = {
    cidade,
    uf: uf.toUpperCase(),
    estado: "preparando",
    etapa: "Na fila...",
    iniciadoEm: Date.now(),
  };

  preparos.set(chave, preparo);
  void executar(preparo, idUsuario);

  return { situacao: "preparando", preparo };
}
