import { Router, Request, Response } from "express";
import { z } from "zod";
import { StatusPonto, StatusSolicitacao, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar, autorizar } from "../middleware/auth";
import { registrarAuditoria } from "../lib/auditoria";

const adminRouter = Router();

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const idSchema = z.coerce.number().int().positive();

const alterarPapelSchema = z.object({
  tipoConta: z.nativeEnum(TipoConta),
});

adminRouter.use(autenticar);

// RF19: gestão de papéis/permissões — apenas ADMIN pode ver/alterar contas.
adminRouter.get("/usuarios", autorizar(TipoConta.ADMIN), async (_req: Request, res: Response) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      orderBy: { dataCriacao: "desc" },
      select: {
        id: true,
        nome: true,
        email: true,
        tipoConta: true,
        reputacao: true,
        ativo: true,
        dataCriacao: true,
      },
    });

    return res.json({ total: usuarios.length, dados: usuarios });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);

    return res.status(500).json({ erro: "Erro interno ao listar usuários." });
  }
});

adminRouter.patch(
  "/usuarios/:id/papel",
  autorizar(TipoConta.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);

      if (!id.success) {
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      const resultado = alterarPapelSchema.safeParse(req.body);

      if (!resultado.success) {
        return res.status(400).json({
          erro: "Papel inválido.",
          detalhes: resultado.error.flatten(),
        });
      }

      if (id.data === req.usuario!.id) {
        return res.status(400).json({ erro: "Você não pode alterar seu próprio papel." });
      }

      const usuario = await prisma.usuario.update({
        where: { id: id.data },
        data: { tipoConta: resultado.data.tipoConta },
        select: { id: true, nome: true, email: true, tipoConta: true },
      });

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "alterar_papel",
        entidade: "usuario",
        idEntidade: id.data,
        detalhes: { novoPapel: resultado.data.tipoConta },
      });

      return res.json(usuario);
    } catch (error) {
      console.error("Erro ao alterar papel do usuário:", error);

      return res.status(500).json({ erro: "Erro interno ao alterar papel do usuário." });
    }
  },
);

// RF20/RNF12: consulta ao log de auditoria das operações críticas.
adminRouter.get(
  "/auditoria",
  autorizar(TipoConta.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const limite = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limite ?? 50);

      const logs = await prisma.logAuditoria.findMany({
        orderBy: { dataCriacao: "desc" },
        take: limite,
        include: { usuario: { select: { id: true, nome: true } } },
      });

      return res.json({ total: logs.length, dados: logs });
    } catch (error) {
      console.error("Erro ao listar log de auditoria:", error);

      return res.status(500).json({ erro: "Erro interno ao listar log de auditoria." });
    }
  },
);

// RF28/RNF26: métricas agregadas de uso — cálculo direto no banco, sem pipeline
// de analytics dedicado (documentado como simplificação aceitável no planejamento).
adminRouter.get(
  "/metricas",
  autorizar(...TIPOS_MODERADORES),
  async (_req: Request, res: Response) => {
    try {
      const [
        totalUsuarios,
        usuariosPorTipo,
        totalPontos,
        pontosPorStatus,
        totalRoteiros,
        roteirosPublicos,
        totalAvaliacoes,
        totalSugestoesPendentes,
        totalVerificacoesPendentes,
      ] = await Promise.all([
        prisma.usuario.count(),
        prisma.usuario.groupBy({ by: ["tipoConta"], _count: true }),
        prisma.pontoTuristico.count(),
        prisma.pontoTuristico.groupBy({ by: ["status"], _count: true }),
        prisma.roteiro.count(),
        prisma.roteiro.count({ where: { publico: true } }),
        prisma.avaliacao.count({ where: { status: StatusSolicitacao.APROVADA } }),
        prisma.sugestaoEdicao.count({ where: { status: StatusSolicitacao.PENDENTE } }),
        prisma.solicitacaoVerificacao.count({ where: { status: StatusSolicitacao.PENDENTE } }),
      ]);

      return res.json({
        totalUsuarios,
        usuariosPorTipo,
        totalPontos,
        pontosPorStatus,
        pontosPublicados: pontosPorStatus.find((p) => p.status === StatusPonto.PUBLICADO)?._count ?? 0,
        totalRoteiros,
        roteirosPublicos,
        totalAvaliacoes,
        totalSugestoesPendentes,
        totalVerificacoesPendentes,
      });
    } catch (error) {
      console.error("Erro ao calcular métricas:", error);

      return res.status(500).json({ erro: "Erro interno ao calcular métricas." });
    }
  },
);

export default adminRouter;
