import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { autenticar } from "../middleware/auth";
import { registrarAuditoria } from "../lib/auditoria";
import { criarNotificacao } from "../lib/notificacoes";

// Convites para roteiros recebidos por quem está logado. Os convites são ligados ao
// e-mail: valem para a conta que usa o e-mail convidado (inclusive uma criada depois).

const convitesRouter = Router();
const idSchema = z.coerce.number().int().positive();

convitesRouter.use(autenticar);

async function emailDoUsuario(idUsuario: number): Promise<string> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: idUsuario }, select: { email: true } });

  return usuario.email.toLowerCase();
}

convitesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const convites = await prisma.conviteRoteiro.findMany({
      where: { email: await emailDoUsuario(req.usuario!.id) },
      orderBy: { id: "desc" },
      select: {
        id: true,
        papel: true,
        dataCriacao: true,
        roteiro: { select: { id: true, nome: true, cidade: true } },
        convidante: { select: { nome: true } },
      },
    });

    return res.json({ total: convites.length, dados: convites });
  } catch (error) {
    console.error("Erro ao listar convites:", error);

    return res.status(500).json({ erro: "Erro interno ao listar os convites." });
  }
});

async function responder(req: Request, res: Response, aceitar: boolean) {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const idUsuario = req.usuario!.id;

    const convite = await prisma.conviteRoteiro.findFirst({
      where: { id: id.data, email: await emailDoUsuario(idUsuario) },
      select: {
        id: true,
        idRoteiro: true,
        papel: true,
        idConvidante: true,
        roteiro: { select: { nome: true, idUsuario: true } },
      },
    });

    if (!convite) {
      return res.status(404).json({ erro: "Convite não encontrado." });
    }

    await prisma.$transaction(async (tx) => {
      if (aceitar && convite.roteiro.idUsuario !== idUsuario) {
        await tx.colaboradorRoteiro.upsert({
          where: { idRoteiro_idUsuario: { idRoteiro: convite.idRoteiro, idUsuario } },
          create: { idRoteiro: convite.idRoteiro, idUsuario, papel: convite.papel },
          update: { papel: convite.papel },
        });
      }

      await tx.conviteRoteiro.delete({ where: { id: convite.id } });
    });

    await registrarAuditoria({
      idUsuario,
      acao: aceitar ? "aceitar_convite" : "recusar_convite",
      entidade: "roteiro",
      idEntidade: convite.idRoteiro,
    });

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: idUsuario }, select: { nome: true } });

    await criarNotificacao(
      convite.idConvidante,
      aceitar
        ? `${usuario.nome} aceitou o convite para o roteiro "${convite.roteiro.nome}".`
        : `${usuario.nome} recusou o convite para o roteiro "${convite.roteiro.nome}".`,
      aceitar ? `/roteiros/${convite.idRoteiro}` : undefined,
    );

    return res.json({ aceito: aceitar, idRoteiro: convite.idRoteiro });
  } catch (error) {
    console.error("Erro ao responder o convite:", error);

    return res.status(500).json({ erro: "Erro interno ao responder o convite." });
  }
}

convitesRouter.post("/:id/aceitar", (req, res) => responder(req, res, true));
convitesRouter.post("/:id/recusar", (req, res) => responder(req, res, false));

export default convitesRouter;
