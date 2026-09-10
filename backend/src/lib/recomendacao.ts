import { StatusPonto } from "@prisma/client";
import prisma from "./prisma";
import { distanciaMetros } from "./geo";
import { estaAbertoNoHorario } from "./horarios";

const DURACAO_MEDIA_VISITA_HORAS = 1.5;
const MAX_PONTOS_ROTEIRO = 10;

export interface ParametrosRecomendacao {
  cidade: string;
  horasDisponiveis: number;
  interesses: string[];
  dataHoraInicio: Date;
  latitude?: number;
  longitude?: number;
}

export interface PontoRecomendado {
  id: number;
  nome: string;
  categoria: string;
  cidade: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  faixaPreco: string | null;
  acessibilidade: string | null;
  horarioFuncionamento: string | null;
  imagemUrl: string | null;
  seloVerificado: boolean;
  distanciaMetros: number | null;
  ordem: number;
}

export interface ResultadoRecomendacao {
  pontos: PontoRecomendado[];
  fallbackUsado: boolean;
}

function calcularMaxPontos(horasDisponiveis: number): number {
  const quantidade = Math.floor(horasDisponiveis / DURACAO_MEDIA_VISITA_HORAS);
  return Math.min(Math.max(quantidade, 1), MAX_PONTOS_ROTEIRO);
}

async function buscarCandidatos(cidade: string) {
  return prisma.pontoTuristico.findMany({
    where: {
      cidade: { equals: cidade, mode: "insensitive" },
      status: StatusPonto.PUBLICADO,
    },
    select: {
      id: true,
      nome: true,
      categoria: true,
      cidade: true,
      endereco: true,
      latitude: true,
      longitude: true,
      faixaPreco: true,
      acessibilidade: true,
      horarioFuncionamento: true,
      imagemUrl: true,
      seloVerificado: true,
    },
  });
}

function calcularCentroide(pontos: { latitude: number | null; longitude: number | null }[]) {
  const comCoordenadas = pontos.filter(
    (p): p is { latitude: number; longitude: number } => p.latitude !== null && p.longitude !== null,
  );

  if (comCoordenadas.length === 0) {
    return null;
  }

  const soma = comCoordenadas.reduce(
    (acc, p) => ({ lat: acc.lat + p.latitude, lng: acc.lng + p.longitude }),
    { lat: 0, lng: 0 },
  );

  return { latitude: soma.lat / comCoordenadas.length, longitude: soma.lng / comCoordenadas.length };
}

/**
 * Motor de recomendação regra-based (RF12, RF25): não é machine learning — o próprio
 * RFC (seção 6.6) define o motor como "solução híbrida simples (regras + algoritmos
 * leves)", adequada ao escopo acadêmico. Prioriza pontos que combinam com os
 * interesses do usuário, ordena por proximidade e respeita o horário de
 * funcionamento (RB07) simulando os horários de visita ao longo do dia.
 */
async function gerarComRegras(params: ParametrosRecomendacao): Promise<PontoRecomendado[]> {
  const candidatos = await buscarCandidatos(params.cidade);
  const maxPontos = calcularMaxPontos(params.horasDisponiveis);

  const origem =
    params.latitude !== undefined && params.longitude !== undefined
      ? { latitude: params.latitude, longitude: params.longitude }
      : calcularCentroide(candidatos);

  const interessesNormalizados = params.interesses.map((i) => i.trim().toLowerCase());

  const candidatosPontuados = candidatos.map((candidato) => {
    const combinaComInteresse = interessesNormalizados.includes(candidato.categoria.toLowerCase());

    const distancia =
      origem && candidato.latitude !== null && candidato.longitude !== null
        ? distanciaMetros(origem.latitude, origem.longitude, candidato.latitude, candidato.longitude)
        : null;

    return { candidato, combinaComInteresse, distancia };
  });

  candidatosPontuados.sort((a, b) => {
    if (a.combinaComInteresse !== b.combinaComInteresse) {
      return a.combinaComInteresse ? -1 : 1;
    }

    if (a.distancia === null) return 1;
    if (b.distancia === null) return -1;
    return a.distancia - b.distancia;
  });

  const selecionados: PontoRecomendado[] = [];
  let horarioSimulado = new Date(params.dataHoraInicio);

  for (const item of candidatosPontuados) {
    if (selecionados.length >= maxPontos) break;

    if (!estaAbertoNoHorario(item.candidato.horarioFuncionamento, horarioSimulado)) {
      continue;
    }

    selecionados.push({
      ...item.candidato,
      distanciaMetros: item.distancia,
      ordem: selecionados.length,
    });

    horarioSimulado = new Date(horarioSimulado.getTime() + DURACAO_MEDIA_VISITA_HORAS * 60 * 60 * 1000);
  }

  return selecionados;
}

/**
 * Fallback (AF06 do RFC): se o motor de regras falhar por qualquer motivo, cai para
 * uma heurística simples de "top N por proximidade", ignorando interesses e horário
 * — melhor entregar algo útil do que nenhuma resposta.
 */
async function gerarPorProximidade(params: ParametrosRecomendacao): Promise<PontoRecomendado[]> {
  const candidatos = await buscarCandidatos(params.cidade);
  const maxPontos = calcularMaxPontos(params.horasDisponiveis);

  const origem =
    params.latitude !== undefined && params.longitude !== undefined
      ? { latitude: params.latitude, longitude: params.longitude }
      : calcularCentroide(candidatos);

  const comDistancia = candidatos.map((candidato) => ({
    candidato,
    distancia:
      origem && candidato.latitude !== null && candidato.longitude !== null
        ? distanciaMetros(origem.latitude, origem.longitude, candidato.latitude, candidato.longitude)
        : null,
  }));

  comDistancia.sort((a, b) => {
    if (a.distancia === null) return 1;
    if (b.distancia === null) return -1;
    return a.distancia - b.distancia;
  });

  return comDistancia.slice(0, maxPontos).map((item, indice) => ({
    ...item.candidato,
    distanciaMetros: item.distancia,
    ordem: indice,
  }));
}

export async function gerarRoteiroSugerido(
  params: ParametrosRecomendacao,
): Promise<ResultadoRecomendacao> {
  try {
    const pontos = await gerarComRegras(params);
    return { pontos, fallbackUsado: false };
  } catch (erro) {
    console.error("Motor de recomendação falhou, aplicando fallback por proximidade:", erro);
    const pontos = await gerarPorProximidade(params);
    return { pontos, fallbackUsado: true };
  }
}
