import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { autenticar } from "../middleware/auth";

const roteirosRouter = Router();

roteirosRouter.use(autenticar);

const criarRoteiroSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(1000).optional(),
  cidade: z.string().trim().max(120).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

const adicionarItemSchema = z.object({
  idPonto: z.coerce.number().int().positive(),
  ordem: z.coerce.number().int().min(0).optional(),
  observacao: z.string().trim().max(500).optional(),
});

const idSchema = z.coerce.number().int().positive();

async function buscarRoteiroDoUsuario(id: number, idUsuario: number) {
  return prisma.roteiro.findFirst({
    where: { id, idUsuario },
    select: { id: true },
  });
}

roteirosRouter.get("/", async (req: Request, res: Response) => {
  try {
    const roteiros = await prisma.roteiro.findMany({
      where: {
        idUsuario: req.usuario!.id,
      },
      orderBy: {
        dataAtualizacao: "desc",
      },
      include: {
        _count: {
          select: {
            itens: true,
          },
        },
      },
    });

    return res.json({
      total: roteiros.length,
      dados: roteiros,
    });
  } catch (error) {
    console.error("Erro ao listar roteiros:", error);

    return res.status(500).json({
      erro: "Erro interno ao listar roteiros.",
    });
  }
});

roteirosRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({
        erro: "Identificador inválido.",
      });
    }

    const roteiro = await prisma.roteiro.findFirst({
      where: {
        id: id.data,
        idUsuario: req.usuario!.id,
      },
      include: {
        itens: {
          orderBy: {
            ordem: "asc",
          },
          include: {
            ponto: {
              select: {
                id: true,
                nome: true,
                descricao: true,
                categoria: true,
                cidade: true,
                endereco: true,
                faixaPreco: true,
                acessibilidade: true,
                siteOficial: true,
                telefoneContato: true,
                seloVerificado: true,
              },
            },
          },
        },
      },
    });

    if (!roteiro) {
      return res.status(404).json({
        erro: "Roteiro não encontrado.",
      });
    }

    return res.json(roteiro);
  } catch (error) {
    console.error("Erro ao buscar roteiro:", error);

    return res.status(500).json({
      erro: "Erro interno ao buscar roteiro.",
    });
  }
});

roteirosRouter.post("/", async (req: Request, res: Response) => {
  try {
    const resultado = criarRoteiroSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados do roteiro inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const dados = resultado.data;

    if (dados.dataInicio && dados.dataFim && dados.dataFim < dados.dataInicio) {
      return res.status(400).json({
        erro: "A data final não pode ser anterior à data inicial.",
      });
    }

    const roteiro = await prisma.roteiro.create({
      data: {
        nome: dados.nome,
        descricao: dados.descricao || null,
        cidade: dados.cidade || null,
        dataInicio: dados.dataInicio || null,
        dataFim: dados.dataFim || null,
        idUsuario: req.usuario!.id,
      },
    });

    return res.status(201).json(roteiro);
  } catch (error) {
    console.error("Erro ao criar roteiro:", error);

    return res.status(500).json({
      erro: "Erro interno ao criar roteiro.",
    });
  }
});

roteirosRouter.post("/:id/itens", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);

    if (!idRoteiro.success) {
      return res.status(400).json({
        erro: "Identificador do roteiro inválido.",
      });
    }

    const resultado = adicionarItemSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados do item inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const roteiro = await buscarRoteiroDoUsuario(idRoteiro.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({
        erro: "Roteiro não encontrado.",
      });
    }

    const ponto = await prisma.pontoTuristico.findFirst({
      where: {
        id: resultado.data.idPonto,
        status: "PUBLICADO",
      },
      select: {
        id: true,
      },
    });

    if (!ponto) {
      return res.status(404).json({
        erro: "Ponto turístico não encontrado.",
      });
    }

    const item = await prisma.itemRoteiro.create({
      data: {
        idRoteiro: idRoteiro.data,
        idPonto: resultado.data.idPonto,
        ordem: resultado.data.ordem ?? 0,
        observacao: resultado.data.observacao || null,
      },
      include: {
        ponto: true,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error("Erro ao adicionar item ao roteiro:", error);

    return res.status(500).json({
      erro: "Erro interno ao adicionar item ao roteiro.",
    });
  }
});

roteirosRouter.delete("/:id/itens/:idPonto", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);
    const idPonto = idSchema.safeParse(req.params.idPonto);

    if (!idRoteiro.success || !idPonto.success) {
      return res.status(400).json({
        erro: "Identificador inválido.",
      });
    }

    const roteiro = await buscarRoteiroDoUsuario(idRoteiro.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({
        erro: "Roteiro não encontrado.",
      });
    }

    const item = await prisma.itemRoteiro.findFirst({
      where: {
        idRoteiro: idRoteiro.data,
        idPonto: idPonto.data,
      },
    });

    if (!item) {
      return res.status(404).json({
        erro: "Item não encontrado no roteiro.",
      });
    }

    await prisma.itemRoteiro.delete({
      where: {
        id: item.id,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao remover item do roteiro:", error);

    return res.status(500).json({
      erro: "Erro interno ao remover item do roteiro.",
    });
  }
});

roteirosRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({
        erro: "Identificador inválido.",
      });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({
        erro: "Roteiro não encontrado.",
      });
    }

    await prisma.roteiro.delete({
      where: {
        id: id.data,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir roteiro:", error);

    return res.status(500).json({
      erro: "Erro interno ao excluir roteiro.",
    });
  }
});

export default roteirosRouter;
