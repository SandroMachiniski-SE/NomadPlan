import type { Prisma } from "@prisma/client";

/** O consumo vem do banco como Decimal e o município com "nome": a API devolve número e "cidade". */
export function perfilPublico<
  T extends { consumoKmPorLitro: Prisma.Decimal | null; municipioBase: { codigoIbge: number; nome: string; uf: string } | null },
>(usuario: T) {
  const { municipioBase, consumoKmPorLitro, ...resto } = usuario;

  return {
    ...resto,
    consumoKmPorLitro: consumoKmPorLitro === null ? null : Number(consumoKmPorLitro),
    municipioBase: municipioBase
      ? { codigoIbge: municipioBase.codigoIbge, cidade: municipioBase.nome, uf: municipioBase.uf }
      : null,
  };
}
