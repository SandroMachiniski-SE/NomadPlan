// Orçamento simples da viagem: soma o custo previsto de cada parada (em centavos), por dia
// e no total, e compara com o teto de gastos que a pessoa definiu, se houver.

export interface ResumoOrcamento {
  totalCentavos: number;
  /** Total de cada dia que tem alguma parada com custo. */
  porDia: Record<number, number>;
  orcamentoCentavos: number | null;
  /** Quanto ainda cabe no teto (negativo se estourou); nulo sem teto. */
  restanteCentavos: number | null;
  /** Quantas paradas ainda estão sem custo informado. */
  paradasSemCusto: number;
}

export function resumirOrcamento(
  itens: { dia: number; custoCentavos: number | null }[],
  orcamentoCentavos: number | null,
): ResumoOrcamento {
  const porDia: Record<number, number> = {};
  let totalCentavos = 0;
  let paradasSemCusto = 0;

  for (const item of itens) {
    if (item.custoCentavos === null) {
      paradasSemCusto += 1;
      continue;
    }

    porDia[item.dia] = (porDia[item.dia] ?? 0) + item.custoCentavos;
    totalCentavos += item.custoCentavos;
  }

  return {
    totalCentavos,
    porDia,
    orcamentoCentavos,
    restanteCentavos: orcamentoCentavos === null ? null : orcamentoCentavos - totalCentavos,
    paradasSemCusto,
  };
}
