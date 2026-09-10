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
