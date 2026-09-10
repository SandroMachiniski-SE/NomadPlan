import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { autenticar } from "../middleware/auth";

const notificacoesRouter = Router();

const idSchema = z.coerce.number().int().positive();

notificacoesRouter.use(autenticar);

notificacoesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const notificacoes = await prisma.notificacao.findMany({
      where: { idUsuario: req.usuario!.id },
      orderBy: { dataCriacao: "desc" },
      take: 30,
    });

    const naoLidas = notificacoes.filter((n) => !n.lida).length;

    return res.json({ total: notificacoes.length, naoLidas, dados: notificacoes });
  } catch (error) {
    console.error("Erro ao listar notificações:", error);

    return res.status(500).json({ erro: "Erro interno ao listar notificações." });
  }
});

notificacoesRouter.patch("/:id/lida", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const notificacao = await prisma.notificacao.findFirst({
      where: { id: id.data, idUsuario: req.usuario!.id },
    });

    if (!notificacao) {
      return res.status(404).json({ erro: "Notificação não encontrada." });
    }

    const atualizada = await prisma.notificacao.update({
      where: { id: id.data },
      data: { lida: true },
    });

    return res.json(atualizada);
  } catch (error) {
    console.error("Erro ao marcar notificação como lida:", error);

    return res.status(500).json({ erro: "Erro interno ao marcar notificação como lida." });
  }
});

notificacoesRouter.post("/marcar-todas-lidas", async (req: Request, res: Response) => {
  try {
    await prisma.notificacao.updateMany({
      where: { idUsuario: req.usuario!.id, lida: false },
      data: { lida: true },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao marcar notificações como lidas:", error);

    return res.status(500).json({ erro: "Erro interno ao marcar notificações como lidas." });
  }
});

export default notificacoesRouter;
