import { Router, Request, Response } from "express";
import { z } from "zod";
import { StatusSolicitacao, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar, autorizar } from "../middleware/auth";
import { incrementarReputacao, PONTOS_REPUTACAO } from "../lib/reputacao";
import { registrarAuditoria } from "../lib/auditoria";

const avaliacoesRouter = Router();

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const idSchema = z.coerce.number().int().positive();

const rejeitarSchema = z.object({
  motivo: z.string().trim().min(1).max(500),
});

avaliacoesRouter.use(autenticar, autorizar(...TIPOS_MODERADORES));

avaliacoesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const avaliacoes = await prisma.avaliacao.findMany({
      where: { status: StatusSolicitacao.PENDENTE },
      orderBy: { dataCriacao: "asc" },
      include: {
        autor: { select: { id: true, nome: true } },
        ponto: { select: { id: true, nome: true, cidade: true } },
      },
    });

    return res.json({ total: avaliacoes.length, dados: avaliacoes });
  } catch (error) {
    console.error("Erro ao listar avaliações pendentes:", error);

    return res.status(500).json({ erro: "Erro interno ao listar avaliações pendentes." });
  }
});

avaliacoesRouter.post("/:id/aprovar", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const avaliacao = await prisma.avaliacao.findUnique({ where: { id: id.data } });

    if (!avaliacao) {
      return res.status(404).json({ erro: "Avaliação não encontrada." });
    }

    if (avaliacao.status !== StatusSolicitacao.PENDENTE) {
      return res.status(409).json({ erro: "Esta avaliação já foi analisada." });
    }

    const avaliacaoAtualizada = await prisma.avaliacao.update({
      where: { id: id.data },
      data: { status: StatusSolicitacao.APROVADA },
    });

    await incrementarReputacao(avaliacao.idAutor, PONTOS_REPUTACAO.AVALIACAO_APROVADA);

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "aprovar",
      entidade: "avaliacao",
      idEntidade: id.data,
    });

    return res.json(avaliacaoAtualizada);
  } catch (error) {
    console.error("Erro ao aprovar avaliação:", error);

    return res.status(500).json({ erro: "Erro interno ao aprovar avaliação." });
  }
});

avaliacoesRouter.post("/:id/rejeitar", async (req: Request, res: Response) => {
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

    const avaliacao = await prisma.avaliacao.findUnique({ where: { id: id.data } });

    if (!avaliacao) {
      return res.status(404).json({ erro: "Avaliação não encontrada." });
    }

    if (avaliacao.status !== StatusSolicitacao.PENDENTE) {
      return res.status(409).json({ erro: "Esta avaliação já foi analisada." });
    }

    const avaliacaoAtualizada = await prisma.avaliacao.update({
      where: { id: id.data },
      data: { status: StatusSolicitacao.REJEITADA, motivoRejeicao: resultado.data.motivo },
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "rejeitar",
      entidade: "avaliacao",
      idEntidade: id.data,
      detalhes: { motivo: resultado.data.motivo },
    });

    return res.json(avaliacaoAtualizada);
  } catch (error) {
    console.error("Erro ao rejeitar avaliação:", error);

    return res.status(500).json({ erro: "Erro interno ao rejeitar avaliação." });
  }
});

export default avaliacoesRouter;
