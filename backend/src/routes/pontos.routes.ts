import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { StatusPonto, StatusSolicitacao, TipoConta } from "@prisma/client";
import { autenticar, autenticarOpcional, autorizar } from "../middleware/auth";
import { uploadImagemPonto, caminhoPublicoImagem } from "../middleware/upload";
import { uploadCsv } from "../middleware/uploadCsv";
import { distanciaMetros } from "../lib/geo";
import { registrarAuditoria } from "../lib/auditoria";
import { criarNotificacao } from "../lib/notificacoes";
import { registrarVersaoPonto } from "../lib/versionamento";
import { conteudoSuspeito } from "../lib/moderacaoTexto";
import { ehUsuarioConfiavel, incrementarReputacao, PONTOS_REPUTACAO } from "../lib/reputacao";
import { limiteContribuicao } from "../middleware/rateLimit";
import { analisarCsv, linhasParaObjetos, objetosParaCsv } from "../lib/csv";

const pontosRouter = Router();

const TIPOS_CADASTRADORES = [
  TipoConta.NEGOCIO,
  TipoConta.GESTOR,
  TipoConta.MODERADOR,
  TipoConta.ADMIN,
] as const;

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const DISTANCIA_DUPLICIDADE_METROS = 150;
const RAIO_BUSCA_KM_PADRAO = 10;
const RAIO_BUSCA_KM_MAXIMO = 200;

interface PontoComDistancia {
  id: number;
  nome: string;
  descricao: string | null;
  categoria: string;
  cidade: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  faixaPreco: string | null;
  acessibilidade: string | null;
  siteOficial: string | null;
  telefoneContato: string | null;
  horarioFuncionamento: string | null;
  imagemUrl: string | null;
  status: StatusPonto;
  seloVerificado: boolean;
  distanciaMetros: number;
}

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
  versao: true,
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
  .partial()
  .extend({
    // RB08/AF04: se informado, a atualização só é aplicada se ninguém tiver
    // alterado o ponto desde que o cliente carregou esta versão.
    versaoEsperada: z.coerce.number().int().positive().optional(),
  });

const rejeitarSchema = z.object({
  motivo: z.string().trim().min(1).max(500),
});

const avaliacaoSchema = z.object({
  nota: z.coerce.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).optional(),
  fotoUrl: z.string().trim().url().max(500).optional(),
});

const importarPontosQuerySchema = z.object({
  confirmarDuplicidade: z.coerce.boolean().default(false),
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

const buscaSchema = z.object({
  cidade: z.string().trim().min(1).optional(),
  categoria: z.string().trim().min(1).optional(),
  busca: z.string().trim().min(1).optional(),
  acessibilidade: z.string().trim().min(1).optional(),
  faixaPreco: z.string().trim().min(1).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  raioKm: z.coerce.number().positive().max(RAIO_BUSCA_KM_MAXIMO).default(RAIO_BUSCA_KM_PADRAO),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

pontosRouter.get("/", async (req: Request, res: Response) => {
  try {
    const resultado = buscaSchema.safeParse(req.query);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Parâmetros de busca inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const { cidade, categoria, busca, acessibilidade, faixaPreco, lat, lng, raioKm, limite } =
      resultado.data;

    // Com coordenadas informadas, buscamos por proximidade usando a coluna geográfica
    // (PostGIS) — ordenando pela distância real, não pelo nome.
    if (lat !== undefined && lng !== undefined) {
      const condicoes: Prisma.Sql[] = [
        Prisma.sql`status = 'PUBLICADO'`,
        Prisma.sql`geom IS NOT NULL`,
        Prisma.sql`ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${raioKm * 1000})`,
      ];

      if (cidade) condicoes.push(Prisma.sql`cidade ILIKE ${`%${cidade}%`}`);
      if (categoria) condicoes.push(Prisma.sql`categoria ILIKE ${`%${categoria}%`}`);
      if (acessibilidade) condicoes.push(Prisma.sql`acessibilidade ILIKE ${`%${acessibilidade}%`}`);
      if (faixaPreco) condicoes.push(Prisma.sql`faixa_preco ILIKE ${`%${faixaPreco}%`}`);
      if (busca) {
        condicoes.push(
          Prisma.sql`(nome ILIKE ${`%${busca}%`} OR descricao ILIKE ${`%${busca}%`})`,
        );
      }

      const pontos = await prisma.$queryRaw<PontoComDistancia[]>`
        SELECT
          id, nome, descricao, categoria, cidade, endereco, latitude, longitude,
          faixa_preco AS "faixaPreco", acessibilidade, site_oficial AS "siteOficial",
          telefone_contato AS "telefoneContato", horario_funcionamento AS "horarioFuncionamento",
          imagem_url AS "imagemUrl", status, selo_verificado AS "seloVerificado",
          ST_Distance(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS "distanciaMetros"
        FROM ponto_turistico
        WHERE ${Prisma.join(condicoes, " AND ")}
        ORDER BY "distanciaMetros" ASC
        LIMIT ${limite}
      `;

      return res.json({ total: pontos.length, dados: pontos });
    }

    const pontos = await prisma.pontoTuristico.findMany({
      where: {
        status: StatusPonto.PUBLICADO,
        ...(cidade ? { cidade: { contains: cidade, mode: "insensitive" } } : {}),
        ...(categoria ? { categoria: { contains: categoria, mode: "insensitive" } } : {}),
        ...(acessibilidade
          ? { acessibilidade: { contains: acessibilidade, mode: "insensitive" } }
          : {}),
        ...(faixaPreco ? { faixaPreco: { contains: faixaPreco, mode: "insensitive" } } : {}),
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

const TIPOS_EXPORTADORES = [TipoConta.GESTOR, TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const COLUNAS_EXPORTACAO = [
  "id",
  "nome",
  "descricao",
  "categoria",
  "cidade",
  "endereco",
  "latitude",
  "longitude",
  "faixaPreco",
  "acessibilidade",
  "siteOficial",
  "telefoneContato",
  "horarioFuncionamento",
  "status",
  "seloVerificado",
];

// RF17: exportação de dados para gestores/pesquisadores em CSV ou GeoJSON.
pontosRouter.get(
  "/exportar",
  autenticar,
  autorizar(...TIPOS_EXPORTADORES),
  async (req: Request, res: Response) => {
    try {
      const formato = z.enum(["csv", "geojson"]).default("csv").parse(req.query.formato ?? "csv");

      const pontos = await prisma.pontoTuristico.findMany({
        where: { status: StatusPonto.PUBLICADO },
        orderBy: { nome: "asc" },
        select: pontoSelecaoPublica,
      });

      if (formato === "geojson") {
        const geojson = {
          type: "FeatureCollection",
          features: pontos
            .filter((p) => p.latitude !== null && p.longitude !== null)
            .map((p) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
              properties: {
                id: p.id,
                nome: p.nome,
                categoria: p.categoria,
                cidade: p.cidade,
                faixaPreco: p.faixaPreco,
                seloVerificado: p.seloVerificado,
              },
            })),
        };

        res.setHeader("Content-Disposition", "attachment; filename=pontos.geojson");
        return res.json(geojson);
      }

      const csv = objetosParaCsv(COLUNAS_EXPORTACAO, pontos);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=pontos.csv");
      return res.send(csv);
    } catch (error) {
      console.error("Erro ao exportar pontos turísticos:", error);

      return res.status(500).json({ erro: "Erro interno ao exportar pontos turísticos." });
    }
  },
);

// RF18/AF09: importação em lote via CSV, com relatório de erro por linha.
pontosRouter.post(
  "/importar",
  autenticar,
  autorizar(...TIPOS_EXPORTADORES),
  (req: Request, res: Response, next) => {
    uploadCsv(req, res, (erro: unknown) => {
      if (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha no upload do arquivo.";
        return res.status(400).json({ erro: mensagem });
      }
      return next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ erro: "Nenhum arquivo enviado." });
      }

      const { confirmarDuplicidade } = importarPontosQuerySchema.parse(req.query);

      const linhas = linhasParaObjetos(analisarCsv(req.file.buffer.toString("utf-8")));

      const resultados: { linha: number; sucesso: boolean; motivo?: string }[] = [];

      for (let indice = 0; indice < linhas.length; indice += 1) {
        const numeroLinha = indice + 2; // +1 cabeçalho, +1 para contagem humana (1-based)
        const linha = linhas[indice];

        const validacao = criarPontoSchema
          .omit({ confirmarDuplicidade: true })
          .safeParse({
            ...linha,
            latitude: linha.latitude || undefined,
            longitude: linha.longitude || undefined,
          });

        if (!validacao.success) {
          resultados.push({
            linha: numeroLinha,
            sucesso: false,
            motivo: validacao.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          });
          continue;
        }

        const dados = validacao.data;

        if (!confirmarDuplicidade) {
          const duplicados = await buscarPossiveisDuplicados(
            dados.nome,
            dados.cidade,
            dados.latitude,
            dados.longitude,
          );

          if (duplicados.length > 0) {
            resultados.push({
              linha: numeroLinha,
              sucesso: false,
              motivo: `Possível duplicado de "${duplicados[0].nome}".`,
            });
            continue;
          }
        }

        await prisma.pontoTuristico.create({
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
        });

        resultados.push({ linha: numeroLinha, sucesso: true });
      }

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "importar",
        entidade: "ponto_turistico",
        detalhes: {
          total: resultados.length,
          sucesso: resultados.filter((r) => r.sucesso).length,
        },
      });

      return res.json({
        total: resultados.length,
        sucesso: resultados.filter((r) => r.sucesso).length,
        falhas: resultados.filter((r) => !r.sucesso),
      });
    } catch (error) {
      console.error("Erro ao importar pontos turísticos:", error);

      return res.status(500).json({ erro: "Erro interno ao importar pontos turísticos." });
    }
  },
);

// RF24 (simplificado): sugestão passiva com base nos interesses do perfil —
// não é filtragem colaborativa entre usuários (fora do escopo acadêmico definido
// no RFC, seção 6.6), apenas prioriza categorias que o usuário já demonstrou gostar.
pontosRouter.get("/recomendados", autenticar, async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { interesses: true, cidadeBase: true },
    });

    if (!usuario || usuario.interesses.length === 0) {
      return res.json({ total: 0, dados: [] });
    }

    const pontos = await prisma.pontoTuristico.findMany({
      where: {
        status: StatusPonto.PUBLICADO,
        categoria: { in: usuario.interesses, mode: "insensitive" },
        ...(usuario.cidadeBase ? { cidade: { equals: usuario.cidadeBase, mode: "insensitive" } } : {}),
      },
      orderBy: [{ seloVerificado: "desc" }, { nome: "asc" }],
      take: 12,
      select: pontoSelecaoPublica,
    });

    return res.json({ total: pontos.length, dados: pontos });
  } catch (error) {
    console.error("Erro ao buscar pontos recomendados:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar pontos recomendados." });
  }
});

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

    // RB08/AF04: lock otimista — se o cliente informar a versão que tinha em mãos e
    // ela não bater com a atual, alguém alterou o ponto nesse meio-tempo.
    if (dados.versaoEsperada !== undefined && dados.versaoEsperada !== ponto.versao) {
      return res.status(409).json({
        erro: "O conteúdo foi alterado por outro usuário desde que você abriu esta edição.",
        pontoAtual: ponto,
      });
    }

    await registrarVersaoPonto(ponto, "edicao", req.usuario!.id);

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
        versao: { increment: 1 },
      },
      select: pontoSelecaoCompleta,
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "atualizar",
      entidade: "ponto_turistico",
      idEntidade: id.data,
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

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "aprovar",
        entidade: "ponto_turistico",
        idEntidade: id.data,
      });

      if (ponto.idResponsavel) {
        await criarNotificacao(
          ponto.idResponsavel,
          `Seu ponto "${ponto.nome}" foi aprovado e já está publicado.`,
          `/pontos/${id.data}`,
        );
      }

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

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "rejeitar",
        entidade: "ponto_turistico",
        idEntidade: id.data,
        detalhes: { motivo: resultado.data.motivo },
      });

      if (ponto.idResponsavel) {
        await criarNotificacao(
          ponto.idResponsavel,
          `Seu ponto "${ponto.nome}" foi rejeitado: ${resultado.data.motivo}`,
          `/pontos/${id.data}/editar`,
        );
      }

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

pontosRouter.post(
  "/:id/sugestoes",
  autenticar,
  limiteContribuicao,
  async (req: Request, res: Response) => {
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
      });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      // RB04: usuários confiáveis (reputação acima do limite) têm a sugestão
      // aplicada automaticamente, sem passar pela fila de moderação manual.
      const confiavel = await ehUsuarioConfiavel(req.usuario!.id);

      if (confiavel) {
        await registrarVersaoPonto(ponto, "sugestao_auto_aplicada", req.usuario!.id);

        await prisma.pontoTuristico.update({
          where: { id: id.data },
          data: {
            ...(resultado.data.camposPropostos as Prisma.PontoTuristicoUpdateInput),
            versao: { increment: 1 },
          },
        });

        const sugestao = await prisma.sugestaoEdicao.create({
          data: {
            idPonto: id.data,
            idAutor: req.usuario!.id,
            camposPropostos: resultado.data.camposPropostos,
            mensagem: resultado.data.mensagem || null,
            status: StatusSolicitacao.APROVADA,
            dataResolucao: new Date(),
          },
        });

        await incrementarReputacao(req.usuario!.id, PONTOS_REPUTACAO.SUGESTAO_APROVADA);

        await registrarAuditoria({
          idUsuario: req.usuario!.id,
          acao: "sugestao_auto_aplicada",
          entidade: "ponto_turistico",
          idEntidade: id.data,
        });

        return res.status(201).json({ ...sugestao, aplicadaAutomaticamente: true });
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
  },
);

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

pontosRouter.get("/:id/versoes", autenticar, async (req: Request, res: Response) => {
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
      return res.status(403).json({ erro: "Você não tem permissão para ver este histórico." });
    }

    const versoes = await prisma.versaoPonto.findMany({
      where: { idPonto: id.data },
      orderBy: { dataCriacao: "desc" },
    });

    return res.json({ total: versoes.length, dados: versoes });
  } catch (error) {
    console.error("Erro ao listar versões do ponto:", error);

    return res.status(500).json({ erro: "Erro interno ao listar versões do ponto." });
  }
});

pontosRouter.post(
  "/:id/versoes/:versaoId/restaurar",
  autenticar,
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const versaoId = idSchema.safeParse(req.params.versaoId);

      if (!id.success || !versaoId.success) {
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      const ponto = await prisma.pontoTuristico.findUnique({ where: { id: id.data } });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      const ehDono = ponto.idResponsavel === req.usuario!.id;

      if (!ehDono && !ehModerador(req.usuario!.tipoConta)) {
        return res.status(403).json({ erro: "Você não tem permissão para restaurar este ponto." });
      }

      const versao = await prisma.versaoPonto.findFirst({
        where: { id: versaoId.data, idPonto: id.data },
      });

      if (!versao) {
        return res.status(404).json({ erro: "Versão não encontrada." });
      }

      // A própria restauração gera uma nova versão do estado atual, para que a
      // ação seja reversível (RB09).
      await registrarVersaoPonto(ponto, "antes_de_restaurar", req.usuario!.id);

      const ponteAtualizado = await prisma.pontoTuristico.update({
        where: { id: id.data },
        data: {
          ...(versao.dados as Prisma.PontoTuristicoUpdateInput),
          versao: { increment: 1 },
        },
        select: pontoSelecaoCompleta,
      });

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "restaurar_versao",
        entidade: "ponto_turistico",
        idEntidade: id.data,
        detalhes: { versaoRestaurada: versaoId.data },
      });

      return res.json(ponteAtualizado);
    } catch (error) {
      console.error("Erro ao restaurar versão do ponto:", error);

      return res.status(500).json({ erro: "Erro interno ao restaurar versão do ponto." });
    }
  },
);

pontosRouter.get("/:id/avaliacoes", async (req: Request, res: Response) => {
  try {
    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({ erro: "Identificador inválido." });
    }

    const avaliacoes = await prisma.avaliacao.findMany({
      where: { idPonto: id.data, status: StatusSolicitacao.APROVADA },
      orderBy: { dataCriacao: "desc" },
      include: { autor: { select: { id: true, nome: true } } },
    });

    const media =
      avaliacoes.length > 0
        ? avaliacoes.reduce((soma, a) => soma + a.nota, 0) / avaliacoes.length
        : null;

    return res.json({ total: avaliacoes.length, media, dados: avaliacoes });
  } catch (error) {
    console.error("Erro ao listar avaliações do ponto:", error);

    return res.status(500).json({ erro: "Erro interno ao listar avaliações do ponto." });
  }
});

pontosRouter.post(
  "/:id/avaliacoes",
  autenticar,
  limiteContribuicao,
  async (req: Request, res: Response) => {
    try {
      const id = idSchema.safeParse(req.params.id);

      if (!id.success) {
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      const resultado = avaliacaoSchema.safeParse(req.body);

      if (!resultado.success) {
        return res.status(400).json({
          erro: "Dados da avaliação inválidos.",
          detalhes: resultado.error.flatten(),
        });
      }

      const ponto = await prisma.pontoTuristico.findFirst({
        where: { id: id.data, status: StatusPonto.PUBLICADO },
        select: { id: true },
      });

      if (!ponto) {
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      const jaAvaliou = await prisma.avaliacao.findFirst({
        where: { idPonto: id.data, idAutor: req.usuario!.id },
      });

      if (jaAvaliou) {
        return res.status(409).json({ erro: "Você já avaliou este ponto." });
      }

      // RF15: filtro automático simples de spam/linguagem antes da fila de
      // moderação humana — comentários suspeitos ficam pendentes, os demais são
      // publicados imediatamente.
      const suspeito = conteudoSuspeito(resultado.data.comentario);

      const avaliacao = await prisma.avaliacao.create({
        data: {
          idPonto: id.data,
          idAutor: req.usuario!.id,
          nota: resultado.data.nota,
          comentario: resultado.data.comentario || null,
          fotoUrl: resultado.data.fotoUrl || null,
          status: suspeito ? StatusSolicitacao.PENDENTE : StatusSolicitacao.APROVADA,
        },
      });

      if (!suspeito) {
        await incrementarReputacao(req.usuario!.id, PONTOS_REPUTACAO.AVALIACAO_APROVADA);
      }

      return res.status(201).json({ ...avaliacao, retidaParaModeracao: suspeito });
    } catch (error) {
      console.error("Erro ao criar avaliação:", error);

      return res.status(500).json({ erro: "Erro interno ao criar avaliação." });
    }
  },
);

export default pontosRouter;
