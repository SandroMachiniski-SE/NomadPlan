import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import { autenticar } from "../middleware/auth";
import { gerarRoteiroSugerido } from "../lib/recomendacao";

const roteirosRouter = Router();

const idSchema = z.coerce.number().int().positive();

const pontoResumoSelecao = {
  id: true,
  nome: true,
  descricao: true,
  categoria: true,
  cidade: true,
  endereco: true,
  latitude: true,
  longitude: true,
  faixaPreco: true,
  acessibilidade: true,
  siteOficial: true,
  telefoneContato: true,
  horarioFuncionamento: true,
  imagemUrl: true,
  seloVerificado: true,
} as const;

// Rota pública: precisa ficar registrada ANTES do `roteirosRouter.use(autenticar)"
// abaixo, já que esse middleware se aplica a toda rota definida depois dele.
roteirosRouter.get("/publico/:slug", async (req: Request, res: Response) => {
  try {
    const slug = z.string().min(1).safeParse(req.params.slug);

    if (!slug.success) {
      return res.status(400).json({ erro: "Link inválido." });
    }

    const roteiro = await prisma.roteiro.findFirst({
      where: { slugPublico: slug.data, publico: true },
      select: {
        id: true,
        nome: true,
        descricao: true,
        cidade: true,
        dataInicio: true,
        dataFim: true,
        dataCriacao: true,
        usuario: { select: { nome: true } },
        itens: {
          orderBy: { ordem: "asc" },
          select: {
            id: true,
            ordem: true,
            observacao: true,
            ponto: { select: pontoResumoSelecao },
          },
        },
      },
    });

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado ou não é público." });
    }

    return res.json(roteiro);
  } catch (error) {
    console.error("Erro ao buscar roteiro público:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar roteiro público." });
  }
});

roteirosRouter.use(autenticar);

const criarRoteiroSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(1000).optional(),
  cidade: z.string().trim().max(120).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

const atualizarRoteiroSchema = criarRoteiroSchema.partial();

const adicionarItemSchema = z.object({
  idPonto: z.coerce.number().int().positive(),
  ordem: z.coerce.number().int().min(0).optional(),
  observacao: z.string().trim().max(500).optional(),
});

const reordenarSchema = z.object({
  idsItensEmOrdem: z.array(z.coerce.number().int().positive()).min(1),
});

const gerarRoteiroSchema = z.object({
  cidade: z.string().trim().min(1).max(120),
  horasDisponiveis: z.coerce.number().positive().max(24).default(6),
  interesses: z.array(z.string().trim().min(1)).optional(),
  dataHoraInicio: z.coerce.date().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

async function buscarRoteiroDoUsuario(id: number, idUsuario: number) {
  return prisma.roteiro.findFirst({
    where: { id, idUsuario },
    select: { id: true },
  });
}

async function gerarSlugUnico(): Promise<string> {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const slug = randomBytes(6).toString("base64url");
    const existente = await prisma.roteiro.findUnique({ where: { slugPublico: slug } });

    if (!existente) {
      return slug;
    }
  }

  throw new Error("Não foi possível gerar um link único para o roteiro.");
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

roteirosRouter.post("/gerar", async (req: Request, res: Response) => {
  try {
    const resultado = gerarRoteiroSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados para geração do roteiro inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const dados = resultado.data;

    let interesses = dados.interesses;

    if (!interesses || interesses.length === 0) {
      const usuario = await prisma.usuario.findUnique({
        where: { id: req.usuario!.id },
        select: { interesses: true },
      });

      interesses = usuario?.interesses ?? [];
    }

    const { pontos, fallbackUsado } = await gerarRoteiroSugerido({
      cidade: dados.cidade,
      horasDisponiveis: dados.horasDisponiveis,
      interesses,
      dataHoraInicio: dados.dataHoraInicio ?? new Date(),
      latitude: dados.latitude,
      longitude: dados.longitude,
    });

    return res.json({ pontos, fallbackUsado });
  } catch (error) {
    console.error("Erro ao gerar roteiro sugerido:", error);

    return res.status(500).json({ erro: "Erro interno ao gerar roteiro sugerido." });
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
              select: pontoResumoSelecao,
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

roteirosRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = atualizarRoteiroSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados do roteiro inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const dados = resultado.data;

    if (dados.dataInicio && dados.dataFim && dados.dataFim < dados.dataInicio) {
      return res.status(400).json({
        erro: "A data final não pode ser anterior à data inicial.",
      });
    }

    const roteiroAtualizado = await prisma.roteiro.update({
      where: { id: id.data },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.descricao !== undefined ? { descricao: dados.descricao || null } : {}),
        ...(dados.cidade !== undefined ? { cidade: dados.cidade || null } : {}),
        ...(dados.dataInicio !== undefined ? { dataInicio: dados.dataInicio } : {}),
        ...(dados.dataFim !== undefined ? { dataFim: dados.dataFim } : {}),
      },
    });

    return res.json(roteiroAtualizado);
  } catch (error) {
    console.error("Erro ao atualizar roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao atualizar roteiro." });
  }
});

roteirosRouter.patch("/:id/compartilhar", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const habilitarSchema = z.object({ publico: z.boolean().default(true) });
    const resultado = habilitarSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Dados inválidos." });
    }

    const roteiro = await prisma.roteiro.findFirst({
      where: { id: id.data, idUsuario: req.usuario!.id },
    });

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    if (!resultado.data.publico) {
      const roteiroAtualizado = await prisma.roteiro.update({
        where: { id: id.data },
        data: { publico: false },
      });

      return res.json(roteiroAtualizado);
    }

    const slugPublico = roteiro.slugPublico ?? (await gerarSlugUnico());

    const roteiroAtualizado = await prisma.roteiro.update({
      where: { id: id.data },
      data: { publico: true, slugPublico },
    });

    return res.json(roteiroAtualizado);
  } catch (error) {
    console.error("Erro ao compartilhar roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao compartilhar roteiro." });
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

    let ordem = resultado.data.ordem;

    if (ordem === undefined) {
      const ultimoItem = await prisma.itemRoteiro.findFirst({
        where: { idRoteiro: idRoteiro.data },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });

      ordem = ultimoItem ? ultimoItem.ordem + 1 : 0;
    }

    const item = await prisma.itemRoteiro.create({
      data: {
        idRoteiro: idRoteiro.data,
        idPonto: resultado.data.idPonto,
        ordem,
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

roteirosRouter.post("/:id/itens/reordenar", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);

    if (!idRoteiro.success) {
      return res.status(400).json({ erro: "Identificador do roteiro inválido." });
    }

    const resultado = reordenarSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados de reordenação inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const roteiro = await buscarRoteiroDoUsuario(idRoteiro.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const itensAtuais = await prisma.itemRoteiro.findMany({
      where: { idRoteiro: idRoteiro.data },
      select: { id: true },
    });

    const idsValidos = new Set(itensAtuais.map((item) => item.id));
    const { idsItensEmOrdem } = resultado.data;

    const conjuntoRecebido = new Set(idsItensEmOrdem);
    const mesmosItens =
      conjuntoRecebido.size === idsValidos.size &&
      [...conjuntoRecebido].every((id) => idsValidos.has(id));

    if (!mesmosItens) {
      return res.status(400).json({
        erro: "A lista enviada precisa conter exatamente os itens atuais do roteiro.",
      });
    }

    await prisma.$transaction(
      idsItensEmOrdem.map((idItem, indice) =>
        prisma.itemRoteiro.update({
          where: { id: idItem },
          data: { ordem: indice },
        }),
      ),
    );

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao reordenar itens do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao reordenar itens do roteiro." });
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
