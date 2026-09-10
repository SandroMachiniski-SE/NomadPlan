import { Router, Request, Response } from "express";
import { z } from "zod";
import { StatusPonto, StatusSolicitacao, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar, autorizar } from "../middleware/auth";

const verificacoesRouter = Router();

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const idSchema = z.coerce.number().int().positive();

const rejeitarSchema = z.object({
  motivo: z.string().trim().min(1).max(500),
});

verificacoesRouter.use(autenticar, autorizar(...TIPOS_MODERADORES));

verificacoesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const solicitacoes = await prisma.solicitacaoVerificacao.findMany({
      where: { status: StatusSolicitacao.PENDENTE },
      orderBy: { dataCriacao: "asc" },
      include: {
        solicitante: { select: { id: true, nome: true } },
        ponto: { select: { id: true, nome: true, cidade: true } },
      },
    });

    return res.json({ total: solicitacoes.length, dados: solicitacoes });
  } catch (error) {
    console.error("Erro ao listar solicitações de verificação:", error);

    return res.status(500).json({ erro: "Erro interno ao listar solicitações de verificação." });
  }
});

verificacoesRouter.post("/:id/aprovar", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const solicitacao = await prisma.solicitacaoVerificacao.findUnique({ where: { id: id.data } });

    if (!solicitacao) {
      return res.status(404).json({ erro: "Solicitação não encontrada." });
    }

    if (solicitacao.status !== StatusSolicitacao.PENDENTE) {
      return res.status(409).json({ erro: "Esta solicitação já foi analisada." });
    }

    await prisma.$transaction([
      prisma.pontoTuristico.update({
        where: { id: solicitacao.idPonto },
        data: { seloVerificado: true, status: StatusPonto.PUBLICADO },
      }),
      prisma.solicitacaoVerificacao.update({
        where: { id: id.data },
        data: {
          status: StatusSolicitacao.APROVADA,
          idModerador: req.usuario!.id,
          dataResolucao: new Date(),
        },
      }),
    ]);

    return res.json({ mensagem: "Selo de verificação concedido ao ponto." });
  } catch (error) {
    console.error("Erro ao aprovar solicitação de verificação:", error);

    return res.status(500).json({ erro: "Erro interno ao aprovar solicitação de verificação." });
  }
});

verificacoesRouter.post("/:id/rejeitar", async (req: Request, res: Response) => {
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

    const solicitacao = await prisma.solicitacaoVerificacao.findUnique({ where: { id: id.data } });

    if (!solicitacao) {
      return res.status(404).json({ erro: "Solicitação não encontrada." });
    }

    if (solicitacao.status !== StatusSolicitacao.PENDENTE) {
      return res.status(409).json({ erro: "Esta solicitação já foi analisada." });
    }

    const solicitacaoAtualizada = await prisma.solicitacaoVerificacao.update({
      where: { id: id.data },
      data: {
        status: StatusSolicitacao.REJEITADA,
        idModerador: req.usuario!.id,
        motivoRejeicao: resultado.data.motivo,
        dataResolucao: new Date(),
      },
    });

    return res.json(solicitacaoAtualizada);
  } catch (error) {
    console.error("Erro ao rejeitar solicitação de verificação:", error);

    return res.status(500).json({ erro: "Erro interno ao rejeitar solicitação de verificação." });
  }
});

export default verificacoesRouter;
