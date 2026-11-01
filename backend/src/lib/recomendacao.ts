import { StatusPonto } from "@prisma/client";
import prisma from "./prisma";
import { distanciaMetros } from "./geo";
import { estaAbertoNoHorario } from "./horarios";
import { preferenciasAtendidas } from "./preferencias";
import { cidadesComPontos, normalizarCidade, variantesDaCidade } from "./cidades";
import { chaveGoogle, detalhesDoGoogle, idGoogleDoPonto } from "./googlePlaces";
import { minutosEstimados, minutosParaPercorrer } from "./trajeto";

export const DURACAO_VISITA_MIN = 90;
const DESLOCAMENTO_SEM_COORDENADAS_MIN = 15;
const MAX_PONTOS_ROTEIRO = 10;
// Se o ponto abre em até 1 h depois da chegada, o passeio espera a abertura em vez de descartá-lo.
const MAX_ESPERA_MIN = 60;
const PASSO_ESPERA_MIN = 15;
// Para valer a visita, o ponto precisa continuar aberto por pelo menos 1 h depois da chegada.
const ABERTO_APOS_CHEGADA_MIN = 60;
// Meia hora de deslocamento "custa" um ponto de pontuação: um ponto que combina com o
// interesse do usuário (+3) vale uma viagem de até 1h30 a mais.
const MINUTOS_POR_PONTO_DE_SCORE = 30;
// Cada parada já escolhida da mesma categoria tira 1,5 ponto: cinco restaurantes seguidos
// combinam com o interesse "Gastronomia", mas não fazem um bom passeio.
const PENALIDADE_CATEGORIA_REPETIDA = 1.5;
// Quem pede o roteiro de outra cidade (de casa, da faculdade) não deve gastar o passeio inteiro
// na estrada: além dessa distância do centro dos pontos, a localização é ignorada.
const DISTANCIA_MAXIMA_DA_LOCALIZACAO_M = 30_000;

export interface CandidatoRoteiro {
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
  imagemCredito: string | null;
  seloVerificado: boolean;
  mediaAvaliacao: number | null;
  /** Só para consultar o Google; não volta na resposta. */
  idGoogle?: string | null;
  googleBuscadoEm?: Date | null;
  /** O horário foi consultado agora no Google Maps (não está no cadastro). */
  horarioDoGoogle?: boolean;
}

export interface ParametrosRecomendacao {
  cidade: string;
  horasDisponiveis: number;
  interesses: string[];
  preferenciasAcessibilidade?: string[];
  dataHoraInicio: Date;
  latitude?: number;
  longitude?: number;
}

export interface PontoRecomendado extends Omit<CandidatoRoteiro, "mediaAvaliacao" | "idGoogle" | "googleBuscadoEm"> {
  distanciaMetros: number | null;
  ordem: number;
  chegadaEstimada: string;
  saidaEstimada: string;
  deslocamentoMin: number;
  esperaMin: number;
  duracaoVisitaMin: number;
}

/** Uma parte da viagem: a cidade e quantos dias passar nela ("Joinville, 2 dias"). */
export interface EtapaDoRoteiro {
  cidade: string;
  dias: number;
}

export interface DiaDoRoteiroGerado {
  dia: number;
  cidade: string;
  /** Hora em que o passeio do dia começa (depois da viagem, se houver). */
  inicio: string;
  /** Estrada desde a cidade do dia anterior, quando ela muda. */
  viagem: { de: string; metros: number; minutos: number } | null;
}

export type PontoDoRoteiroGerado = PontoRecomendado & { dia: number };

export interface ResultadoRecomendacao {
  pontos: PontoDoRoteiroGerado[];
  avisos: string[];
  inicio: string;
  fallbackUsado: boolean;
  dias: DiaDoRoteiroGerado[];
}

export const MAX_DIAS_GERADOS = 14;
// Dia de viagem que deixa menos que isso livre fica só com a estrada.
const HORAS_MINIMAS_PARA_PASSEIO = DURACAO_VISITA_MIN / 60;

export function calcularMaxPontos(horasDisponiveis: number): number {
  const quantidade = Math.floor((horasDisponiveis * 60) / DURACAO_VISITA_MIN);
  return Math.min(Math.max(quantidade, 1), MAX_PONTOS_ROTEIRO);
}

/**
 * Início padrão do passeio quando o usuário não informa: agora, se ainda sobra boa parte do
 * horário comercial (9h às 17h); às 9h de hoje, se for cedo; às 9h de amanhã, se já passou
 * das 17h (senão quase tudo estaria "fechado" e o roteiro sairia vazio).
 */
export function inicioPadrao(agora: Date): Date {
  const hora = agora.getHours() + agora.getMinutes() / 60;

  if (hora >= 9 && hora < 17) {
    return new Date(agora);
  }

  const inicio = new Date(agora);
  inicio.setHours(9, 0, 0, 0);

  if (hora >= 17) {
    inicio.setDate(inicio.getDate() + 1);
  }

  return inicio;
}

function formatarHora(data: Date): string {
  return `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
}

/** Aberto na chegada e ainda aberto 1 h depois (a visita precisa caber no horário). */
function abertoParaVisita(horario: string | null, chegada: Date): boolean {
  return (
    estaAbertoNoHorario(horario, chegada) &&
    estaAbertoNoHorario(horario, new Date(chegada.getTime() + ABERTO_APOS_CHEGADA_MIN * 60_000))
  );
}

/** Primeiro horário (em passos de 15 min, até maxEsperaMin) em que o ponto estará aberto para a visita. */
function proximaAbertura(horario: string | null, desde: Date, maxEsperaMin: number): Date | null {
  for (let minutos = PASSO_ESPERA_MIN; minutos <= maxEsperaMin; minutos += PASSO_ESPERA_MIN) {
    const candidata = new Date(desde.getTime() + minutos * 60_000);

    if (abertoParaVisita(horario, candidata)) {
      return candidata;
    }
  }

  return null;
}

function minutosDeViagem(metros: number | null): number {
  if (metros === null) {
    return DESLOCAMENTO_SEM_COORDENADAS_MIN;
  }

  return Math.round(minutosEstimados(metros));
}

export function pontuarCandidato(
  candidato: CandidatoRoteiro,
  interesses: string[],
  preferenciasAcessibilidade: string[],
): number {
  let pontos = 0;

  if (interesses.some((interesse) => interesse.trim().toLowerCase() === candidato.categoria.toLowerCase())) {
    pontos += 3;
  }

  pontos += preferenciasAtendidas(candidato.acessibilidade, preferenciasAcessibilidade);

  if (candidato.seloVerificado) pontos += 0.5;
  if (candidato.mediaAvaliacao !== null && candidato.mediaAvaliacao >= 4) pontos += 0.5;

  return pontos;
}

/**
 * Na base aberta do OpenStreetMap, a maioria dos lugares ainda não tem foto nem horário.
 * Entre opções equivalentes, o roteiro prefere as de cadastro mais completo: a pessoa
 * consegue conferir o lugar antes de ir, e o horário conhecido evita chegar com ele fechado.
 */
export function bonusDeCadastro(candidato: Pick<CandidatoRoteiro, "imagemUrl" | "horarioFuncionamento">): number {
  return (candidato.imagemUrl ? 0.5 : 0) + (candidato.horarioFuncionamento?.trim() ? 0.5 : 0);
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

type Coordenada = { latitude: number; longitude: number };

function distanciaEntre(a: Coordenada | null, b: CandidatoRoteiro): number | null {
  if (!a || b.latitude === null || b.longitude === null) {
    return null;
  }

  return distanciaMetros(a.latitude, a.longitude, b.latitude, b.longitude);
}

/**
 * Monta o roteiro (parte pura, sem banco). A cada passo escolhe, entre os pontos ainda
 * não visitados que estarão ABERTOS na hora estimada de chegada e que cabem no tempo
 * disponível, o de melhor "pontuação menos deslocamento". Assim a ordem final já é um
 * trajeto razoável (vizinho mais próximo ponderado por interesse), e cada parada recebe
 * horário estimado de chegada e saída (RF12, RF25, RB07).
 */
export function planejarRoteiro(
  candidatos: CandidatoRoteiro[],
  params: ParametrosRecomendacao,
): { pontos: PontoRecomendado[]; avisos: string[]; fechados: { id: number; texto: string; pontuacao: number }[] } {
  const maxPontos = calcularMaxPontos(params.horasDisponiveis);
  const preferencias = params.preferenciasAcessibilidade ?? [];
  const fimDoPasseio = new Date(params.dataHoraInicio.getTime() + params.horasDisponiveis * 3_600_000);

  let posicao: Coordenada | null =
    params.latitude !== undefined && params.longitude !== undefined
      ? { latitude: params.latitude, longitude: params.longitude }
      : calcularCentroide(candidatos);

  const restantes = candidatos.map((candidato) => ({
    candidato,
    pontuacao: pontuarCandidato(candidato, params.interesses, preferencias) + bonusDeCadastro(candidato),
  }));

  const escolhidos: PontoRecomendado[] = [];
  const fechados = new Map<number, { texto: string; pontuacao: number }>();
  const porCategoria = new Map<string, number>();
  let relogio = new Date(params.dataHoraInicio);

  while (escolhidos.length < maxPontos && restantes.length > 0) {
    let melhor: {
      indice: number;
      valor: number;
      metros: number | null;
      deslocamento: number;
      espera: number;
      chegada: Date;
    } | null = null;

    for (let indice = 0; indice < restantes.length; indice += 1) {
      const { candidato, pontuacao } = restantes[indice];
      const metros = distanciaEntre(posicao, candidato);
      const deslocamento = escolhidos.length === 0 && !params.latitude ? 0 : minutosDeViagem(metros);
      let chegada = new Date(relogio.getTime() + deslocamento * 60_000);
      let espera = 0;

      if (!abertoParaVisita(candidato.horarioFuncionamento, chegada)) {
        const abertura = proximaAbertura(candidato.horarioFuncionamento, chegada, MAX_ESPERA_MIN);

        if (!abertura) {
          if (!fechados.has(candidato.id)) {
            fechados.set(candidato.id, {
              texto: `${candidato.nome}: estaria fechado às ${formatarHora(chegada)} (horário: ${candidato.horarioFuncionamento}).`,
              pontuacao,
            });
          }
          continue;
        }

        espera = Math.round((abertura.getTime() - chegada.getTime()) / 60_000);
        chegada = abertura;
      }

      const saida = new Date(chegada.getTime() + DURACAO_VISITA_MIN * 60_000);

      if (saida > fimDoPasseio) {
        continue;
      }

      const repetidas = porCategoria.get(candidato.categoria.toLowerCase()) ?? 0;
      const valor =
        pontuacao - repetidas * PENALIDADE_CATEGORIA_REPETIDA - (deslocamento + espera) / MINUTOS_POR_PONTO_DE_SCORE;

      if (!melhor || valor > melhor.valor) {
        melhor = { indice, valor, metros, deslocamento, espera, chegada };
      }
    }

    if (!melhor) {
      break;
    }

    const [{ candidato }] = restantes.splice(melhor.indice, 1);
    const saida = new Date(melhor.chegada.getTime() + DURACAO_VISITA_MIN * 60_000);
    const { mediaAvaliacao: _media, idGoogle: _idGoogle, googleBuscadoEm: _buscadoEm, ...dadosDoPonto } = candidato;

    escolhidos.push({
      ...dadosDoPonto,
      distanciaMetros: melhor.metros,
      ordem: escolhidos.length,
      chegadaEstimada: melhor.chegada.toISOString(),
      saidaEstimada: saida.toISOString(),
      deslocamentoMin: melhor.deslocamento,
      esperaMin: melhor.espera,
      duracaoVisitaMin: DURACAO_VISITA_MIN,
    });

    relogio = saida;
    porCategoria.set(candidato.categoria.toLowerCase(), (porCategoria.get(candidato.categoria.toLowerCase()) ?? 0) + 1);

    if (candidato.latitude !== null && candidato.longitude !== null) {
      posicao = { latitude: candidato.latitude, longitude: candidato.longitude };
    }
  }

  // RB07: pontos que ficaram de fora por estarem fechados na hora prevista viram aviso,
  // com a justificativa, em vez de sumirem sem explicação. Vêm primeiro os que mais
  // combinavam com a pessoa (numa cidade grande, dezenas de bares estão fechados de manhã).
  const idsEscolhidos = new Set(escolhidos.map((p) => p.id));
  const naoEscolhidos = [...fechados]
    .filter(([id]) => !idsEscolhidos.has(id))
    .map(([id, aviso]) => ({ id, ...aviso }))
    .sort((a, b) => b.pontuacao - a.pontuacao);

  return { pontos: escolhidos, avisos: naoEscolhidos.slice(0, 5).map((f) => f.texto), fechados: naoEscolhidos };
}

async function buscarCandidatos(cidades: string[]): Promise<CandidatoRoteiro[]> {
  const pontos = await prisma.pontoTuristico.findMany({
    where: {
      cidade: { in: cidades },
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
      imagemCredito: true,
      seloVerificado: true,
      idGoogle: true,
      googleBuscadoEm: true,
    },
  });

  if (pontos.length === 0) {
    return [];
  }

  const medias = await prisma.avaliacao.groupBy({
    by: ["idPonto"],
    where: { idPonto: { in: pontos.map((p) => p.id) }, status: "APROVADA" },
    _avg: { nota: true },
  });

  const mediaPorPonto = new Map(medias.map((m) => [m.idPonto, m._avg.nota]));

  return pontos.map((ponto) => ({ ...ponto, mediaAvaliacao: mediaPorPonto.get(ponto.id) ?? null }));
}

/**
 * Fallback (AF06 do RFC): se o motor de regras falhar por qualquer motivo, cai para
 * uma heurística simples de "top N por proximidade", ignorando interesses e horário
 * — melhor entregar algo útil do que nenhuma resposta.
 */
export function planejarPorProximidade(
  candidatos: CandidatoRoteiro[],
  params: ParametrosRecomendacao,
): PontoRecomendado[] {
  const maxPontos = calcularMaxPontos(params.horasDisponiveis);

  const origem: Coordenada | null =
    params.latitude !== undefined && params.longitude !== undefined
      ? { latitude: params.latitude, longitude: params.longitude }
      : calcularCentroide(candidatos);

  const comDistancia = candidatos.map((candidato) => ({
    candidato,
    distancia: distanciaEntre(origem, candidato),
  }));

  comDistancia.sort((a, b) => {
    if (a.distancia === null) return 1;
    if (b.distancia === null) return -1;
    return a.distancia - b.distancia;
  });

  let relogio = new Date(params.dataHoraInicio);

  return comDistancia.slice(0, maxPontos).map((item, indice) => {
    const deslocamento = indice === 0 ? 0 : DESLOCAMENTO_SEM_COORDENADAS_MIN;
    const chegada = new Date(relogio.getTime() + deslocamento * 60_000);
    const saida = new Date(chegada.getTime() + DURACAO_VISITA_MIN * 60_000);
    relogio = saida;

    const { mediaAvaliacao: _media, ...dadosDoPonto } = item.candidato;

    return {
      ...dadosDoPonto,
      distanciaMetros: item.distancia,
      ordem: indice,
      chegadaEstimada: chegada.toISOString(),
      saidaEstimada: saida.toISOString(),
      deslocamentoMin: deslocamento,
      esperaMin: 0,
      duracaoVisitaMin: DURACAO_VISITA_MIN,
    };
  });
}

/**
 * Com a chave do Google configurada, consulta agora o horário dos pontos mais relevantes que não
 * têm horário no cadastro, para o roteiro não contar com um lugar fechado. O horário vale só para
 * este roteiro: não é gravado (termos do Google). Devolve quantos pontos ganharam horário.
 */
export async function completarHorariosPeloGoogle(
  candidatos: CandidatoRoteiro[],
  params: ParametrosRecomendacao,
): Promise<number> {
  if (!chaveGoogle()) {
    return 0;
  }

  const limite = Number(process.env.GOOGLE_PONTOS_POR_ROTEIRO ?? 8);
  const preferencias = params.preferenciasAcessibilidade ?? [];
  const escolhidos = candidatos
    .filter((c) => !c.horarioFuncionamento?.trim())
    .map((c) => ({ c, pontuacao: pontuarCandidato(c, params.interesses, preferencias) + bonusDeCadastro(c) }))
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, limite);

  const completados = await Promise.all(
    escolhidos.map(async ({ c }) => {
      const idGoogle = await idGoogleDoPonto({ ...c, idGoogle: c.idGoogle ?? null, googleBuscadoEm: c.googleBuscadoEm ?? null });
      const horario = idGoogle ? (await detalhesDoGoogle(idGoogle))?.horario : null;

      if (!horario) return false;

      c.horarioFuncionamento = horario;
      c.horarioDoGoogle = true;
      return true;
    }),
  );

  return completados.filter(Boolean).length;
}

/** Ignora a localização de quem está longe da cidade do roteiro (e avisa por quê). */
export function ajustarLocalizacao(
  candidatos: CandidatoRoteiro[],
  params: ParametrosRecomendacao,
): { parametros: ParametrosRecomendacao; aviso: string | null } {
  const centro = calcularCentroide(candidatos);

  if (params.latitude === undefined || params.longitude === undefined || !centro) {
    return { parametros: params, aviso: null };
  }

  const metros = distanciaMetros(params.latitude, params.longitude, centro.latitude, centro.longitude);

  if (metros <= DISTANCIA_MAXIMA_DA_LOCALIZACAO_M) {
    return { parametros: params, aviso: null };
  }

  const { latitude: _latitude, longitude: _longitude, ...semLocalizacao } = params;

  return {
    parametros: semLocalizacao,
    aviso: `Você está a cerca de ${Math.round(metros / 1000)} km de ${params.cidade}: o roteiro começa pelo centro da cidade, sem contar a viagem até lá.`,
  };
}

/**
 * Gera o roteiro, de uma cidade ou de várias ("Joinville, 2 dias → Blumenau, 1 dia"). Cada dia é
 * planejado na sua cidade, sem repetir pontos entre os dias. No dia em que a cidade muda, o
 * passeio começa depois da viagem (estimada pela estrada desde a última parada do dia anterior),
 * e o tempo de estrada sai das horas do dia.
 */
export async function gerarRoteiroSugerido(
  params: ParametrosRecomendacao & { etapas?: EtapaDoRoteiro[] },
): Promise<ResultadoRecomendacao> {
  const inicio = params.dataHoraInicio.toISOString();
  const etapas = params.etapas && params.etapas.length > 0 ? params.etapas : [{ cidade: params.cidade, dias: 1 }];
  const nomes = new Map((await cidadesComPontos()).map((c) => [normalizarCidade(c.cidade), c.cidade]));
  const resolvidas: (EtapaDoRoteiro & { nome: string; variantes: string[] })[] = [];

  for (const etapa of etapas) {
    const variantes = await variantesDaCidade(etapa.cidade);

    // Sem nenhum ponto na cidade, o roteiro sairia vazio sem explicação: diz quais cidades existem.
    if (variantes.length === 0) {
      const disponiveis = [...nomes.values()];
      const aviso =
        disponiveis.length > 0
          ? `Ainda não há pontos cadastrados em "${etapa.cidade}". Cidades disponíveis: ${disponiveis.join(", ")}.`
          : "Ainda não há pontos publicados para montar um roteiro.";

      return { pontos: [], avisos: [aviso], inicio, fallbackUsado: false, dias: [] };
    }

    resolvidas.push({ ...etapa, nome: nomes.get(normalizarCidade(etapa.cidade)) ?? variantes[0], variantes });
  }

  const candidatosPorCidade = new Map<string, CandidatoRoteiro[]>();

  for (const etapa of resolvidas) {
    if (!candidatosPorCidade.has(etapa.nome)) {
      candidatosPorCidade.set(etapa.nome, await buscarCandidatos(etapa.variantes));
    }
  }

  try {
    let doGoogle = 0;

    for (const [cidade, candidatos] of candidatosPorCidade) {
      doGoogle += await completarHorariosPeloGoogle(candidatos, { ...params, cidade });
    }

    const primeira = resolvidas[0].nome;
    const { parametros: base, aviso: avisoLocal } = ajustarLocalizacao(candidatosPorCidade.get(primeira)!, {
      ...params,
      cidade: primeira,
    });

    const usados = new Set<number>();
    const pontos: PontoDoRoteiroGerado[] = [];
    const dias: DiaDoRoteiroGerado[] = [];
    const fechados = new Map<number, { texto: string; pontuacao: number }>();
    let cidadeAnterior: string | null = null;
    let posicaoAnterior: Coordenada | null = null;
    let numeroDoDia = 0;

    for (const etapa of resolvidas) {
      const daCidade = candidatosPorCidade.get(etapa.nome)!;
      const centro = calcularCentroide(daCidade);

      for (let i = 0; i < etapa.dias; i += 1) {
        numeroDoDia += 1;
        let viagem: DiaDoRoteiroGerado["viagem"] = null;

        if (cidadeAnterior && cidadeAnterior !== etapa.nome && centro && posicaoAnterior) {
          const metros = Math.round(
            distanciaMetros(posicaoAnterior.latitude, posicaoAnterior.longitude, centro.latitude, centro.longitude),
          );
          viagem = { de: cidadeAnterior, metros, minutos: minutosParaPercorrer(metros) };
        }

        const minutosDeEstrada = viagem?.minutos ?? 0;
        const inicioDoDia = new Date(params.dataHoraInicio.getTime() + (numeroDoDia - 1) * 86_400_000 + minutosDeEstrada * 60_000);
        const horas = params.horasDisponiveis - minutosDeEstrada / 60;
        const restantes = daCidade.filter((c) => !usados.has(c.id));

        dias.push({ dia: numeroDoDia, cidade: etapa.nome, inicio: inicioDoDia.toISOString(), viagem });

        if (horas >= HORAS_MINIMAS_PARA_PASSEIO && restantes.length > 0) {
          const doDia = planejarRoteiro(restantes, {
            ...base,
            cidade: etapa.nome,
            horasDisponiveis: horas,
            dataHoraInicio: inicioDoDia,
            // A localização de quem pede só vale para começar o primeiro dia.
            latitude: numeroDoDia === 1 ? base.latitude : undefined,
            longitude: numeroDoDia === 1 ? base.longitude : undefined,
          });

          for (const ponto of doDia.pontos) {
            usados.add(ponto.id);
            pontos.push({ ...ponto, dia: numeroDoDia });
          }

          for (const { id, texto, pontuacao } of doDia.fechados) {
            if (!fechados.has(id)) fechados.set(id, { texto, pontuacao });
          }
        }

        // A viagem do dia seguinte sai da última parada de hoje (ou do centro, num dia sem paradas).
        const ultima = [...pontos].reverse().find((p) => p.dia === numeroDoDia && p.latitude !== null && p.longitude !== null);
        posicaoAnterior = ultima ? { latitude: ultima.latitude!, longitude: ultima.longitude! } : (centro ?? posicaoAnterior);
        cidadeAnterior = etapa.nome;
      }
    }

    const avisosDeFechados = [...fechados]
      .filter(([id]) => !usados.has(id))
      .sort(([, a], [, b]) => b.pontuacao - a.pontuacao)
      .slice(0, 5)
      .map(([, { texto }]) => texto);
    const avisosIniciais = [
      ...(avisoLocal ? [avisoLocal] : []),
      ...(doGoogle > 0 ? [`Horário de ${doGoogle} ${doGoogle === 1 ? "ponto consultado" : "pontos consultados"} agora no Google Maps.`] : []),
    ];

    return { pontos, avisos: [...avisosIniciais, ...avisosDeFechados], inicio, fallbackUsado: false, dias };
  } catch (erro) {
    console.error("Motor de recomendação falhou, aplicando fallback por proximidade:", erro);

    const primeira = resolvidas[0];
    const pontos = planejarPorProximidade(candidatosPorCidade.get(primeira.nome)!, params).map((p) => ({ ...p, dia: 1 }));

    return {
      pontos,
      avisos: [],
      inicio,
      fallbackUsado: true,
      dias: [{ dia: 1, cidade: primeira.nome, inicio, viagem: null }],
    };
  }
}
