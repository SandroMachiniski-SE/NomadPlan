import { distanciaMetros } from "./geo";

// Trajeto entre as paradas de um roteiro: tempo/distância estimados e otimização da
// ordem. As distâncias são em linha reta (sem consultar um serviço de rotas), então o
// tempo é uma estimativa — a interface avisa isso.
//
// Dentro da cidade, a linha reta a 25 km/h já embute trânsito, semáforos e o caminho que não
// é reto. Entre cidades a pessoa pega a estrada: a distância real fica uns 30% maior que a
// linha reta, a 70 km/h, mais 10 minutos para sair de uma cidade e entrar na outra. Vale a
// estimativa mais rápida das duas: até uns 8 km ganha a urbana; daí em diante, a estrada.
export const VELOCIDADE_URBANA_KMH = 25;
const VELOCIDADE_ESTRADA_KMH = 70;
const DESVIO_DA_ESTRADA = 1.3;
const MINUTOS_PARA_SAIR_E_ENTRAR = 10;

export interface ParadaGeografica {
  id: number;
  latitude: number | null;
  longitude: number | null;
}

export interface Trecho {
  metros: number;
  minutos: number;
}

type ComCoordenadas = ParadaGeografica & { latitude: number; longitude: number };

function temCoordenadas(parada: ParadaGeografica): parada is ComCoordenadas {
  return parada.latitude !== null && parada.longitude !== null;
}

function entre(a: ComCoordenadas, b: ComCoordenadas): number {
  return distanciaMetros(a.latitude, a.longitude, b.latitude, b.longitude);
}

/** Tempo estimado (minutos, sem arredondar) para percorrer a distância em linha reta. */
export function minutosEstimados(metros: number): number {
  const urbano = (metros / 1000 / VELOCIDADE_URBANA_KMH) * 60;
  const estrada = ((metros * DESVIO_DA_ESTRADA) / 1000 / VELOCIDADE_ESTRADA_KMH) * 60 + MINUTOS_PARA_SAIR_E_ENTRAR;

  return Math.min(urbano, estrada);
}

export function minutosParaPercorrer(metros: number): number {
  return Math.max(1, Math.round(minutosEstimados(metros)));
}

/** Trecho entre duas paradas consecutivas; nulo se alguma não tem coordenadas. */
export function trechoEntre(origem: ParadaGeografica, destino: ParadaGeografica): Trecho | null {
  if (!temCoordenadas(origem) || !temCoordenadas(destino)) {
    return null;
  }

  const metros = Math.round(entre(origem, destino));

  return { metros, minutos: minutosParaPercorrer(metros) };
}

/** Distância total (em metros) de percorrer as paradas na ordem dada. Ignora as sem coordenadas. */
export function distanciaDoPercurso(paradas: ParadaGeografica[]): number {
  const localizadas = paradas.filter(temCoordenadas);
  let total = 0;

  for (let i = 1; i < localizadas.length; i += 1) {
    total += entre(localizadas[i - 1], localizadas[i]);
  }

  return Math.round(total);
}

function distanciaDoCaminho(caminho: ComCoordenadas[]): number {
  let total = 0;

  for (let i = 1; i < caminho.length; i += 1) {
    total += entre(caminho[i - 1], caminho[i]);
  }

  return total;
}

/**
 * Melhor ordem para visitar as paradas de um dia. A primeira parada é o ponto de partida
 * e fica onde está; as demais seguem o vizinho mais próximo, refinado por trocas de
 * trechos (2-opt) até não haver ganho. Paradas sem coordenadas vão para o fim, na ordem
 * original. Devolve os ids na nova ordem e as distâncias antes e depois.
 */
export function otimizarOrdem(paradas: ParadaGeografica[]): {
  ids: number[];
  metrosAntes: number;
  metrosDepois: number;
} {
  const localizadas = paradas.filter(temCoordenadas);
  const semCoordenadas = paradas.filter((p) => !temCoordenadas(p));
  const metrosAntes = distanciaDoCaminho(localizadas);

  if (localizadas.length < 3) {
    return { ids: paradas.map((p) => p.id), metrosAntes: Math.round(metrosAntes), metrosDepois: Math.round(metrosAntes) };
  }

  const [partida, ...restantes] = localizadas;
  let caminho: ComCoordenadas[] = [partida];

  while (restantes.length > 0) {
    const atual = caminho[caminho.length - 1];
    let melhor = 0;

    for (let i = 1; i < restantes.length; i += 1) {
      if (entre(atual, restantes[i]) < entre(atual, restantes[melhor])) {
        melhor = i;
      }
    }

    caminho.push(restantes.splice(melhor, 1)[0]);
  }

  // 2-opt em caminho aberto: inverter um trecho se isso encurta o percurso.
  let melhorou = true;

  while (melhorou) {
    melhorou = false;

    for (let i = 1; i < caminho.length - 1; i += 1) {
      for (let j = i + 1; j < caminho.length; j += 1) {
        const candidato = [...caminho.slice(0, i), ...caminho.slice(i, j + 1).reverse(), ...caminho.slice(j + 1)];

        if (distanciaDoCaminho(candidato) < distanciaDoCaminho(caminho) - 1) {
          caminho = candidato;
          melhorou = true;
        }
      }
    }
  }

  const metrosDepois = distanciaDoCaminho(caminho);

  // Só troca a ordem se ela realmente encurtar o percurso: evita reorganizar à toa.
  if (metrosDepois >= metrosAntes - 1) {
    return { ids: paradas.map((p) => p.id), metrosAntes: Math.round(metrosAntes), metrosDepois: Math.round(metrosAntes) };
  }

  return {
    ids: [...caminho.map((p) => p.id), ...semCoordenadas.map((p) => p.id)],
    metrosAntes: Math.round(metrosAntes),
    metrosDepois: Math.round(metrosDepois),
  };
}

/** Acrescenta a cada item o trecho desde o anterior do mesmo dia (o primeiro de cada dia não tem). */
function mesmaCidade(a: string, b: string): boolean {
  const simples = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  return simples(a) === simples(b);
}

// Atividades livres não têm ponto (nem cidade, nem coordenadas).
type ItemComCidade = { dia: number; ponto: (ParadaGeografica & { cidade: string }) | null };

/** Cidades do roteiro, na ordem em que aparecem (dia a dia), sem repetir. */
export function cidadesDosItens(itensEmOrdem: ItemComCidade[]): string[] {
  const cidades: string[] = [];

  for (const { ponto } of itensEmOrdem) {
    if (ponto && !cidades.some((c) => mesmaCidade(c, ponto.cidade))) {
      cidades.push(ponto.cidade);
    }
  }

  return cidades;
}

export interface ViagemEntreDias extends Trecho {
  /** Dia que começa com a viagem. */
  dia: number;
  de: string;
  para: string;
}

/**
 * Viagens entre cidades na passagem de um dia para o outro: da última parada de um dia até a
 * primeira do dia seguinte, quando ficam em cidades diferentes.
 */
export function viagensEntreDias(itensEmOrdem: ItemComCidade[]): ViagemEntreDias[] {
  // Só contam os pontos com lugar no mapa (a pernoite, se for um ponto, é a última do dia).
  const porDia = new Map<number, (ParadaGeografica & { cidade: string })[]>();

  for (const { dia, ponto } of itensEmOrdem) {
    if (ponto && temCoordenadas(ponto)) {
      porDia.set(dia, [...(porDia.get(dia) ?? []), ponto]);
    }
  }

  const dias = [...porDia.keys()].sort((a, b) => a - b);
  const viagens: ViagemEntreDias[] = [];

  for (let i = 1; i < dias.length; i += 1) {
    const anterior = porDia.get(dias[i - 1])!;
    const ultima = anterior[anterior.length - 1];
    const primeira = porDia.get(dias[i])![0];
    const trecho = mesmaCidade(ultima.cidade, primeira.cidade) ? null : trechoEntre(ultima, primeira);

    if (trecho) {
      viagens.push({ dia: dias[i], de: ultima.cidade, para: primeira.cidade, ...trecho });
    }
  }

  return viagens;
}

export function comTrechos<T extends { dia: number; ponto: ParadaGeografica | null }>(
  itensEmOrdem: T[],
): (T & { deslocamento: Trecho | null })[] {
  // O trecho sai do último ponto com lugar no mapa: uma atividade livre no meio do dia não o interrompe.
  const anteriorDoDia = new Map<number, ParadaGeografica>();

  return itensEmOrdem.map((item) => {
    if (!item.ponto || !temCoordenadas(item.ponto)) {
      return { ...item, deslocamento: null };
    }

    const anterior = anteriorDoDia.get(item.dia);
    anteriorDoDia.set(item.dia, item.ponto);

    return { ...item, deslocamento: anterior ? trechoEntre(anterior, item.ponto) : null };
  });
}
