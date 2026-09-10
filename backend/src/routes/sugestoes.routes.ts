import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma, StatusSolicitacao, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar, autorizar } from "../middleware/auth";

const sugestoesRouter = Router();

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const idSchema = z.coerce.number().int().positive();

const rejeitarSchema = z.object({
  motivo: z.string().trim().min(1).max(500),
});

sugestoesRouter.use(autenticar, autorizar(...TIPOS_MODERADORES));

sugestoesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const sugestoes = await prisma.sugestaoEdicao.findMany({
      where: { status: StatusSolicitacao.PENDENTE },
      orderBy: { dataCriacao: "asc" },
      include: {
        autor: { select: { id: true, nome: true } },
        ponto: { select: { id: true, nome: true, cidade: true } },
      },
    });

    return res.json({ total: sugestoes.length, dados: sugestoes });
  } catch (error) {
    console.error("Erro ao listar sugestões pendentes:", error);

    return res.status(500).json({ erro: "Erro interno ao listar sugestões pendentes." });
  }
});

sugestoesRouter.post("/:id/aprovar", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const sugestao = await prisma.sugestaoEdicao.findUnique({ where: { id: id.data } });

    if (!sugestao) {
      return res.status(404).json({ erro: "Sugestão não encontrada." });
    }

    if (sugestao.status !== StatusSolicitacao.PENDENTE) {
      return res.status(409).json({ erro: "Esta sugestão já foi analisada." });
    }

    const camposPropostos = sugestao.camposPropostos as Prisma.JsonObject;

    await prisma.$transaction([
      prisma.pontoTuristico.update({
        where: { id: sugestao.idPonto },
        data: camposPropostos as Prisma.PontoTuristicoUpdateInput,
      }),
      prisma.sugestaoEdicao.update({
        where: { id: id.data },
        data: {
          status: StatusSolicitacao.APROVADA,
          idModerador: req.usuario!.id,
          dataResolucao: new Date(),
        },
      }),
    ]);

    return res.json({ mensagem: "Sugestão aprovada e aplicada ao ponto." });
  } catch (error) {
    console.error("Erro ao aprovar sugestão:", error);

    return res.status(500).json({ erro: "Erro interno ao aprovar sugestão." });
  }
});

sugestoesRouter.post("/:id/rejeitar", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = rejeitarSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Informe o motivo da rejeição.",
        detalhes: resultado.error.flatten(),
      });
    }

    const sugestao = await prisma.sugestaoEdicao.findUnique({ where: { id: id.data } });

    if (!sugestao) {
      return res.status(404).json({ erro: "Sugestão não encontrada." });
    }

    if (sugestao.status !== StatusSolicitacao.PENDENTE) {
      return res.status(409).json({ erro: "Esta sugestão já foi analisada." });
    }

    const sugestaoAtualizada = await prisma.sugestaoEdicao.update({
      where: { id: id.data },
      data: {
        status: StatusSolicitacao.REJEITADA,
        idModerador: req.usuario!.id,
        motivoRejeicao: resultado.data.motivo,
        dataResolucao: new Date(),
      },
    });

    return res.json(sugestaoAtualizada);
  } catch (error) {
    console.error("Erro ao rejeitar sugestão:", error);

    return res.status(500).json({ erro: "Erro interno ao rejeitar sugestão." });
  }
});

export default sugestoesRouter;
