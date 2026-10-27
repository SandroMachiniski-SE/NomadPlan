import { Prisma } from "@prisma/client";

/** P2002: violação de índice único (ex.: segunda avaliação do mesmo usuário no mesmo ponto). */
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

/** P2025: o registro que seria alterado/apagado não existe. */
export function ehRegistroInexistente(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2025";
}
