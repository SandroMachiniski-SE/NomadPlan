import { Router, Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import { StatusPonto } from "@prisma/client";
import { autenticar } from "../middleware/auth";
import { gerarRoteiroSugerido, inicioPadrao, MAX_DIAS_GERADOS } from "../lib/recomendacao";
import { registrarAuditoria } from "../lib/auditoria";
import { registrarEvento } from "../lib/metricasUso";
import { ehViolacaoDeUnicidade } from "../lib/prismaErros";
import { registrarVersaoRoteiro, type DadosVersaoRoteiro } from "../lib/versionamentoRoteiro";
import { cidadesDosItens, comTrechos, otimizarOrdem, viagensEntreDias } from "../lib/trajeto";
import { resumirOrcamento } from "../lib/orcamento";
import { MAX_PARTICIPANTES, nivelExigido, papelNoRoteiro, papelPermite, type Papel } from "../lib/colaboracao";
import { criarNotificacao } from "../lib/notificacoes";
import { enviarEmailConvite } from "../lib/email";

const roteirosRouter = Router();

const idSchema = z.coerce.number().int().positive();

// Quantos dias um roteiro pode ter.
const MAX_DIAS = 30;
const diaSchema = z.coerce.number().int().min(1).max(MAX_DIAS);
// A pernoite fecha o dia, qualquer que seja a ordem gravada.
const ORDEM_DAS_PARADAS = [{ dia: "asc" }, { pernoite: "asc" }, { ordem: "asc" }] as const;

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

    return res.json({
      ...roteiro,
      itens: comTrechos(roteiro.itens),
      cidades: cidadesDosItens(roteiro.itens),
      viagensEntreDias: viagensEntreDias(roteiro.itens),
    });
  } catch (error) {
    console.error("Erro ao buscar roteiro público:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar roteiro público." });
  }
});

roteirosRouter.use(autenticar);

// Acesso a /roteiros/:id/...: confere se a pessoa participa do roteiro (dono ou convidado) e
// se o papel dela basta para a operação pedida. Quem não participa recebe 404, como se o
// roteiro não existisse; quem participa sem permissão recebe 403.
roteirosRouter.use("/:id(\\d+)", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const papel = id > 2_147_483_647 ? null : await papelNoRoteiro(id, req.usuario!.id);

    if (!papel) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const nivel = nivelExigido(req.method, req.path);

    if (!papelPermite(papel, nivel)) {
      return res.status(403).json({
        erro: nivel === "dono" ? "Só o dono do roteiro pode fazer isso." : "Você só pode visualizar este roteiro.",
      });
    }

    res.locals.papelNoRoteiro = papel;

    return next();
  } catch (error) {
    console.error("Erro ao conferir o acesso ao roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao conferir o acesso ao roteiro." });
  }
});

const camposDoRoteiroSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(1000).optional(),
  cidade: z.string().trim().max(120).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});

const periodoSchema = z.enum(["MANHA", "TARDE", "NOITE", "DIA_INTEIRO"]);
const tituloSchema = z.string().trim().min(1).max(160);

// Uma parada é um ponto cadastrado ou uma atividade livre ("Rolê pelo centro", "Dia livre").
const camposDaParadaSchema = z.object({
  idPonto: z.coerce.number().int().positive().optional(),
  titulo: tituloSchema.optional(),
  dia: diaSchema.optional(),
  periodo: periodoSchema.optional(),
  // Onde se dorme nessa noite (um hotel do banco ou um texto, como "Acampamento na serra").
  pernoite: z.boolean().optional(),
  observacao: z.string().trim().max(500).optional(),
  custoCentavos: centavosSchema.optional(),
});

const pontoOuTitulo = (parada: { idPonto?: number; titulo?: string }) => parada.idPonto !== undefined || !!parada.titulo;
const MENSAGEM_PONTO_OU_TITULO = { message: "Informe o ponto turístico ou o título da atividade." };

// Na criação o roteiro já pode vir com suas paradas (usado ao salvar um roteiro sugerido):
// tudo é gravado junto ou nada é.
const criarRoteiroSchema = camposDoRoteiroSchema.extend({
  pontos: z.array(camposDaParadaSchema.refine(pontoOuTitulo, MENSAGEM_PONTO_OU_TITULO)).max(120).optional(),
});

const atualizarRoteiroSchema = camposDoRoteiroSchema.partial();

const adicionarItemSchema = camposDaParadaSchema
  .extend({ ordem: z.coerce.number().int().min(0).optional() })
  .refine(pontoOuTitulo, MENSAGEM_PONTO_OU_TITULO);

// Detalhes de uma parada: quem não for enviado não muda; null limpa o campo. O título só vale
// para atividades livres (um ponto cadastrado já tem nome).
const detalhesDaParadaSchema = z
  .object({
    observacao: z.string().trim().max(500).nullable().optional(),
    custoCentavos: centavosSchema.nullable().optional(),
    titulo: tituloSchema.optional(),
    periodo: periodoSchema.nullable().optional(),
    pernoite: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: "Nada para atualizar." });

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

const gerarRoteiroSchema = z
  .object({
    cidade: z.string().trim().min(1).max(120).optional(),
    // Viagem por várias cidades: "Joinville, 2 dias → Blumenau, 1 dia".
    etapas: z
      .array(z.object({ cidade: z.string().trim().min(1).max(120), dias: z.coerce.number().int().min(1).max(MAX_DIAS_GERADOS) }))
      .min(1)
      .max(6)
      .optional(),
    // Horas de passeio por dia.
    horasDisponiveis: z.coerce.number().positive().max(24).default(6),
    interesses: z.array(z.string().trim().min(1)).optional(),
    dataHoraInicio: z.coerce.date().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((d) => d.cidade || (d.etapas && d.etapas.length > 0), { message: "Informe a cidade ou as etapas da viagem." })
  .refine((d) => !d.etapas || d.etapas.reduce((soma, e) => soma + e.dias, 0) <= MAX_DIAS_GERADOS, {
    message: `O roteiro gerado tem no máximo ${MAX_DIAS_GERADOS} dias.`,
  });

// A participação (e o nível de acesso) de quem chama já foi conferida pelo middleware de
// "/:id" mais abaixo; aqui só se confirma que o roteiro existe.
async function buscarRoteiro(id: number) {
  return prisma.roteiro.findUnique({
    where: { id },
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
    const idUsuario = req.usuario!.id;

    const roteiros = await prisma.roteiro.findMany({
      where: { OR: [{ idUsuario }, { colaboradores: { some: { idUsuario } } }] },
      orderBy: {
        dataAtualizacao: "desc",
      },
      include: {
        _count: {
          select: {
            itens: true,
          },
        },
        usuario: { select: { id: true, nome: true } },
        colaboradores: { where: { idUsuario }, select: { papel: true } },
        itens: { orderBy: [...ORDEM_DAS_PARADAS], select: { dia: true, ponto: { select: { id: true, cidade: true, latitude: true, longitude: true } } } },
      },
    });

    return res.json({
      total: roteiros.length,
      dados: roteiros.map(({ colaboradores, itens, notas: _notas, orcamentoCentavos: _orcamento, ...roteiro }) => ({
        ...roteiro,
        cidades: cidadesDosItens(itens),
        meuPapel: roteiro.idUsuario === idUsuario ? "DONO" : (colaboradores[0]?.papel ?? "LEITOR"),
      })),
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
      cidade: dados.cidade ?? dados.etapas![0].cidade,
      etapas: dados.etapas,
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

    const roteiro = await prisma.roteiro.findUnique({
      where: { id: id.data },
      include: {
        usuario: { select: { id: true, nome: true } },
        colaboradores: {
          orderBy: { id: "asc" },
          select: { idUsuario: true, papel: true, usuario: { select: { nome: true } } },
        },
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
      meuPapel: res.locals.papelNoRoteiro as Papel,
      colaboradores: roteiro.colaboradores.map((c) => ({ idUsuario: c.idUsuario, nome: c.usuario.nome, papel: c.papel })),
      itens: comTrechos(roteiro.itens),
      cidades: cidadesDosItens(roteiro.itens),
      viagensEntreDias: viagensEntreDias(roteiro.itens),
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
    // O mesmo hotel pode ser a pernoite de várias noites; como visita, cada ponto entra uma vez.
    const comPonto = paradas.flatMap((p) => (p.idPonto === undefined || p.pernoite ? [] : [p.idPonto]));
    const idsPontos = [...new Set(comPonto)];

    if (idsPontos.length !== comPonto.length) {
      return res.status(400).json({ erro: "Há pontos repetidos na lista de paradas." });
    }

    const diasComPernoite = paradas.filter((p) => p.pernoite).map((p) => p.dia ?? 1);

    if (new Set(diasComPernoite).size !== diasComPernoite.length) {
      return res.status(400).json({ erro: "Cada dia tem uma só pernoite." });
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
            idPonto: parada.idPonto ?? null,
            titulo: parada.idPonto === undefined ? (parada.titulo ?? null) : null,
            dia: parada.dia ?? 1,
            ordem: indice,
            periodo: parada.periodo ?? null,
            pernoite: parada.pernoite ?? false,
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

    const roteiro = await prisma.roteiro.findUnique({
      where: { id: id.data },
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

    const roteiro = await prisma.roteiro.findUnique({ where: { id: id.data } });

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

    const roteiro = await buscarRoteiro(idRoteiro.data);

    if (!roteiro) {
      return res.status(404).json({
        erro: "Roteiro não encontrado.",
      });
    }

    const { idPonto, titulo, periodo, pernoite } = resultado.data;

    if (idPonto !== undefined) {
      const ponto = await prisma.pontoTuristico.findFirst({
        where: { id: idPonto, status: "PUBLICADO" },
        select: { id: true },
      });

      if (!ponto) {
        return res.status(404).json({
          erro: "Ponto turístico não encontrado.",
        });
      }
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
        await registrarVersaoRoteiro(idRoteiro.data, idPonto !== undefined ? "adicionar_ponto" : "adicionar_atividade", req.usuario!.id, tx);

        // A nova pernoite do dia substitui a anterior (há uma só por noite).
        if (pernoite) {
          await tx.itemRoteiro.updateMany({ where: { idRoteiro: idRoteiro.data, dia, pernoite: true }, data: { pernoite: false } });
        }

        return tx.itemRoteiro.create({
          data: {
            idRoteiro: idRoteiro.data,
            idPonto: idPonto ?? null,
            titulo: idPonto === undefined ? (titulo ?? null) : null,
            dia,
            ordem,
            periodo: periodo ?? null,
            pernoite: pernoite ?? false,
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
      acao: idPonto !== undefined ? "adicionar_ponto" : "adicionar_atividade",
      entidade: "roteiro",
      idEntidade: idRoteiro.data,
      detalhes: idPonto !== undefined ? { idPonto } : { titulo },
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

    const roteiro = await buscarRoteiro(idRoteiro.data);

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

    const roteiro = await buscarRoteiro(idRoteiro.data);

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

    const roteiro = await buscarRoteiro(idRoteiro.data);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const itens = await prisma.itemRoteiro.findMany({
      where: { idRoteiro: idRoteiro.data },
      orderBy: [...ORDEM_DAS_PARADAS],
      select: { id: true, dia: true, pernoite: true, ponto: { select: { id: true, latitude: true, longitude: true } } },
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
      // A pernoite não entra na otimização: continua fechando o dia.
      const doDia = itens.filter((item) => item.dia === dia && !item.pernoite);
      const pernoites = itens.filter((item) => item.dia === dia && item.pernoite).map((item) => item.id);
      const otimizado = otimizarOrdem(
        doDia.map((item) => ({ id: item.id, latitude: item.ponto?.latitude ?? null, longitude: item.ponto?.longitude ?? null })),
      );
      otimizado.ids.push(...pernoites);
      const alterado = otimizado.ids.some((id, i) => id !== [...doDia.map((item) => item.id), ...pernoites][i]);

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

    const roteiro = await buscarRoteiro(idRoteiro.data);
    const item = roteiro
      ? await prisma.itemRoteiro.findFirst({
          where: { id: idItem.data, idRoteiro: idRoteiro.data },
          select: { id: true, dia: true, idPonto: true },
        })
      : null;

    if (!roteiro || !item) {
      return res.status(404).json({ erro: "Parada não encontrada neste roteiro." });
    }

    const { observacao, custoCentavos, titulo, periodo, pernoite } = resultado.data;

    if (titulo !== undefined && item.idPonto !== null) {
      return res.status(400).json({ erro: "Só atividades livres têm título; um ponto cadastrado usa o próprio nome." });
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      if (pernoite) {
        await tx.itemRoteiro.updateMany({
          where: { idRoteiro: idRoteiro.data, dia: item.dia, pernoite: true, id: { not: item.id } },
          data: { pernoite: false },
        });
      }

      return tx.itemRoteiro.update({
        where: { id: item.id },
        data: {
          ...(observacao !== undefined ? { observacao: observacao || null } : {}),
          ...(custoCentavos !== undefined ? { custoCentavos } : {}),
          ...(titulo !== undefined ? { titulo } : {}),
          ...(periodo !== undefined ? { periodo } : {}),
          ...(pernoite !== undefined ? { pernoite } : {}),
        },
      });
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

    const roteiro = await buscarRoteiro(id.data);

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

    const roteiro = await buscarRoteiro(id.data);

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

    const roteiro = await buscarRoteiro(id.data);
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

    const roteiro = await buscarRoteiro(id.data);
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

// ---------- Colaboração: convites e participantes ----------

const conviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  papel: z.enum(["EDITOR", "LEITOR"]),
});

const papelSchema = z.object({ papel: z.enum(["EDITOR", "LEITOR"]) });

// Convites pendentes (com e-mail): só o dono vê.
roteirosRouter.get("/:id/convites", async (req: Request, res: Response) => {
  try {
    const id = idSchema.parse(req.params.id);

    const convites = await prisma.conviteRoteiro.findMany({
      where: { idRoteiro: id },
      orderBy: { id: "asc" },
      select: { id: true, email: true, papel: true, dataCriacao: true },
    });

    return res.json({ total: convites.length, dados: convites });
  } catch (error) {
    console.error("Erro ao listar convites do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao listar os convites." });
  }
});

roteirosRouter.post("/:id/convites", async (req: Request, res: Response) => {
  try {
    const id = idSchema.parse(req.params.id);
    const resultado = conviteSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Informe um e-mail válido e o papel (EDITOR ou LEITOR)." });
    }

    const { email, papel } = resultado.data;
    const idDono = req.usuario!.id;

    const [roteiro, dono, convidado, participantes, convitesPendentes] = await Promise.all([
      prisma.roteiro.findUniqueOrThrow({ where: { id }, select: { id: true, nome: true } }),
      prisma.usuario.findUniqueOrThrow({ where: { id: idDono }, select: { nome: true, email: true } }),
      prisma.usuario.findUnique({ where: { email }, select: { id: true, ativo: true } }),
      prisma.colaboradorRoteiro.count({ where: { idRoteiro: id } }),
      prisma.conviteRoteiro.count({ where: { idRoteiro: id } }),
    ]);

    if (email === dono.email) {
      return res.status(400).json({ erro: "Você já é o dono deste roteiro." });
    }

    if (participantes + convitesPendentes >= MAX_PARTICIPANTES) {
      return res.status(409).json({ erro: `Um roteiro comporta até ${MAX_PARTICIPANTES} convidados.` });
    }

    if (convidado) {
      const jaParticipa = await prisma.colaboradorRoteiro.findUnique({
        where: { idRoteiro_idUsuario: { idRoteiro: id, idUsuario: convidado.id } },
        select: { id: true },
      });

      if (jaParticipa) {
        return res.status(409).json({ erro: "Esta pessoa já participa do roteiro." });
      }
    }

    let convite;

    try {
      convite = await prisma.conviteRoteiro.create({
        data: { idRoteiro: id, email, papel, idConvidante: idDono },
        select: { id: true, email: true, papel: true, dataCriacao: true },
      });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        return res.status(409).json({ erro: "Já existe um convite pendente para este e-mail." });
      }

      throw erro;
    }

    const temConta = Boolean(convidado?.ativo);

    if (convidado?.ativo) {
      await criarNotificacao(convidado.id, `${dono.nome} convidou você para o roteiro "${roteiro.nome}".`, "/convites");
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // Não se espera o envio: o SMTP é lento e a resposta não deve depender dele.
    enviarEmailConvite({
      para: email,
      nomeConvidante: dono.nome,
      nomeRoteiro: roteiro.nome,
      papel,
      link: `${frontendUrl}/convites`,
      temConta,
    }).catch((erro) => console.error("Falha ao enviar e-mail de convite:", erro));

    await registrarAuditoria({
      idUsuario: idDono,
      acao: "convidar_colaborador",
      entidade: "roteiro",
      idEntidade: id,
      detalhes: { papel },
    });

    return res.status(201).json(convite);
  } catch (error) {
    console.error("Erro ao convidar para o roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao enviar o convite." });
  }
});

roteirosRouter.delete("/:id/convites/:idConvite", async (req: Request, res: Response) => {
  try {
    const id = idSchema.parse(req.params.id);
    const idConvite = idSchema.safeParse(req.params.idConvite);

    if (!idConvite.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const removidos = await prisma.conviteRoteiro.deleteMany({ where: { id: idConvite.data, idRoteiro: id } });

    if (removidos.count === 0) {
      return res.status(404).json({ erro: "Convite não encontrado." });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao cancelar convite:", error);

    return res.status(500).json({ erro: "Erro interno ao cancelar o convite." });
  }
});

roteirosRouter.patch("/:id/colaboradores/:idUsuario", async (req: Request, res: Response) => {
  try {
    const id = idSchema.parse(req.params.id);
    const idUsuario = idSchema.safeParse(req.params.idUsuario);
    const resultado = papelSchema.safeParse(req.body);

    if (!idUsuario.success || !resultado.success) {
      return res.status(400).json({ erro: "Informe o papel (EDITOR ou LEITOR)." });
    }

    if (res.locals.papelNoRoteiro !== "DONO") {
      return res.status(403).json({ erro: "Só o dono do roteiro pode fazer isso." });
    }

    const atualizados = await prisma.colaboradorRoteiro.updateMany({
      where: { idRoteiro: id, idUsuario: idUsuario.data },
      data: { papel: resultado.data.papel },
    });

    if (atualizados.count === 0) {
      return res.status(404).json({ erro: "Participante não encontrado." });
    }

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "alterar_papel_colaborador",
      entidade: "roteiro",
      idEntidade: id,
      detalhes: { idColaborador: idUsuario.data, papel: resultado.data.papel },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao alterar o papel do participante:", error);

    return res.status(500).json({ erro: "Erro interno ao alterar o papel." });
  }
});

// O dono remove qualquer participante; cada participante pode remover a si mesmo (sair).
roteirosRouter.delete("/:id/colaboradores/:idUsuario", async (req: Request, res: Response) => {
  try {
    const id = idSchema.parse(req.params.id);
    const idUsuario = idSchema.safeParse(req.params.idUsuario);

    if (!idUsuario.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const saindo = idUsuario.data === req.usuario!.id;

    if (res.locals.papelNoRoteiro !== "DONO" && !saindo) {
      return res.status(403).json({ erro: "Só o dono do roteiro pode fazer isso." });
    }

    const removidos = await prisma.colaboradorRoteiro.deleteMany({ where: { idRoteiro: id, idUsuario: idUsuario.data } });

    if (removidos.count === 0) {
      return res.status(404).json({ erro: "Participante não encontrado." });
    }

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: saindo ? "sair_do_roteiro" : "remover_colaborador",
      entidade: "roteiro",
      idEntidade: id,
      detalhes: { idColaborador: idUsuario.data },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao remover participante:", error);

    return res.status(500).json({ erro: "Erro interno ao remover o participante." });
  }
});

// Remove uma parada pelo id dela: vale também para atividades livres e pernoites, que não têm
// ponto. (A rota abaixo, pelo id do ponto, continua para quem já a usa.)
roteirosRouter.delete("/:id/paradas/:idItem", async (req: Request, res: Response) => {
  try {
    const idRoteiro = idSchema.safeParse(req.params.id);
    const idItem = idSchema.safeParse(req.params.idItem);

    if (!idRoteiro.success || !idItem.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const item = await prisma.itemRoteiro.findFirst({ where: { id: idItem.data, idRoteiro: idRoteiro.data } });

    if (!item) {
      return res.status(404).json({ erro: "Parada não encontrada neste roteiro." });
    }

    await prisma.$transaction(async (tx) => {
      await registrarVersaoRoteiro(idRoteiro.data, item.idPonto !== null ? "remover_ponto" : "remover_atividade", req.usuario!.id, tx);
      await tx.itemRoteiro.delete({ where: { id: item.id } });
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: item.idPonto !== null ? "remover_ponto" : "remover_atividade",
      entidade: "roteiro",
      idEntidade: idRoteiro.data,
      detalhes: item.idPonto !== null ? { idPonto: item.idPonto } : { titulo: item.titulo },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao remover parada do roteiro:", error);

    return res.status(500).json({ erro: "Erro interno ao remover a parada." });
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

    const roteiro = await buscarRoteiro(idRoteiro.data);

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

    const roteiro = await buscarRoteiro(id.data);

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

    const roteiro = await buscarRoteiro(id.data);

    if (!roteiro) {
      return res.status(404).json({ erro: "Roteiro não encontrado." });
    }

    const versoes = await prisma.versaoRoteiro.findMany({
      where: { idRoteiro: id.data },
      orderBy: { id: "desc" },
    });

    const idsAutores = [...new Set(versoes.map((v) => v.idAutor).filter((a): a is number => a !== null))];
    const autores = await prisma.usuario.findMany({ where: { id: { in: idsAutores } }, select: { id: true, nome: true } });
    const nomePorId = new Map(autores.map((a) => [a.id, a.nome]));

    return res.json({
      total: versoes.length,
      dados: versoes.map((v) => ({ ...v, autor: v.idAutor !== null ? (nomePorId.get(v.idAutor) ?? null) : null })),
    });
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

    const roteiro = await buscarRoteiro(id.data);

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
          where: {
            id: { in: dados.itens.flatMap((i) => (i.idPonto === null ? [] : [i.idPonto])) },
            status: StatusPonto.PUBLICADO,
          },
          select: { id: true },
        })
      ).map((p) => p.id),
    );

    // Atividades livres (sem ponto) sempre voltam.
    const itensRestaurados = dados.itens.filter((item) => item.idPonto === null || disponiveis.has(item.idPonto));

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
          titulo: item.titulo ?? null,
          periodo: item.periodo ?? null,
          pernoite: item.pernoite ?? false,
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
