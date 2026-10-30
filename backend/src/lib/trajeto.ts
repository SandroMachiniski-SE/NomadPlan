import { distanciaMetros } from "./geo";
import { VELOCIDADE_MEDIA_KMH } from "./recomendacao";

// Trajeto entre as paradas de um roteiro: tempo/distância estimados e otimização da
// ordem. As distâncias são em linha reta (sem consultar um serviço de rotas), então o
// tempo é uma estimativa — a interface avisa isso.

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

export function minutosParaPercorrer(metros: number): number {
  return Math.max(1, Math.round((metros / 1000 / VELOCIDADE_MEDIA_KMH) * 60));
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
export function comTrechos<T extends { dia: number; ponto: ParadaGeografica }>(
  itensEmOrdem: T[],
): (T & { deslocamento: Trecho | null })[] {
  const anteriorDoDia = new Map<number, T>();

  return itensEmOrdem.map((item) => {
    const anterior = anteriorDoDia.get(item.dia);
    anteriorDoDia.set(item.dia, item);

    return { ...item, deslocamento: anterior ? trechoEntre(anterior.ponto, item.ponto) : null };
  });
}
