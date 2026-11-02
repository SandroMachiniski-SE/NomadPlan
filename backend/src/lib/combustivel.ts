// Combustível de um trecho da viagem de carro, com o consumo do carro e o preço do litro que a
// pessoa informou (não há valor fixo no sistema). Sem um dos dois, não há estimativa.

/** Litros com uma casa decimal; o custo é esse volume vezes o preço do litro, em centavos. */
export function estimarCombustivel(
  km: number,
  consumoKmPorLitro: number | null,
  precoLitroCentavos: number | null,
): { litros: number; custoCentavos: number } | null {
  if (consumoKmPorLitro === null || precoLitroCentavos === null) return null;

  const litros = Math.round((km / consumoKmPorLitro) * 10) / 10;

  return { litros, custoCentavos: Math.round(litros * precoLitroCentavos) };
}
