// Orçamento simples da viagem: soma o custo previsto de cada parada (em centavos) e o combustível
// dos trechos da viagem de carro, por dia e no total, e compara com o teto de gastos, se houver.

export interface ResumoOrcamento {
  totalCentavos: number;
  /** Total de cada dia que tem alguma parada com custo. */
  porDia: Record<number, number>;
  orcamentoCentavos: number | null;
  /** Quanto ainda cabe no teto (negativo se estourou); nulo sem teto. */
  restanteCentavos: number | null;
  /** Quantas paradas ainda estão sem custo informado. */
  paradasSemCusto: number;
  /** Parte do total que é combustível da viagem de carro. */
  combustivelCentavos: number;
}

export function resumirOrcamento(
  itens: { dia: number; custoCentavos: number | null }[],
  orcamentoCentavos: number | null,
  trechos: { dia: number; custoCombustivelCentavos: number | null }[] = [],
): ResumoOrcamento {
  const porDia: Record<number, number> = {};
  let totalCentavos = 0;
  let paradasSemCusto = 0;
  let combustivelCentavos = 0;

  for (const trecho of trechos) {
    if (trecho.custoCombustivelCentavos === null) continue;

    porDia[trecho.dia] = (porDia[trecho.dia] ?? 0) + trecho.custoCombustivelCentavos;
    totalCentavos += trecho.custoCombustivelCentavos;
    combustivelCentavos += trecho.custoCombustivelCentavos;
  }

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
    combustivelCentavos,
  };
}
