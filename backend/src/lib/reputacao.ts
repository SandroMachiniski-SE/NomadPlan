import prisma from "./prisma";

// RB04: usuários com reputação a partir deste limite têm suas sugestões aplicadas
// automaticamente, sem fila de revisão manual.
export const LIMITE_REPUTACAO_CONFIANCA = 5;

export const PONTOS_REPUTACAO = {
  SUGESTAO_APROVADA: 2,
  AVALIACAO_APROVADA: 1,
} as const;

export async function incrementarReputacao(idUsuario: number, pontos: number): Promise<void> {
  await prisma.usuario.update({
    where: { id: idUsuario },
    data: { reputacao: { increment: pontos } },
  });
}

export async function ehUsuarioConfiavel(idUsuario: number): Promise<boolean> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    select: { reputacao: true },
  });

  return (usuario?.reputacao ?? 0) >= LIMITE_REPUTACAO_CONFIANCA;
}
