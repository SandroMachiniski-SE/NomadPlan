import type { ItemRoteiro, Trecho } from "../types/roteiro";
import { formatarDistancia, formatarDuracao } from "./formatar";

export const MAX_DIAS = 30;

// Uma cor por dia, para ligar a lista ao mapa. Repete a partir do 8º dia.
const CORES_DOS_DIAS = ["#0b6f7b", "#c2512f", "#6b4fbb", "#2f8f4e", "#b8860b", "#c23a6b", "#3a6fc2"];

export function corDoDia(dia: number): string {
  return CORES_DOS_DIAS[(dia - 1) % CORES_DOS_DIAS.length];
}

/** Itens agrupados por dia (de 1 até `totalDias`, incluindo dias vazios), cada grupo na ordem. */
export function agruparPorDia(itens: ItemRoteiro[], totalDias: number): { dia: number; itens: ItemRoteiro[] }[] {
  return Array.from({ length: totalDias }, (_, i) => ({
    dia: i + 1,
    itens: itens.filter((item) => item.dia === i + 1).sort((a, b) => a.ordem - b.ordem),
  }));
}

/** Quantos dias mostrar: o maior dia em uso, o período do roteiro (se houver datas) ou o pedido pelo usuário. */
export function contarDias(
  itens: ItemRoteiro[],
  dataInicio: string | null,
  dataFim: string | null,
  minimo = 1,
): number {
  const maiorEmUso = itens.reduce((maior, item) => Math.max(maior, item.dia), 1);
  let doPeriodo = 1;

  if (dataInicio && dataFim) {
    const dias = Math.round((Date.parse(dataFim) - Date.parse(dataInicio)) / 86_400_000) + 1;
    if (Number.isFinite(dias) && dias > 1) doPeriodo = dias;
  }

  return Math.min(MAX_DIAS, Math.max(maiorEmUso, doPeriodo, minimo));
}

/** "Dia 2 · ter., 04/11" (com data) ou só "Dia 2". */
export function rotuloDoDia(dia: number, dataInicio: string | null): string {
  if (!dataInicio) return `Dia ${dia}`;

  const data = new Date(dataInicio);
  data.setUTCDate(data.getUTCDate() + dia - 1);

  const texto = data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

  return `Dia ${dia} · ${texto}`;
}

export function descreverTrecho(trecho: Trecho): string {
  return `≈ ${formatarDuracao(trecho.minutos)} · ${formatarDistancia(trecho.metros)}`;
}

/** Soma dos trechos de um dia. */
export function totalDoDia(itens: ItemRoteiro[]): Trecho {
  return itens.reduce(
    (soma, item) => ({
      metros: soma.metros + (item.deslocamento?.metros ?? 0),
      minutos: soma.minutos + (item.deslocamento?.minutos ?? 0),
    }),
    { metros: 0, minutos: 0 },
  );
}
