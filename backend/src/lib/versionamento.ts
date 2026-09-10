import { PontoTuristico, Prisma } from "@prisma/client";
import prisma from "./prisma";

const CAMPOS_VERSIONADOS = [
  "nome",
  "descricao",
  "categoria",
  "cidade",
  "endereco",
  "latitude",
  "longitude",
  "faixaPreco",
  "acessibilidade",
  "siteOficial",
  "telefoneContato",
  "horarioFuncionamento",
  "imagemUrl",
] as const;

/**
 * Salva um snapshot dos campos editáveis do ponto ANTES de uma alteração (RF26,
 * RB09) — permite restaurar/auditar o estado anterior. Chamar sempre antes de
 * aplicar a mudança em si.
 */
export async function registrarVersaoPonto(
  ponto: PontoTuristico,
  motivo: string,
  idAutor: number | null,
): Promise<void> {
  const snapshot: Record<string, unknown> = {};

  for (const campo of CAMPOS_VERSIONADOS) {
    snapshot[campo] = ponto[campo];
  }

  await prisma.versaoPonto.create({
    data: {
      idPonto: ponto.id,
      dados: snapshot as Prisma.InputJsonValue,
      idAutor,
      motivo,
    },
  });
}
