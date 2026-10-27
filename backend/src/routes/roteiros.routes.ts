import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import { StatusPonto } from "@prisma/client";
import { autenticar } from "../middleware/auth";
import { gerarRoteiroSugerido, inicioPadrao } from "../lib/recomendacao";
import { registrarAuditoria } from "../lib/auditoria";
import { registrarEvento } from "../lib/metricasUso";
import { ehViolacaoDeUnicidade } from "../lib/prismaErros";
import { registrarVersaoRoteiro, type DadosVersaoRoteiro } from "../lib/versionamentoRoteiro";
import { comTrechos, otimizarOrdem } from "../lib/trajeto";
import { resumirOrcamento } from "../lib/orcamento";

const roteirosRouter = Router();

const idSchema = z.coerce.number().int().positive();

// Quantos dias um roteiro pode ter.
const MAX_DIAS = 30;
const diaSchema = z.coerce.number().int().min(1).max(MAX_DIAS);
const ORDEM_DAS_PARADAS = [{ dia: "asc" }, { ordem: "asc" }] as const;

// Dinheiro sempre em centavos inteiros (até R$ 1.000.000,00).
const centavosSchema = z.coerce.number().int().min(0).max(100_000_000);
const MAX_ITENS_CHECKLIST = 100;

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
          orderBy: [...ORDEM_DAS_PARADAS],
          select: {
            id: true,
            dia: true,
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

    return res.json({ ...roteiro, itens: comTrechos(roteiro.itens) });
  } catch (error) {
    console.error("Erro ao buscar roteiro público:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar roteiro público." });
  }
});

roteirosRouter.use(autenticar);

const camposDoRoteiroSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(1000).optional(),
  cidade: z.string().trim().max(120).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

// Na criação o roteiro já pode vir com suas paradas (usado ao salvar um roteiro sugerido):
// tudo é gravado junto ou nada é.
const criarRoteiroSchema = camposDoRoteiroSchema.extend({
  pontos: z
    .array(
      z.object({
        idPonto: z.coerce.number().int().positive(),
        dia: diaSchema.optional(),
        observacao: z.string().trim().max(500).optional(),
        custoCentavos: centavosSchema.optional(),
      }),
    )
    .max(30)
    .optional(),
});

const atualizarRoteiroSchema = camposDoRoteiroSchema.partial();

const adicionarItemSchema = z.object({
  idPonto: z.coerce.number().int().positive(),
  ordem: z.coerce.number().int().min(0).optional(),
  dia: diaSchema.optional(),
  observacao: z.string().trim().max(500).optional(),
  custoCentavos: centavosSchema.optional(),
});

// Detalhes de uma parada: quem não for enviado não muda; null limpa o campo.
const detalhesDaParadaSchema = z
  .object({
    observacao: z.string().trim().max(500).nullable().optional(),
    custoCentavos: centavosSchema.nullable().optional(),
  })
  .refine((d) => d.observacao !== undefined || d.custoCentavos !== undefined, {
    message: "Informe a observação ou o custo.",
  });

const anotacoesSchema = z
  .object({
    notas: z.string().trim().max(5000).nullable().optional(),
    orcamentoCentavos: centavosSchema.nullable().optional(),
  })
  .refine((d) => d.notas !== undefined || d.orcamentoCentavos !== undefined, {
    message: "Informe as notas ou o orçamento.",
  });

const novoItemChecklistSchema = z.object({ texto: z.string().trim().min(1).max(200) });

const atualizarItemChecklistSchema = z
  .object({ texto: z.string().trim().min(1).max(200).optional(), feito: z.boolean().optional() })
  .refine((d) => d.texto !== undefined || d.feito !== undefined, { message: "Nada para atualizar." });

// Organização completa do roteiro: todas as paradas, na ordem desejada, cada uma com o seu dia.
const organizarSchema = z.object({
  itens: z
    .array(z.object({ id: z.coerce.number().int().positive(), dia: diaSchema }))
    .min(1)
    .max(200),
});

const otimizarSchema = z.object({ dia: diaSchema.optional() });

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

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { interesses: true, preferenciasAcessibilidade: true },
    });

    const interesses =
      dados.interesses && dados.interesses.length > 0 ? dados.interesses : (usuario?.interesses ?? []);

    // Sem horário de início informado, começa no próximo horário comercial: de madrugada
    // ou à noite quase tudo estaria fechado e o roteiro sairia vazio.
    const recomendacao = await gerarRoteiroSugerido({
      cidade: dados.cidade,
      horasDisponiveis: dados.horasDisponiveis,
      interesses,
      preferenciasAcessibilidade: usuario?.preferenciasAcessibilidade ?? [],
      dataHoraInicio: dados.dataHoraInicio ?? inicioPadrao(new Date()),
      latitude: dados.latitude,
      longitude: dados.longitude,
    });

    registrarEvento("roteiro_gerado");

    return res.json(recomendacao);
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
          orderBy: [...ORDEM_DAS_PARADAS],
          include: {
            ponto: {
              select: pontoResumoSelecao,
            },
          },
        },
        checklist: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
      },
    });

    if (!roteiro) {
      return res.status(404).json({
        erro: "Roteiro não encontrado.",
      });
    }

    return res.json({
      ...roteiro,
      itens: comTrechos(roteiro.itens),
      orcamento: resumirOrcamento(roteiro.itens, roteiro.orcamentoCentavos),
    });
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

    const paradas = dados.pontos ?? [];
    const idsPontos = [...new Set(paradas.map((p) => p.idPonto))];

    if (idsPontos.length !== paradas.length) {
      return res.status(400).json({ erro: "Há pontos repetidos na lista de paradas." });
    }

    if (idsPontos.length > 0) {
      const publicados = await prisma.pontoTuristico.count({
        where: { id: { in: idsPontos }, status: StatusPonto.PUBLICADO },
      });

      if (publicados !== idsPontos.length) {
        return res.status(404).json({ erro: "Um ou mais pontos não foram encontrados." });
      }
    }

    const roteiro = await prisma.roteiro.create({
      data: {
        nome: dados.nome,
        descricao: dados.descricao || null,
        cidade: dados.cidade || null,
        dataInicio: dados.dataInicio || null,
        dataFim: dados.dataFim || null,
        idUsuario: req.usuario!.id,
        itens: {
          create: paradas.map((parada, indice) => ({
            idPonto: parada.idPonto,
            dia: parada.dia ?? 1,
            ordem: indice,
            observacao: parada.observacao || null,
            custoCentavos: parada.custoCentavos ?? null,
          })),
        },
      },
      include: { itens: { orderBy: [...ORDEM_DAS_PARADAS] } },
    });

    registrarEvento("roteiro_criado");

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "criar",
      entidade: "roteiro",
      idEntidade: roteiro.id,
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

    const roteiro = await prisma.roteiro.findFirst({
      where: { id: id.data, idUsuario: req.usuario!.id },
      select: { id: true, dataInicio: true, dataFim: true },
    });

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const dados = resultado.data;

    // Confere o intervalo final (datas novas + as que já estavam salvas), não só o corpo.
    const inicioFinal = dados.dataInicio ?? roteiro.dataInicio;
    const fimFinal = dados.dataFim ?? roteiro.dataFim;

    if (inicioFinal && fimFinal && fimFinal < inicioFinal) {
      return res.status(400).json({
        erro: "A data final não pode ser anterior à data inicial.",
      });
    }

    const roteiroAtualizado = await prisma.$transaction(async (tx) => {
      await registrarVersaoRoteiro(id.data, "edicao", req.usuario!.id, tx);

      return tx.roteiro.update({
        where: { id: id.data },
        data: {
          ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
          ...(dados.descricao !== undefined ? { descricao: dados.descricao || null } : {}),
          ...(dados.cidade !== undefined ? { cidade: dados.cidade || null } : {}),
          ...(dados.dataInicio !== undefined ? { dataInicio: dados.dataInicio } : {}),
          ...(dados.dataFim !== undefined ? { dataFim: dados.dataFim } : {}),
        },
      });
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "atualizar",
      entidade: "roteiro",
      idEntidade: id.data,
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

    const slugPublico = resultado.data.publico ? (roteiro.slugPublico ?? (await gerarSlugUnico())) : undefined;

    const roteiroAtualizado = await prisma.roteiro.update({
      where: { id: id.data },
      data: resultado.data.publico ? { publico: true, slugPublico } : { publico: false },
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: resultado.data.publico ? "compartilhar" : "parar_de_compartilhar",
      entidade: "roteiro",
      idEntidade: id.data,
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

    const ultimoItem = await prisma.itemRoteiro.findFirst({
      where: { idRoteiro: idRoteiro.data },
      orderBy: [{ dia: "desc" }, { ordem: "desc" }],
      select: { ordem: true, dia: true },
    });

    // Sem dia informado, a parada entra no último dia do roteiro, ao final dele.
    const dia = resultado.data.dia ?? ultimoItem?.dia ?? 1;

    let ordem = resultado.data.ordem;

    if (ordem === undefined) {
      const maiorOrdem = await prisma.itemRoteiro.aggregate({
        where: { idRoteiro: idRoteiro.data },
        _max: { ordem: true },
      });

      ordem = (maiorOrdem._max.ordem ?? -1) + 1;
    }

    let item;

    try {
      item = await prisma.$transaction(async (tx) => {
        await registrarVersaoRoteiro(idRoteiro.data, "adicionar_ponto", req.usuario!.id, tx);

        return tx.itemRoteiro.create({
          data: {
            idRoteiro: idRoteiro.data,
            idPonto: resultado.data.idPonto,
            dia,
            ordem,
            observacao: resultado.data.observacao || null,
            custoCentavos: resultado.data.custoCentavos ?? null,
          },
          include: {
            ponto: true,
          },
        });
      });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        return res.status(409).json({ erro: "Este ponto já está no roteiro." });
      }

      throw erro;
    }

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "adicionar_ponto",
      entidade: "roteiro",
      idEntidade: idRoteiro.data,
      detalhes: { idPonto: resultado.data.idPonto },
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

    await prisma.$transaction(async (tx) => {
      await registrarVersaoRoteiro(idRoteiro.data, "reordenar", req.usuario!.id, tx);

      for (const [indice, idItem] of idsItensEmOrdem.entries()) {
        await tx.itemRoteiro.update({ where: { id: idItem }, data: { ordem: indice } });
      }
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao reordenar itens do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao reordenar itens do roteiro." });
  }
});

// Organiza o roteiro de uma vez: a lista traz TODAS as paradas, na ordem desejada, cada uma
// com o seu dia. Serve para mover uma parada de dia, subir/descer e reorganizar.
roteirosRouter.put("/:id/itens/organizar", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);

    if (!idRoteiro.success) {
      return res.status(400).json({ erro: "Identificador do roteiro inválido." });
    }

    const resultado = organizarSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Dados de organização inválidos.", detalhes: resultado.error.flatten() });
    }

    const roteiro = await buscarRoteiroDoUsuario(idRoteiro.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const itensAtuais = await prisma.itemRoteiro.findMany({
      where: { idRoteiro: idRoteiro.data },
      select: { id: true },
    });

    const idsRecebidos = resultado.data.itens.map((item) => item.id);
    const idsValidos = new Set(itensAtuais.map((item) => item.id));

    if (
      new Set(idsRecebidos).size !== idsRecebidos.length ||
      idsRecebidos.length !== idsValidos.size ||
      !idsRecebidos.every((id) => idsValidos.has(id))
    ) {
      return res.status(400).json({
        erro: "A lista enviada precisa conter exatamente os itens atuais do roteiro, sem repetir nenhum.",
      });
    }

    // A ordem vale dentro de cada dia: agrupa por dia mantendo a ordem recebida.
    const emOrdem = [...resultado.data.itens].sort((a, b) => a.dia - b.dia);

    await prisma.$transaction(async (tx) => {
      await registrarVersaoRoteiro(idRoteiro.data, "organizar", req.usuario!.id, tx);

      for (const [indice, item] of emOrdem.entries()) {
        await tx.itemRoteiro.update({ where: { id: item.id }, data: { dia: item.dia, ordem: indice } });
      }
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao organizar o roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao organizar o roteiro." });
  }
});

// Reordena as paradas para encurtar o percurso (um dia ou todos). A primeira parada de cada
// dia é a partida e não muda de lugar. Só grava se algum dia realmente melhorar.
roteirosRouter.post("/:id/otimizar", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);

    if (!idRoteiro.success) {
      return res.status(400).json({ erro: "Identificador do roteiro inválido." });
    }

    const resultado = otimizarSchema.safeParse(req.body ?? {});

    if (!resultado.success) {
      return res.status(400).json({ erro: "Dia inválido." });
    }

    const roteiro = await buscarRoteiroDoUsuario(idRoteiro.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const itens = await prisma.itemRoteiro.findMany({
      where: { idRoteiro: idRoteiro.data },
      orderBy: [...ORDEM_DAS_PARADAS],
      select: { id: true, dia: true, ponto: { select: { id: true, latitude: true, longitude: true } } },
    });

    const dias = [...new Set(itens.map((item) => item.dia))].filter(
      (dia) => resultado.data.dia === undefined || dia === resultado.data.dia,
    );

    if (resultado.data.dia !== undefined && dias.length === 0) {
      return res.status(404).json({ erro: "Esse dia não tem paradas." });
    }

    const resumo: { dia: number; alterado: boolean; metrosAntes: number; metrosDepois: number }[] = [];
    const novaOrdemPorDia = new Map<number, number[]>();

    for (const dia of dias) {
      const doDia = itens.filter((item) => item.dia === dia);
      const otimizado = otimizarOrdem(
        doDia.map((item) => ({ id: item.id, latitude: item.ponto.latitude, longitude: item.ponto.longitude })),
      );
      const alterado = otimizado.ids.some((id, i) => id !== doDia[i].id);

      resumo.push({ dia, alterado, metrosAntes: otimizado.metrosAntes, metrosDepois: otimizado.metrosDepois });

      if (alterado) {
        novaOrdemPorDia.set(dia, otimizado.ids);
      }
    }

    if (novaOrdemPorDia.size > 0) {
      await prisma.$transaction(async (tx) => {
        await registrarVersaoRoteiro(idRoteiro.data, "otimizar", req.usuario!.id, tx);

        // Reescreve a ordem global mantendo os dias, com as paradas dos dias otimizados reordenadas.
        const idsPorDia = new Map<number, number[]>();

        for (const item of itens) {
          idsPorDia.set(item.dia, idsPorDia.get(item.dia) ?? []);
          idsPorDia.get(item.dia)!.push(item.id);
        }

        let ordem = 0;

        for (const dia of [...idsPorDia.keys()].sort((a, b) => a - b)) {
          for (const id of novaOrdemPorDia.get(dia) ?? idsPorDia.get(dia)!) {
            await tx.itemRoteiro.update({ where: { id }, data: { ordem } });
            ordem += 1;
          }
        }
      });

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "otimizar_roteiro",
        entidade: "roteiro",
        idEntidade: idRoteiro.data,
      });
    }

    return res.json({ alterado: novaOrdemPorDia.size > 0, dias: resumo });
  } catch (error) {
    console.error("Erro ao otimizar o roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao otimizar o roteiro." });
  }
});

// Observação e custo previsto de uma parada. Não entra no histórico de versões (editar um
// valor é frequente e encheria o histórico); o retrato seguinte já guarda o valor novo.
roteirosRouter.patch("/:id/itens/:idItem", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);
    const idItem = idSchema.safeParse(req.params.idItem);

    if (!idRoteiro.success || !idItem.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = detalhesDaParadaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Dados da parada inválidos.", detalhes: resultado.error.flatten() });
    }

    const roteiro = await buscarRoteiroDoUsuario(idRoteiro.data, req.usuario!.id);
    const item = roteiro
      ? await prisma.itemRoteiro.findFirst({ where: { id: idItem.data, idRoteiro: idRoteiro.data }, select: { id: true } })
      : null;

    if (!roteiro || !item) {
      return res.status(404).json({ erro: "Parada não encontrada neste roteiro." });
    }

    const { observacao, custoCentavos } = resultado.data;

    const atualizado = await prisma.itemRoteiro.update({
      where: { id: item.id },
      data: {
        ...(observacao !== undefined ? { observacao: observacao || null } : {}),
        ...(custoCentavos !== undefined ? { custoCentavos } : {}),
      },
    });

    return res.json(atualizado);
  } catch (error) {
    console.error("Erro ao atualizar parada do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao atualizar a parada." });
  }
});

// Notas livres e teto de gastos do roteiro (só o dono vê). Também fora do histórico de versões.
roteirosRouter.patch("/:id/anotacoes", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = anotacoesSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Dados inválidos.", detalhes: resultado.error.flatten() });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const { notas, orcamentoCentavos } = resultado.data;

    const atualizado = await prisma.roteiro.update({
      where: { id: id.data },
      data: {
        ...(notas !== undefined ? { notas: notas || null } : {}),
        ...(orcamentoCentavos !== undefined ? { orcamentoCentavos } : {}),
      },
      select: { id: true, notas: true, orcamentoCentavos: true },
    });

    return res.json(atualizado);
  } catch (error) {
    console.error("Erro ao salvar anotações do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao salvar as anotações." });
  }
});

// Checklist do roteiro (bagagem, documentos, reservas a fazer...).
roteirosRouter.post("/:id/checklist", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = novoItemChecklistSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Informe o texto do item (até 200 caracteres)." });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const total = await prisma.itemChecklist.count({ where: { idRoteiro: id.data } });

    if (total >= MAX_ITENS_CHECKLIST) {
      return res.status(409).json({ erro: `A checklist comporta até ${MAX_ITENS_CHECKLIST} itens.` });
    }

    const maior = await prisma.itemChecklist.aggregate({ where: { idRoteiro: id.data }, _max: { ordem: true } });

    const item = await prisma.itemChecklist.create({
      data: { idRoteiro: id.data, texto: resultado.data.texto, ordem: (maior._max.ordem ?? -1) + 1 },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error("Erro ao adicionar item à checklist:", error);

    return res.status(500).json({ erro: "Erro interno ao adicionar o item." });
  }
});

roteirosRouter.patch("/:id/checklist/:idItem", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    const idItem = idSchema.safeParse(req.params.idItem);

    if (!id.success || !idItem.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = atualizarItemChecklistSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Dados do item inválidos." });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);
    const item = roteiro
      ? await prisma.itemChecklist.findFirst({ where: { id: idItem.data, idRoteiro: id.data }, select: { id: true } })
      : null;

    if (!roteiro || !item) {
      return res.status(404).json({ erro: "Item não encontrado." });
    }

    const atualizado = await prisma.itemChecklist.update({ where: { id: item.id }, data: resultado.data });

    return res.json(atualizado);
  } catch (error) {
    console.error("Erro ao atualizar item da checklist:", error);

    return res.status(500).json({ erro: "Erro interno ao atualizar o item." });
  }
});

roteirosRouter.delete("/:id/checklist/:idItem", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    const idItem = idSchema.safeParse(req.params.idItem);

    if (!id.success || !idItem.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);
    const removidos = roteiro
      ? await prisma.itemChecklist.deleteMany({ where: { id: idItem.data, idRoteiro: id.data } })
      : { count: 0 };

    if (!roteiro || removidos.count === 0) {
      return res.status(404).json({ erro: "Item não encontrado." });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao remover item da checklist:", error);

    return res.status(500).json({ erro: "Erro interno ao remover o item." });
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

    await prisma.$transaction(async (tx) => {
      await registrarVersaoRoteiro(idRoteiro.data, "remover_ponto", req.usuario!.id, tx);
      await tx.itemRoteiro.delete({ where: { id: item.id } });
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "remover_ponto",
      entidade: "roteiro",
      idEntidade: idRoteiro.data,
      detalhes: { idPonto: idPonto.data },
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

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "excluir",
      entidade: "roteiro",
      idEntidade: id.data,
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir roteiro:", error);

    return res.status(500).json({
      erro: "Erro interno ao excluir roteiro.",
    });
  }
});

// RF26: histórico de versões do roteiro e restauração.
roteirosRouter.get("/:id/versoes", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const versoes = await prisma.versaoRoteiro.findMany({
      where: { idRoteiro: id.data },
      orderBy: { id: "desc" },
    });

    return res.json({ total: versoes.length, dados: versoes });
  } catch (error) {
    console.error("Erro ao listar versões do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao listar versões do roteiro." });
  }
});

roteirosRouter.post("/:id/versoes/:versaoId/restaurar", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    const versaoId = idSchema.safeParse(req.params.versaoId);

    if (!id.success || !versaoId.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const roteiro = await buscarRoteiroDoUsuario(id.data, req.usuario!.id);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const versao = await prisma.versaoRoteiro.findFirst({
      where: { id: versaoId.data, idRoteiro: id.data },
    });

    if (!versao) {
      return res.status(404).json({ erro: "Versão não encontrada." });
    }

    const dados = versao.dados as unknown as DadosVersaoRoteiro;

    // Pontos que deixaram de estar publicados desde então não voltam para o roteiro.
    const disponiveis = new Set(
      (
        await prisma.pontoTuristico.findMany({
          where: { id: { in: dados.itens.map((i) => i.idPonto) }, status: StatusPonto.PUBLICADO },
          select: { id: true },
        })
      ).map((p) => p.id),
    );

    const itensRestaurados = dados.itens.filter((item) => disponiveis.has(item.idPonto));

    await prisma.$transaction(async (tx) => {
      await registrarVersaoRoteiro(id.data, "antes_de_restaurar", req.usuario!.id, tx);

      await tx.roteiro.update({
        where: { id: id.data },
        data: {
          nome: dados.nome,
          descricao: dados.descricao,
          cidade: dados.cidade,
          dataInicio: dados.dataInicio ? new Date(dados.dataInicio) : null,
          dataFim: dados.dataFim ? new Date(dados.dataFim) : null,
        },
      });

      await tx.itemRoteiro.deleteMany({ where: { idRoteiro: id.data } });

      await tx.itemRoteiro.createMany({
        data: itensRestaurados.map((item, indice) => ({
          idRoteiro: id.data,
          idPonto: item.idPonto,
          dia: item.dia ?? 1,
          ordem: indice,
          observacao: item.observacao,
          custoCentavos: item.custoCentavos ?? null,
        })),
      });
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "restaurar_versao",
      entidade: "roteiro",
      idEntidade: id.data,
      detalhes: { versaoRestaurada: versaoId.data },
    });

    const restaurado = await prisma.roteiro.findUnique({
      where: { id: id.data },
      include: { itens: { orderBy: { ordem: "asc" }, include: { ponto: { select: pontoResumoSelecao } } } },
    });

    return res.json({ roteiro: restaurado, pontosIndisponiveis: dados.itens.length - itensRestaurados.length });
  } catch (error) {
    console.error("Erro ao restaurar versão do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao restaurar versão do roteiro." });
  }
});

export default roteirosRouter;
