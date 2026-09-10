import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { StatusPonto, StatusSolicitacao, TipoConta } from "@prisma/client";
import { autenticar, autenticarOpcional, autorizar } from "../middleware/auth";
import { uploadImagemPonto, caminhoPublicoImagem } from "../middleware/upload";
import { distanciaMetros } from "../lib/geo";

const pontosRouter = Router();

const TIPOS_CADASTRADORES = [
  TipoConta.NEGOCIO,
  TipoConta.GESTOR,
  TipoConta.MODERADOR,
  TipoConta.ADMIN,
] as const;

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const DISTANCIA_DUPLICIDADE_METROS = 150;

function ehModerador(tipoConta: TipoConta): boolean {
  return tipoConta === TipoConta.MODERADOR || tipoConta === TipoConta.ADMIN;
}

const pontoSelecaoPublica = {
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
  status: true,
  seloVerificado: true,
} as const;

const pontoSelecaoCompleta = {
  ...pontoSelecaoPublica,
  motivoRejeicao: true,
  dataCriacao: true,
  dataAtualizacao: true,
  idResponsavel: true,
  responsavel: {
    select: {
      id: true,
      nome: true,
    },
  },
} as const;

const criarPontoSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  descricao: z.string().trim().max(2000).optional(),
  categoria: z.string().trim().min(1).max(80),
  cidade: z.string().trim().min(1).max(120),
  endereco: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  faixaPreco: z.string().trim().max(60).optional(),
  acessibilidade: z.string().trim().max(200).optional(),
  siteOficial: z.string().trim().max(200).optional(),
  telefoneContato: z.string().trim().max(40).optional(),
  horarioFuncionamento: z.string().trim().max(200).optional(),
  confirmarDuplicidade: z.coerce.boolean().default(false),
});

const atualizarPontoSchema = criarPontoSchema
  .omit({ confirmarDuplicidade: true })
  .partial();

const rejeitarSchema = z.object({
  motivo: z.string().trim().min(1).max(500),
});

const sugestaoSchema = z.object({
  camposPropostos: z
    .record(z.string(), z.string().trim().min(1).max(2000))
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "Informe ao menos um campo a ser sugerido.",
    }),
  mensagem: z.string().trim().max(500).optional(),
});

const solicitarVerificacaoSchema = z.object({
  comprovacao: z.string().trim().max(500).optional(),
});

const idSchema = z.coerce.number().int().positive();

const CAMPOS_SUGERIVEIS = new Set([
  "nome",
  "descricao",
  "categoria",
  "cidade",
  "endereco",
  "faixaPreco",
  "acessibilidade",
  "siteOficial",
  "telefoneContato",
  "horarioFuncionamento",
]);

async function buscarPossiveisDuplicados(
  nome: string,
  cidade: string,
  latitude?: number,
  longitude?: number,
) {
  const candidatos = await prisma.pontoTuristico.findMany({
    where: {
      cidade: { equals: cidade, mode: "insensitive" },
      status: { not: StatusPonto.REJEITADO },
    },
    select: { id: true, nome: true, endereco: true, latitude: true, longitude: true },
  });

  const nomeNormalizado = nome.trim().toLowerCase();

  return candidatos.filter((candidato) => {
    const mesmoNome = candidato.nome.trim().toLowerCase() === nomeNormalizado;

    if (mesmoNome) {
      return true;
    }

    if (
      latitude === undefined ||
      longitude === undefined ||
      candidato.latitude === null ||
      candidato.longitude === null
    ) {
      return false;
    }

    return (
      distanciaMetros(latitude, longitude, candidato.latitude, candidato.longitude) <=
      DISTANCIA_DUPLICIDADE_METROS
    );
  });
}

function camposObrigatoriosFaltantes(ponto: {
  nome: string;
  categoria: string;
  cidade: string;
  latitude: number | null;
  longitude: number | null;
  horarioFuncionamento: string | null;
}): string[] {
  const faltantes: string[] = [];

  if (!ponto.nome.trim()) faltantes.push("nome");
  if (!ponto.categoria.trim()) faltantes.push("categoria");
  if (!ponto.cidade.trim()) faltantes.push("cidade");
  if (ponto.latitude === null || ponto.longitude === null) faltantes.push("coordenadas");
  if (!ponto.horarioFuncionamento || !ponto.horarioFuncionamento.trim()) {
    faltantes.push("horarioFuncionamento");
  }

  return faltantes;
}

pontosRouter.get("/", async (req: Request, res: Response) => {
  try {
    const buscaSchema = z.object({
      cidade: z.string().trim().min(1).optional(),
      categoria: z.string().trim().min(1).optional(),
      busca: z.string().trim().min(1).optional(),
      limite: z.coerce.number().int().min(1).max(100).default(20),
    });

    const resultado = buscaSchema.safeParse(req.query);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Parâmetros de busca inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const { cidade, categoria, busca, limite } = resultado.data;

    const pontos = await prisma.pontoTuristico.findMany({
      where: {
        status: StatusPonto.PUBLICADO,
        ...(cidade ? { cidade: { contains: cidade, mode: "insensitive" } } : {}),
        ...(categoria ? { categoria: { contains: categoria, mode: "insensitive" } } : {}),
        ...(busca
          ? {
              OR: [
                { nome: { contains: busca, mode: "insensitive" } },
                { descricao: { contains: busca, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nome: "asc" },
      take: limite,
      select: pontoSelecaoPublica,
    });

    return res.json({ total: pontos.length, dados: pontos });
  } catch (error) {
    console.error("Erro ao buscar pontos turísticos:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar pontos turísticos." });
  }
});

pontosRouter.get("/meus", autenticar, async (req: Request, res: Response) => {
  try {
    const pontos = await prisma.pontoTuristico.findMany({
      where: { idResponsavel: req.usuario!.id },
      orderBy: { dataAtualizacao: "desc" },
      select: pontoSelecaoCompleta,
    });

    return res.json({ total: pontos.length, dados: pontos });
  } catch (error) {
    console.error("Erro ao listar meus pontos:", error);

    return res.status(500).json({ erro: "Erro interno ao listar seus pontos." });
  }
});

pontosRouter.get(
  "/moderacao",
  autenticar,
  autorizar(...TIPOS_MODERADORES),
  async (_req: Request, res: Response) => {
    try {
      const pontos = await prisma.pontoTuristico.findMany({
        where: { status: StatusPonto.PENDENTE_VERIFICACAO },
        orderBy: { dataAtualizacao: "asc" },
        select: pontoSelecaoCompleta,
      });

      return res.json({ total: pontos.length, dados: pontos });
    } catch (error) {
      console.error("Erro ao listar pontos para moderação:", error);

      return res.status(500).json({ erro: "Erro interno ao listar pontos para moderação." });
    }
  },
);

pontosRouter.post(
  "/",
  autenticar,
  autorizar(...TIPOS_CADASTRADORES),
  async (req: Request, res: Response) => {
    try {
      const resultado = criarPontoSchema.safeParse(req.body);

      if (!resultado.success) {
        return res.status(400).json({
          erro: "Dados do ponto turístico inválidos.",
          detalhes: resultado.error.flatten(),
        });
      }

      const dados = resultado.data;

      if (!dados.confirmarDuplicidade) {
        const duplicados = await buscarPossiveisDuplicados(
          dados.nome,
          dados.cidade,
          dados.latitude,
          dados.longitude,
        );

        if (duplicados.length > 0) {
          return res.status(409).json({
            erro:
              "Encontramos possíveis duplicados para este ponto. Revise ou confirme o cadastro mesmo assim.",
            possiveisDuplicados: duplicados,
          });
        }
      }

      const ponto = await prisma.pontoTuristico.create({
        data: {
          nome: dados.nome,
          descricao: dados.descricao || null,
          categoria: dados.categoria,
          cidade: dados.cidade,
          endereco: dados.endereco || null,
          latitude: dados.latitude ?? null,
          longitude: dados.longitude ?? null,
          faixaPreco: dados.faixaPreco || null,
          acessibilidade: dados.acessibilidade || null,
          siteOficial: dados.siteOficial || null,
          telefoneContato: dados.telefoneContato || null,
          horarioFuncionamento: dados.horarioFuncionamento || null,
          status: StatusPonto.RASCUNHO,
          idResponsavel: req.usuario!.id,
        },
        select: pontoSelecaoCompleta,
      });

      return res.status(201).json(ponto);
    } catch (error) {
      console.error("Erro ao criar ponto turístico:", error);

      return res.status(500).json({ erro: "Erro interno ao criar ponto turístico." });
    }
  },
);

pontosRouter.get("/:id", autenticarOpcional, async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const ponto = await prisma.pontoTuristico.findUnique({
      where: { id: id.data },
      select: pontoSelecaoCompleta,
    });

    if (!ponto) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    const usuario = req.usuario;
    const podeVerNaoPublicado =
      usuario && (usuario.id === ponto.idResponsavel || ehModerador(usuario.tipoConta));

    if (ponto.status !== StatusPonto.PUBLICADO && !podeVerNaoPublicado) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    return res.json(ponto);
  } catch (error) {
    console.error("Erro ao buscar detalhe do ponto:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar ponto turístico." });
  }
});

pontosRouter.put("/:id", autenticar, async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = atualizarPontoSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados do ponto turístico inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

    if (!ponto) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    const ehDono = ponto.idResponsavel === req.usuario!.id;
    const ehAdmin = req.usuario!.tipoConta === TipoConta.ADMIN;

    if (!ehDono && !ehAdmin) {
      return res.status(403).json({ erro: "Você não tem permissão para editar este ponto." });
    }

    if (ponto.status !== StatusPonto.RASCUNHO && ponto.status !== StatusPonto.REJEITADO && !ehAdmin) {
      return res.status(409).json({
        erro:
          "Pontos publicados ou em análise não podem ser editados diretamente. Use o recurso de sugestão de edição.",
      });
    }

    const dados = resultado.data;

    const ponteAtualizado = await prisma.pontoTuristico.update({
      where: { id: id.data },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.descricao !== undefined ? { descricao: dados.descricao || null } : {}),
        ...(dados.categoria !== undefined ? { categoria: dados.categoria } : {}),
        ...(dados.cidade !== undefined ? { cidade: dados.cidade } : {}),
        ...(dados.endereco !== undefined ? { endereco: dados.endereco || null } : {}),
        ...(dados.latitude !== undefined ? { latitude: dados.latitude } : {}),
        ...(dados.longitude !== undefined ? { longitude: dados.longitude } : {}),
        ...(dados.faixaPreco !== undefined ? { faixaPreco: dados.faixaPreco || null } : {}),
        ...(dados.acessibilidade !== undefined
          ? { acessibilidade: dados.acessibilidade || null }
          : {}),
        ...(dados.siteOficial !== undefined ? { siteOficial: dados.siteOficial || null } : {}),
        ...(dados.telefoneContato !== undefined
          ? { telefoneContato: dados.telefoneContato || null }
          : {}),
        ...(dados.horarioFuncionamento !== undefined
          ? { horarioFuncionamento: dados.horarioFuncionamento || null }
          : {}),
        // Uma edição corrige o ponto: volta ao rascunho e limpa uma eventual rejeição anterior.
        status: StatusPonto.RASCUNHO,
        motivoRejeicao: null,
      },
      select: pontoSelecaoCompleta,
    });

    return res.json(ponteAtualizado);
  } catch (error) {
    console.error("Erro ao atualizar ponto turístico:", error);

    return res.status(500).json({ erro: "Erro interno ao atualizar ponto turístico." });
  }
});

pontosRouter.post(
  "/:id/imagem",
  autenticar,
  (req: Request, res: Response, next) => {
    uploadImagemPonto(req, res, (erro: unknown) => {
      if (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha no upload da imagem.";
        return res.status(400).json({ erro: mensagem });
      }

      return next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);

      if (!id.success) {
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      if (!req.file) {
        return res.status(400).json({ erro: "Nenhuma imagem enviada." });
      }

      const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      const ehDono = ponto.idResponsavel === req.usuario!.id;
      const ehAdmin = req.usuario!.tipoConta === TipoConta.ADMIN;

      if (!ehDono && !ehAdmin) {
        return res.status(403).json({ erro: "Você não tem permissão para editar este ponto." });
      }

      const ponteAtualizado = await prisma.pontoTuristico.update({
        where: { id: id.data },
        data: { imagemUrl: caminhoPublicoImagem(req.file.filename) },
        select: pontoSelecaoCompleta,
      });

      return res.json(ponteAtualizado);
    } catch (error) {
      console.error("Erro ao enviar imagem do ponto:", error);

      return res.status(500).json({ erro: "Erro interno ao enviar imagem do ponto." });
    }
  },
);

pontosRouter.post("/:id/publicar", autenticar, async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

    if (!ponto) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    const ehDono = ponto.idResponsavel === req.usuario!.id;
    const ehAdmin = req.usuario!.tipoConta === TipoConta.ADMIN;

    if (!ehDono && !ehAdmin) {
      return res.status(403).json({ erro: "Você não tem permissão para publicar este ponto." });
    }

    if (ponto.status !== StatusPonto.RASCUNHO && ponto.status !== StatusPonto.REJEITADO) {
      return res.status(409).json({ erro: "Este ponto já foi enviado para publicação." });
    }

    const faltantes = camposObrigatoriosFaltantes(ponto);

    if (faltantes.length > 0) {
      return res.status(400).json({
        erro: "Para publicar, preencha os campos obrigatórios.",
        camposFaltantes: faltantes,
      });
    }

    const ponteAtualizado = await prisma.pontoTuristico.update({
      where: { id: id.data },
      data: { status: StatusPonto.PENDENTE_VERIFICACAO, motivoRejeicao: null },
      select: pontoSelecaoCompleta,
    });

    return res.json(ponteAtualizado);
  } catch (error) {
    console.error("Erro ao publicar ponto turístico:", error);

    return res.status(500).json({ erro: "Erro interno ao publicar ponto turístico." });
  }
});

pontosRouter.post(
  "/:id/aprovar",
  autenticar,
  autorizar(...TIPOS_MODERADORES),
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);

      if (!id.success) {
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      if (ponto.status !== StatusPonto.PENDENTE_VERIFICACAO) {
        return res.status(409).json({ erro: "Este ponto não está aguardando moderação." });
      }

      const ponteAtualizado = await prisma.pontoTuristico.update({
        where: { id: id.data },
        data: { status: StatusPonto.PUBLICADO, motivoRejeicao: null },
        select: pontoSelecaoCompleta,
      });

      return res.json(ponteAtualizado);
    } catch (error) {
      console.error("Erro ao aprovar ponto turístico:", error);

      return res.status(500).json({ erro: "Erro interno ao aprovar ponto turístico." });
    }
  },
);

pontosRouter.post(
  "/:id/rejeitar",
  autenticar,
  autorizar(...TIPOS_MODERADORES),
  async (req: Request, res: Response) => {
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

      const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      if (ponto.status !== StatusPonto.PENDENTE_VERIFICACAO) {
        return res.status(409).json({ erro: "Este ponto não está aguardando moderação." });
      }

      const ponteAtualizado = await prisma.pontoTuristico.update({
        where: { id: id.data },
        data: { status: StatusPonto.REJEITADO, motivoRejeicao: resultado.data.motivo },
        select: pontoSelecaoCompleta,
      });

      return res.json(ponteAtualizado);
    } catch (error) {
      console.error("Erro ao rejeitar ponto turístico:", error);

      return res.status(500).json({ erro: "Erro interno ao rejeitar ponto turístico." });
    }
  },
);

pontosRouter.get("/:id/sugestoes", autenticar, async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

    if (!ponto) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    const ehDono = ponto.idResponsavel === req.usuario!.id;

    if (!ehDono && !ehModerador(req.usuario!.tipoConta)) {
      return res.status(403).json({ erro: "Você não tem permissão para ver estas sugestões." });
    }

    const sugestoes = await prisma.sugestaoEdicao.findMany({
      where: { idPonto: id.data },
      orderBy: { dataCriacao: "desc" },
      include: { autor: { select: { id: true, nome: true } } },
    });

    return res.json({ total: sugestoes.length, dados: sugestoes });
  } catch (error) {
    console.error("Erro ao listar sugestões do ponto:", error);

    return res.status(500).json({ erro: "Erro interno ao listar sugestões do ponto." });
  }
});

pontosRouter.post("/:id/sugestoes", autenticar, async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const resultado = sugestaoSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados da sugestão inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const camposInvalidos = Object.keys(resultado.data.camposPropostos).filter(
      (campo) => !CAMPOS_SUGERIVEIS.has(campo),
    );

    if (camposInvalidos.length > 0) {
      return res.status(400).json({
        erro: `Campos não permitidos para sugestão: ${camposInvalidos.join(", ")}.`,
      });
    }

    const ponto = await prisma.pontoTuristico.findFirst({
      where: { id: id.data, status: StatusPonto.PUBLICADO },
      select: { id: true },
    });

    if (!ponto) {
      return res.status(404).json({ erro: "Ponto turístico não encontrado." });
    }

    const sugestao = await prisma.sugestaoEdicao.create({
      data: {
        idPonto: id.data,
        idAutor: req.usuario!.id,
        camposPropostos: resultado.data.camposPropostos,
        mensagem: resultado.data.mensagem || null,
      },
    });

    return res.status(201).json(sugestao);
  } catch (error) {
    console.error("Erro ao criar sugestão de edição:", error);

    return res.status(500).json({ erro: "Erro interno ao criar sugestão de edição." });
  }
});

pontosRouter.post(
  "/:id/solicitar-verificacao",
  autenticar,
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);

      if (!id.success) {
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      const resultado = solicitarVerificacaoSchema.safeParse(req.body);

      if (!resultado.success) {
        return res.status(400).json({
          erro: "Dados da solicitação inválidos.",
          detalhes: resultado.error.flatten(),
        });
      }

      const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      if (ponto.idResponsavel !== req.usuario!.id) {
        return res.status(403).json({
          erro: "Apenas o responsável pelo ponto pode solicitar o selo de verificação.",
        });
      }

      if (ponto.status !== StatusPonto.PUBLICADO) {
        return res.status(409).json({ erro: "Apenas pontos publicados podem solicitar verificação." });
      }

      if (ponto.seloVerificado) {
        return res.status(409).json({ erro: "Este ponto já possui o selo de verificação." });
      }

      const solicitacaoPendente = await prisma.solicitacaoVerificacao.findFirst({
        where: { idPonto: id.data, status: StatusSolicitacao.PENDENTE },
      });

      if (solicitacaoPendente) {
        return res.status(409).json({ erro: "Já existe uma solicitação de verificação pendente." });
      }

      const solicitacao = await prisma.solicitacaoVerificacao.create({
        data: {
          idPonto: id.data,
          idSolicitante: req.usuario!.id,
          comprovacao: resultado.data.comprovacao || null,
        },
      });

      return res.status(201).json(solicitacao);
    } catch (error) {
      console.error("Erro ao solicitar verificação:", error);

      return res.status(500).json({ erro: "Erro interno ao solicitar verificação." });
    }
  },
);

export default pontosRouter;
