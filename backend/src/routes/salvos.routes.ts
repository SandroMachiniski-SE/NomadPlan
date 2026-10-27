import { Router, Request, Response } from "express";
import { z } from "zod";
import { StatusPonto } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar } from "../middleware/auth";
import { pontoSelecaoPublica } from "../lib/pontosSelecao";
import { ehViolacaoDeUnicidade } from "../lib/prismaErros";
import { registrarEvento } from "../lib/metricasUso";

// Pontos que o usuário salvou para ver depois (RF10: "adicionar ao roteiro ou salvar").
const salvosRouter = Router();

const idSchema = z.coerce.number().int().positive();

salvosRouter.use(autenticar);

salvosRouter.get("/", async (req: Request, res: Response) => {
  try {
    const salvos = await prisma.pontoSalvo.findMany({
      where: { idUsuario: req.usuario!.id, ponto: { status: StatusPonto.PUBLICADO } },
      orderBy: { dataCriacao: "desc" },
      select: { dataCriacao: true, ponto: { select: pontoSelecaoPublica } },
    });

    const dados = salvos.map((salvo) => ({ ...salvo.ponto, salvoEm: salvo.dataCriacao }));

    return res.json({ total: dados.length, dados });
  } catch (error) {
    console.error("Erro ao listar pontos salvos:", error);

    return res.status(500).json({ erro: "Erro interno ao listar pontos salvos." });
  }
});

// Só os identificadores: a lista de resultados usa isso para marcar os já salvos.
salvosRouter.get("/ids", async (req: Request, res: Response) => {
  try {
    const salvos = await prisma.pontoSalvo.findMany({
      where: { idUsuario: req.usuario!.id },
      select: { idPonto: true },
    });

    return res.json({ ids: salvos.map((s) => s.idPonto) });
  } catch (error) {
    console.error("Erro ao listar ids dos pontos salvos:", error);

    return res.status(500).json({ erro: "Erro interno ao listar pontos salvos." });
  }
});

salvosRouter.post("/:idPonto", async (req: Request, res: Response) => {
  try {
    const idPonto = idSchema.safeParse(req.params.idPonto);

    if (!idPonto.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const ponto = await prisma.pontoTuristico.findFirst({
      where: { id: idPonto.data, status: StatusPonto.PUBLICADO },
      select: { id: true },
    });

    if (!ponto) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    try {
      await prisma.pontoSalvo.create({ data: { idUsuario: req.usuario!.id, idPonto: ponto.id } });
      registrarEvento("ponto_salvo");
    } catch (erro) {
      // Salvar duas vezes não é erro: o resultado é o mesmo (idempotente).
      if (!ehViolacaoDeUnicidade(erro)) {
        throw erro;
      }
    }

    return res.status(201).json({ idPonto: ponto.id, salvo: true });
  } catch (error) {
    console.error("Erro ao salvar ponto:", error);

    return res.status(500).json({ erro: "Erro interno ao salvar o ponto." });
  }
});

salvosRouter.delete("/:idPonto", async (req: Request, res: Response) => {
  try {
    const idPonto = idSchema.safeParse(req.params.idPonto);

    if (!idPonto.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    await prisma.pontoSalvo.deleteMany({
      where: { idUsuario: req.usuario!.id, idPonto: idPonto.data },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao remover ponto salvo:", error);

    return res.status(500).json({ erro: "Erro interno ao remover o ponto salvo." });
  }
});

export default salvosRouter;
