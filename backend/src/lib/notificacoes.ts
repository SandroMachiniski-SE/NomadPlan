import { TipoConta } from "@prisma/client";
import prisma from "./prisma";

export async function criarNotificacao(
  idUsuario: number,
  mensagem: string,
  link?: string,
): Promise<void> {
  try {
    await prisma.notificacao.create({
      data: { idUsuario, mensagem, link: link ?? null },
    });
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
  }
}

/** Avisa a equipe de moderação (moderadores e administradores ativos) de algo que espera revisão. */
export async function notificarModeradores(mensagem: string, link?: string): Promise<void> {
  try {
    const moderadores = await prisma.usuario.findMany({
      where: { tipoConta: { in: [TipoConta.MODERADOR, TipoConta.ADMIN] }, ativo: true },
      select: { id: true },
      take: 50,
    });

    if (moderadores.length === 0) {
      return;
    }

    await prisma.notificacao.createMany({
      data: moderadores.map((moderador) => ({ idUsuario: moderador.id, mensagem, link: link ?? null })),
    });
  } catch (error) {
    console.error("Erro ao notificar moderadores:", error);
  }
}
