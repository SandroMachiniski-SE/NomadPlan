import { Router, Request, Response } from "express";
import { z } from "zod";
import { StatusPonto, StatusSolicitacao, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar, autorizar } from "../middleware/auth";
import { registrarAuditoria } from "../lib/auditoria";
import { ehRegistroInexistente } from "../lib/prismaErros";
import { serieDeUso, serieParaCsv } from "../lib/metricasUso";

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
      if (ehRegistroInexistente(error)) {
        return res.status(404).json({ erro: "Usuário não encontrado." });
      }

      console.error("Erro ao alterar papel do usuário:", error);

      return res.status(500).json({ erro: "Erro interno ao alterar papel do usuário." });
    }
  },
);

// RF27: administração de contas problemáticas. Desativar tem efeito imediato (o middleware
// de autenticação consulta o banco a cada requisição).
adminRouter.patch(
  "/usuarios/:id/ativo",
  autorizar(TipoConta.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const corpo = z.object({ ativo: z.boolean() }).safeParse(req.body);

      if (!id.success || !corpo.success) {
        return res.status(400).json({ erro: "Dados inválidos." });
      }

      if (id.data === req.usuario!.id) {
        return res.status(400).json({ erro: "Você não pode desativar a própria conta." });
      }

      const usuario = await prisma.usuario.update({
        where: { id: id.data },
        data: { ativo: corpo.data.ativo },
        select: { id: true, nome: true, email: true, tipoConta: true, ativo: true },
      });

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: corpo.data.ativo ? "reativar_conta" : "desativar_conta",
        entidade: "usuario",
        idEntidade: id.data,
      });

      return res.json(usuario);
    } catch (error) {
      if (ehRegistroInexistente(error)) {
        return res.status(404).json({ erro: "Usuário não encontrado." });
      }

      console.error("Erro ao alterar situação da conta:", error);

      return res.status(500).json({ erro: "Erro interno ao alterar a situação da conta." });
    }
  },
);

// RF20/RNF12: consulta ao log de auditoria das operações críticas.
adminRouter.get(
  "/auditoria",
  autorizar(TipoConta.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const parametro = z.coerce.number().int().min(1).max(200).default(50).safeParse(req.query.limite ?? 50);

      if (!parametro.success) {
        return res.status(400).json({ erro: "O limite deve ser um número entre 1 e 200." });
      }

      const limite = parametro.data;

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

// Usuários únicos que entraram no sistema na janela (cada login bem-sucedido vai para o log).
async function usuariosAtivosNosUltimosDias(dias: number): Promise<number> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const logins = await prisma.logAuditoria.findMany({
    where: { acao: "login_ok", dataCriacao: { gte: desde }, idUsuario: { not: null } },
    distinct: ["idUsuario"],
    select: { idUsuario: true },
  });

  return logins.length;
}

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
        usuariosAtivos7d,
        usuariosAtivos30d,
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
        usuariosAtivosNosUltimosDias(7),
        usuariosAtivosNosUltimosDias(30),
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
        usuariosAtivos7d,
        usuariosAtivos30d,
      });
    } catch (error) {
      console.error("Erro ao calcular métricas:", error);

      return res.status(500).json({ erro: "Erro interno ao calcular métricas." });
    }
  },
);

// RF28/RNF26: série diária de uso (buscas, roteiros gerados, cadastros, avaliações...).
const usoSchema = z.object({ dias: z.coerce.number().int().min(1).max(365).default(30) });

adminRouter.get(
  "/metricas/uso",
  autorizar(...TIPOS_MODERADORES),
  async (req: Request, res: Response) => {
    try {
      const consulta = usoSchema.safeParse(req.query);

      if (!consulta.success) {
        return res.status(400).json({ erro: "Informe dias entre 1 e 365." });
      }

      const serie = await serieDeUso(consulta.data.dias);

      return res.json({ dias: consulta.data.dias, serie });
    } catch (error) {
      console.error("Erro ao calcular série de uso:", error);

      return res.status(500).json({ erro: "Erro interno ao calcular o uso diário." });
    }
  },
);

adminRouter.get(
  "/metricas/uso.csv",
  autorizar(...TIPOS_MODERADORES),
  async (req: Request, res: Response) => {
    try {
      const consulta = usoSchema.safeParse(req.query);

      if (!consulta.success) {
        return res.status(400).json({ erro: "Informe dias entre 1 e 365." });
      }

      const serie = await serieDeUso(consulta.data.dias);

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "exportar",
        entidade: "metricas_uso",
        detalhes: { dias: consulta.data.dias },
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=uso-nomadplan.csv");
      return res.send(serieParaCsv(serie));
    } catch (error) {
      console.error("Erro ao exportar métricas de uso:", error);

      return res.status(500).json({ erro: "Erro interno ao exportar o uso diário." });
    }
  },
);

export default adminRouter;
