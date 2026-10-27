import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma, PontoTuristico, StatusPonto, StatusSolicitacao, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { autenticar, autenticarOpcional, autorizar } from "../middleware/auth";
import { receberImagem, caminhoPublicoImagem } from "../middleware/upload";
import { uploadImportacao } from "../middleware/uploadCsv";
import { distanciaMetros } from "../lib/geo";
import { registrarAuditoria } from "../lib/auditoria";
import { criarNotificacao, notificarModeradores } from "../lib/notificacoes";
import { registrarVersaoPonto } from "../lib/versionamento";
import { conteudoSuspeito } from "../lib/moderacaoTexto";
import { ehUsuarioConfiavel, incrementarReputacao, PONTOS_REPUTACAO } from "../lib/reputacao";
import { limiteContribuicao } from "../middleware/rateLimit";
import { analisarCsv, linhasParaObjetos, objetosParaCsv } from "../lib/csv";
import { ErroGeoJson, linhasDeGeoJson, type LinhaImportacao } from "../lib/geojson";
import {
  buscarComFallback,
  ErroTempoEsgotado,
  ORDENACOES,
  RAIO_BUSCA_KM_MAXIMO,
  RAIO_BUSCA_KM_PADRAO,
} from "../lib/buscaPontos";
import { pontoSelecaoCompleta, pontoSelecaoPublica } from "../lib/pontosSelecao";
import { CONFIRMACOES_PARA_APLICAR, mesmaProposta, sugestaoSuspeita } from "../lib/sugestoes";
import { aplicarCamposAoPonto } from "../lib/sugestoesAplicacao";
import { ehViolacaoDeUnicidade } from "../lib/prismaErros";
import { removerArquivoLocal, removerArquivoPublico } from "../lib/arquivos";
import { registrarEvento } from "../lib/metricasUso";
import { pontosDeUsuariosSemelhantes } from "../lib/similaridade";
import { preferenciasAtendidas } from "../lib/preferencias";

const pontosRouter = Router();

const TIPOS_CADASTRADORES = [
  TipoConta.NEGOCIO,
  TipoConta.GESTOR,
  TipoConta.MODERADOR,
  TipoConta.ADMIN,
] as const;

const TIPOS_MODERADORES = [TipoConta.MODERADOR, TipoConta.ADMIN] as const;
const TIPOS_EXPORTADORES = [TipoConta.GESTOR, TipoConta.MODERADOR, TipoConta.ADMIN] as const;

const DISTANCIA_DUPLICIDADE_METROS = 150;

function ehModerador(tipoConta: TipoConta): boolean {
  return tipoConta === TipoConta.MODERADOR || tipoConta === TipoConta.ADMIN;
}

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

const dadosDoPontoSchema = criarPontoSchema.omit({ confirmarDuplicidade: true });

const atualizarPontoSchema = dadosDoPontoSchema.partial().extend({
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
});

// "?confirmarDuplicidade=false" precisa valer como falso (z.coerce.boolean() trataria
// qualquer texto não vazio, inclusive "false", como verdadeiro).
const booleanoDeQuery = z
  .enum(["true", "false", "1", "0"])
  .transform((valor) => valor === "true" || valor === "1");

const importarPontosQuerySchema = z.object({
  confirmarDuplicidade: booleanoDeQuery.default(false),
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

interface CandidatoDuplicado {
  id: number;
  nome: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
}

async function carregarCandidatosDuplicados(cidade: string): Promise<CandidatoDuplicado[]> {
  return prisma.pontoTuristico.findMany({
    where: {
      cidade: { equals: cidade, mode: "insensitive" },
      status: { not: StatusPonto.REJEITADO },
    },
    select: { id: true, nome: true, endereco: true, latitude: true, longitude: true },
  });
}

// RB05: mesmo nome na cidade, ou a menos de 150 m de outro ponto.
function filtrarDuplicados(
  candidatos: CandidatoDuplicado[],
  nome: string,
  latitude?: number,
  longitude?: number,
): CandidatoDuplicado[] {
  const nomeNormalizado = nome.trim().toLowerCase();

  return candidatos.filter((candidato) => {
    if (candidato.nome.trim().toLowerCase() === nomeNormalizado) {
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

const buscaSchema = z
  .object({
    cidade: z.string().trim().min(1).optional(),
    categoria: z.string().trim().min(1).optional(),
    busca: z.string().trim().min(1).optional(),
    acessibilidade: z.string().trim().min(1).optional(),
    faixaPreco: z.string().trim().min(1).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    raioKm: z.coerce.number().positive().max(RAIO_BUSCA_KM_MAXIMO).default(RAIO_BUSCA_KM_PADRAO),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    notaMinima: z.coerce.number().min(1).max(5).optional(),
    abertoAgora: booleanoDeQuery.optional(),
    ordenar: z.enum(ORDENACOES).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    message: "Informe latitude e longitude juntas.",
    path: ["lat"],
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

    registrarEvento("busca");

    const busca = await buscarComFallback(resultado.data);

    return res.json(busca);
  } catch (error) {
    if (error instanceof ErroTempoEsgotado) {
      console.error("Busca de pontos excedeu o tempo limite.");

      return res.status(504).json({
        erro: "Não foi possível completar a busca no momento. Tente novamente.",
        tempoEsgotado: true,
      });
    }

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
        const duplicados = filtrarDuplicados(
          await carregarCandidatosDuplicados(dados.cidade),
          dados.nome,
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

      registrarEvento("ponto_cadastrado");

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "criar",
        entidade: "ponto_turistico",
        idEntidade: ponto.id,
      });

      return res.status(201).json(ponto);
    } catch (error) {
      console.error("Erro ao criar ponto turístico:", error);

      return res.status(500).json({ erro: "Erro interno ao criar ponto turístico." });
    }
  },
);

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
      const formato = z.enum(["csv", "geojson"]).safeParse(req.query.formato ?? "csv");

      if (!formato.success) {
        return res.status(400).json({ erro: 'Formato inválido. Use "csv" ou "geojson".' });
      }

      const pontos = await prisma.pontoTuristico.findMany({
        where: { status: StatusPonto.PUBLICADO },
        orderBy: { nome: "asc" },
        select: pontoSelecaoPublica,
      });

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "exportar",
        entidade: "ponto_turistico",
        detalhes: { formato: formato.data, total: pontos.length },
      });

      if (formato.data === "geojson") {
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
                descricao: p.descricao,
                categoria: p.categoria,
                cidade: p.cidade,
                endereco: p.endereco,
                faixaPreco: p.faixaPreco,
                acessibilidade: p.acessibilidade,
                siteOficial: p.siteOficial,
                telefoneContato: p.telefoneContato,
                horarioFuncionamento: p.horarioFuncionamento,
                seloVerificado: p.seloVerificado,
              },
            })),
        };

        res.setHeader("Content-Type", "application/geo+json; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=pontos.geojson");
        return res.send(JSON.stringify(geojson));
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

const COLUNAS_IMPORTACAO = [
  "nome",
  "categoria",
  "cidade",
  "endereco",
  "descricao",
  "latitude",
  "longitude",
  "faixaPreco",
  "acessibilidade",
  "siteOficial",
  "telefoneContato",
  "horarioFuncionamento",
];

const COLUNAS_OBRIGATORIAS_IMPORTACAO = ["nome", "categoria", "cidade"];

// AF09: modelo do arquivo de importação, para o operador não precisar adivinhar o formato.
pontosRouter.get(
  "/importar/modelo",
  autenticar,
  autorizar(...TIPOS_EXPORTADORES),
  (req: Request, res: Response) => {
    const formato = z.enum(["csv", "geojson"]).safeParse(req.query.formato ?? "csv");

    if (!formato.success) {
      return res.status(400).json({ erro: 'Formato inválido. Use "csv" ou "geojson".' });
    }

    if (formato.data === "geojson") {
      const modelo = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-48.8487, -26.3045] },
            properties: {
              nome: "Mirante de exemplo",
              categoria: "Natureza",
              cidade: "Joinville",
              endereco: "Rua Exemplo, 100",
              descricao: "Descrição do ponto",
              faixaPreco: "Gratuito",
              acessibilidade: "Rampa de acesso",
              siteOficial: "https://exemplo.com.br",
              telefoneContato: "(47) 3000-0000",
              horarioFuncionamento: "Seg-Dom 8h-18h",
            },
          },
        ],
      };

      res.setHeader("Content-Disposition", "attachment; filename=modelo-importacao.geojson");
      return res.json(modelo);
    }

    const modelo = objetosParaCsv(COLUNAS_IMPORTACAO, [
      {
        nome: "Mirante de exemplo",
        categoria: "Natureza",
        cidade: "Joinville",
        endereco: "Rua Exemplo, 100",
        descricao: "Descrição do ponto",
        latitude: "-26.3045",
        longitude: "-48.8487",
        faixaPreco: "Gratuito",
        acessibilidade: "Rampa de acesso",
        siteOficial: "https://exemplo.com.br",
        telefoneContato: "(47) 3000-0000",
        horarioFuncionamento: "Seg-Dom 8h-18h",
      },
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=modelo-importacao.csv");
    return res.send(modelo);
  },
);

function linhasDeCsv(texto: string): LinhaImportacao[] {
  const tabela = analisarCsv(texto);
  const cabecalho = (tabela[0] ?? []).map((coluna) => coluna.trim());
  const faltando = COLUNAS_OBRIGATORIAS_IMPORTACAO.filter((coluna) => !cabecalho.includes(coluna));

  if (faltando.length > 0) {
    throw new ErroGeoJson(
      `O cabeçalho do CSV precisa ter as colunas: ${COLUNAS_OBRIGATORIAS_IMPORTACAO.join(", ")}. Faltando: ${faltando.join(", ")}.`,
    );
  }

  // numero = número da linha no arquivo (1 é o cabeçalho), como o operador vê no editor.
  return linhasParaObjetos(tabela).map((valores, indice) => ({ numero: indice + 2, valores }));
}

// RF18/AF09: importação em lote (CSV ou GeoJSON), com relatório de erro por registro.
pontosRouter.post(
  "/importar",
  autenticar,
  autorizar(...TIPOS_EXPORTADORES),
  (req: Request, res: Response, next: NextFunction) => {
    uploadImportacao(req, res, (erro: unknown) => {
      if (erro) {
        const grande = (erro as { code?: string }).code === "LIMIT_FILE_SIZE";
        const mensagem = grande
          ? "O arquivo excede 2 MB. Divida a importação em partes menores."
          : erro instanceof Error
            ? erro.message
            : "Falha no upload do arquivo.";

        return res.status(grande ? 413 : 400).json({ erro: mensagem });
      }
      return next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ erro: "Nenhum arquivo enviado." });
      }

      const query = importarPontosQuerySchema.safeParse(req.query);

      if (!query.success) {
        return res.status(400).json({ erro: "Parâmetros inválidos." });
      }

      const { confirmarDuplicidade } = query.data;
      const nomeArquivo = req.file.originalname.toLowerCase();
      const ehGeoJson = nomeArquivo.endsWith(".geojson") || nomeArquivo.endsWith(".json");
      const texto = req.file.buffer.toString("utf-8");

      let linhas: LinhaImportacao[];

      try {
        linhas = ehGeoJson ? linhasDeGeoJson(texto) : linhasDeCsv(texto);
      } catch (erro) {
        if (erro instanceof ErroGeoJson) {
          return res.status(400).json({ erro: erro.message });
        }
        throw erro;
      }

      const resultados: { linha: number; sucesso: boolean; motivo?: string }[] = [];
      const candidatosPorCidade = new Map<string, CandidatoDuplicado[]>();

      for (const linha of linhas) {
        if (linha.erro) {
          resultados.push({ linha: linha.numero, sucesso: false, motivo: linha.erro });
          continue;
        }

        const validacao = dadosDoPontoSchema.safeParse({
          ...linha.valores,
          latitude: linha.valores.latitude || undefined,
          longitude: linha.valores.longitude || undefined,
        });

        if (!validacao.success) {
          resultados.push({
            linha: linha.numero,
            sucesso: false,
            motivo: validacao.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          });
          continue;
        }

        const dados = validacao.data;
        const chaveCidade = dados.cidade.toLowerCase();

        // Uma consulta por cidade (e não por linha); os pontos criados no próprio lote
        // entram na lista, para também pegar duplicados dentro do arquivo.
        if (!candidatosPorCidade.has(chaveCidade)) {
          candidatosPorCidade.set(chaveCidade, await carregarCandidatosDuplicados(dados.cidade));
        }

        const candidatos = candidatosPorCidade.get(chaveCidade)!;

        if (!confirmarDuplicidade) {
          const duplicados = filtrarDuplicados(candidatos, dados.nome, dados.latitude, dados.longitude);

          if (duplicados.length > 0) {
            resultados.push({
              linha: linha.numero,
              sucesso: false,
              motivo: `Possível duplicado de "${duplicados[0].nome}".`,
            });
            continue;
          }
        }

        const criado = await prisma.pontoTuristico.create({
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
          select: { id: true, nome: true, endereco: true, latitude: true, longitude: true },
        });

        candidatos.push(criado);
        resultados.push({ linha: linha.numero, sucesso: true });
      }

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "importar",
        entidade: "ponto_turistico",
        detalhes: {
          formato: ehGeoJson ? "geojson" : "csv",
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

// RF24: recomendações com base em usuários de gostos parecidos (pontos que eles salvaram,
// avaliaram bem ou colocaram em roteiros) e, para completar, nos interesses do perfil,
// priorizando o que atende às preferências de acessibilidade.
pontosRouter.get("/recomendados", autenticar, async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { interesses: true, cidadeBase: true, preferenciasAcessibilidade: true },
    });

    if (!usuario) {
      return res.json({ total: 0, dados: [] });
    }

    const semelhantes = await pontosDeUsuariosSemelhantes(req.usuario!.id, 12);
    const idsSemelhantes = semelhantes.map((p) => p.id);

    const pontosSemelhantes = idsSemelhantes.length
      ? await prisma.pontoTuristico.findMany({
          where: { id: { in: idsSemelhantes }, status: StatusPonto.PUBLICADO },
          select: pontoSelecaoPublica,
        })
      : [];

    const pontosPorInteresse =
      usuario.interesses.length > 0
        ? await prisma.pontoTuristico.findMany({
            where: {
              status: StatusPonto.PUBLICADO,
              id: { notIn: idsSemelhantes },
              categoria: { in: usuario.interesses, mode: "insensitive" },
              ...(usuario.cidadeBase
                ? { cidade: { equals: usuario.cidadeBase, mode: "insensitive" } }
                : {}),
            },
            orderBy: [{ seloVerificado: "desc" }, { nome: "asc" }],
            take: 24,
            select: pontoSelecaoPublica,
          })
        : [];

    const ordemSemelhantes = new Map(idsSemelhantes.map((id, indice) => [id, indice]));

    const porSimilaridade = pontosSemelhantes
      .sort((a, b) => (ordemSemelhantes.get(a.id) ?? 0) - (ordemSemelhantes.get(b.id) ?? 0))
      .map((ponto) => ({ ...ponto, motivoRecomendacao: "usuarios_semelhantes" as const }));

    const porInteresse = pontosPorInteresse
      .map((ponto) => ({
        ponto,
        atendidas: preferenciasAtendidas(ponto.acessibilidade, usuario.preferenciasAcessibilidade),
      }))
      .sort((a, b) => b.atendidas - a.atendidas)
      .map(({ ponto }) => ({ ...ponto, motivoRecomendacao: "interesses" as const }));

    const dados = [...porSimilaridade, ...porInteresse].slice(0, 12);

    return res.json({ total: dados.length, dados });
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

    const salvo = usuario
      ? Boolean(
          await prisma.pontoSalvo.findUnique({
            where: { idUsuario_idPonto: { idUsuario: usuario.id, idPonto: ponto.id } },
            select: { id: true },
          }),
        )
      : false;

    return res.json({ ...ponto, salvo });
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

    const respostaDeConflito = async () =>
      res.status(409).json({
        erro: "O conteúdo foi alterado por outro usuário desde que você abriu esta edição.",
        pontoAtual: await prisma.pontoTuristico.findUnique({ where: { id: id.data } }),
      });

    // RB08/AF04: lock otimista — se o cliente informar a versão que tinha em mãos e
    // ela não bater com a atual, alguém alterou o ponto nesse meio-tempo.
    if (dados.versaoEsperada !== undefined && dados.versaoEsperada !== ponto.versao) {
      return respostaDeConflito();
    }

    // Uma edição de dono corrige o ponto: volta ao rascunho e limpa uma eventual
    // rejeição. Um administrador que ajusta um ponto já publicado não o tira do ar.
    const statusDepois =
      ehAdmin && ponto.status === StatusPonto.PUBLICADO ? StatusPonto.PUBLICADO : StatusPonto.RASCUNHO;

    const atualizado = await prisma.$transaction(async (tx) => {
      // O "where versao" torna a checagem atômica: de duas edições simultâneas sobre a
      // mesma versão, só uma encontra a linha; a outra recebe conflito.
      const alteradas = await tx.pontoTuristico.updateMany({
        where: { id: id.data, versao: ponto.versao },
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
          status: statusDepois,
          motivoRejeicao: null,
          versao: { increment: 1 },
        },
      });

      if (alteradas.count === 0) {
        return null;
      }

      await registrarVersaoPonto(ponto, "edicao", req.usuario!.id, tx);

      return tx.pontoTuristico.findUnique({ where: { id: id.data }, select: pontoSelecaoCompleta });
    });

    if (!atualizado) {
      return respostaDeConflito();
    }

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "atualizar",
      entidade: "ponto_turistico",
      idEntidade: id.data,
    });

    return res.json(atualizado);
  } catch (error) {
    console.error("Erro ao atualizar ponto turístico:", error);

    return res.status(500).json({ erro: "Erro interno ao atualizar ponto turístico." });
  }
});

// Confere permissão ANTES de receber o arquivo: quem não pode editar o ponto nem chega a
// gravar algo no disco.
async function podeAlterarImagem(req: Request, res: Response, next: NextFunction) {
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
      return res.status(403).json({ erro: "Você não tem permissão para editar este ponto." });
    }

    // Trocar a foto de um ponto publicado é uma alteração de conteúdo: segue o mesmo
    // caminho das demais edições (sugestão), a não ser para o administrador.
    if (!ehAdmin && ponto.status !== StatusPonto.RASCUNHO && ponto.status !== StatusPonto.REJEITADO) {
      return res.status(409).json({
        erro: "A imagem de um ponto publicado ou em análise não pode ser trocada diretamente.",
      });
    }

    res.locals.ponto = ponto;

    return next();
  } catch (error) {
    return next(error);
  }
}

pontosRouter.post(
  "/:id/imagem",
  autenticar,
  podeAlterarImagem,
  receberImagem("imagem", "pontos"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ erro: "Nenhuma imagem enviada." });
      }

      const ponto = res.locals.ponto as PontoTuristico;
      const novaUrl = caminhoPublicoImagem(req.file, "pontos");

      let atualizado;

      try {
        atualizado = await prisma.pontoTuristico.update({
          where: { id: ponto.id },
          data: { imagemUrl: novaUrl },
          select: pontoSelecaoCompleta,
        });
      } catch (erro) {
        await removerArquivoLocal(req.file.path);
        throw erro;
      }

      // A imagem anterior deixa de ser usada: apaga para não acumular arquivos órfãos.
      await removerArquivoPublico(ponto.imagemUrl);

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "atualizar_imagem",
        entidade: "ponto_turistico",
        idEntidade: ponto.id,
      });

      return res.json(atualizado);
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

    // AF07/RB06: sem os campos mínimos, o ponto não segue para publicação.
    const faltantes = camposObrigatoriosFaltantes(ponto);

    if (faltantes.length > 0) {
      return res.status(400).json({
        erro: `Para publicar, preencha: ${faltantes.join(", ")}.`,
        camposFaltantes: faltantes,
      });
    }

    const ponteAtualizado = await prisma.pontoTuristico.update({
      where: { id: id.data },
      data: { status: StatusPonto.PENDENTE_VERIFICACAO, motivoRejeicao: null },
      select: pontoSelecaoCompleta,
    });

    await registrarAuditoria({
      idUsuario: req.usuario!.id,
      acao: "enviar_para_publicacao",
      entidade: "ponto_turistico",
      idEntidade: id.data,
    });

    await notificarModeradores(`O ponto "${ponto.nome}" aguarda aprovação.`, "/moderacao");

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

      const campos = resultado.data.camposPropostos;
      const mensagem = resultado.data.mensagem || null;

      const camposInvalidos = Object.keys(campos).filter((campo) => !CAMPOS_SUGERIVEIS.has(campo));

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

      const idAutor = req.usuario!.id;

      // AF05: conteúdo suspeito (links, palavrões) nunca é aplicado sozinho, nem para
      // usuário de confiança: vai para a fila de moderação, sinalizado.
      if (sugestaoSuspeita(campos, mensagem)) {
        const sugestao = await prisma.sugestaoEdicao.create({
          data: {
            idPonto: id.data,
            idAutor,
            camposPropostos: campos,
            mensagem,
            motivoRetencao: "conteudo_suspeito",
          },
        });

        await registrarAuditoria({
          idUsuario: idAutor,
          acao: "sugestao_sinalizada",
          entidade: "ponto_turistico",
          idEntidade: id.data,
        });

        await notificarModeradores(
          `Sugestão sinalizada como suspeita para "${ponto.nome}".`,
          "/moderacao",
        );

        return res.status(201).json({
          ...sugestao,
          retidaParaModeracao: true,
          aviso: "Sua sugestão será analisada.",
        });
      }

      // RB04: aplicação automática para dono verificado do ponto ou usuário de confiança.
      const donoVerificado = ponto.idResponsavel === idAutor && ponto.seloVerificado;
      const confiavel = donoVerificado || (await ehUsuarioConfiavel(idAutor));

      if (confiavel) {
        const sugestao = await prisma.$transaction(async (tx) => {
          await aplicarCamposAoPonto(tx, ponto, campos, "sugestao_auto_aplicada", idAutor);

          return tx.sugestaoEdicao.create({
            data: {
              idPonto: id.data,
              idAutor,
              camposPropostos: campos,
              mensagem,
              status: StatusSolicitacao.APROVADA,
              dataResolucao: new Date(),
            },
          });
        });

        if (!donoVerificado) {
          await incrementarReputacao(idAutor, PONTOS_REPUTACAO.SUGESTAO_APROVADA);
        }

        await registrarAuditoria({
          idUsuario: idAutor,
          acao: "sugestao_auto_aplicada",
          entidade: "ponto_turistico",
          idEntidade: id.data,
        });

        return res.status(201).json({
          ...sugestao,
          aplicadaAutomaticamente: true,
          motivoAplicacao: donoVerificado ? "dono_verificado" : "reputacao",
        });
      }

      const sugestao = await prisma.sugestaoEdicao.create({
        data: { idPonto: id.data, idAutor, camposPropostos: campos, mensagem },
      });

      // RF23/RB04: a mesma mudança proposta por usuários diferentes se confirma sozinha.
      const pendentes = await prisma.sugestaoEdicao.findMany({
        where: { idPonto: id.data, status: StatusSolicitacao.PENDENTE, idAutor: { not: idAutor } },
      });

      const confirmacoes = pendentes.filter((outra) =>
        mesmaProposta(outra.camposPropostos as Record<string, unknown>, campos),
      );

      const autoresDistintos = new Set([idAutor, ...confirmacoes.map((c) => c.idAutor)]);

      if (autoresDistintos.size >= CONFIRMACOES_PARA_APLICAR) {
        const idsConfirmados = [sugestao.id, ...confirmacoes.map((c) => c.id)];

        await prisma.$transaction(async (tx) => {
          await aplicarCamposAoPonto(tx, ponto, campos, "sugestao_confirmada_por_usuarios", idAutor);

          await tx.sugestaoEdicao.updateMany({
            where: { id: { in: idsConfirmados } },
            data: { status: StatusSolicitacao.APROVADA, dataResolucao: new Date() },
          });
        });

        for (const idConfirmado of autoresDistintos) {
          await incrementarReputacao(idConfirmado, PONTOS_REPUTACAO.SUGESTAO_APROVADA);

          if (idConfirmado !== idAutor) {
            await criarNotificacao(
              idConfirmado,
              `Sua sugestão para "${ponto.nome}" foi confirmada por outro usuário e aplicada.`,
              `/pontos/${ponto.id}`,
            );
          }
        }

        await registrarAuditoria({
          idUsuario: idAutor,
          acao: "sugestao_confirmada",
          entidade: "ponto_turistico",
          idEntidade: id.data,
          detalhes: { confirmacoes: autoresDistintos.size },
        });

        return res.status(201).json({
          ...sugestao,
          status: StatusSolicitacao.APROVADA,
          aplicadaAutomaticamente: true,
          motivoAplicacao: "confirmacoes",
        });
      }

      await registrarAuditoria({
        idUsuario: idAutor,
        acao: "sugerir_edicao",
        entidade: "ponto_turistico",
        idEntidade: id.data,
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

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "solicitar_verificacao",
        entidade: "ponto_turistico",
        idEntidade: id.data,
      });

      await notificarModeradores(`Nova solicitação de selo para "${ponto.nome}".`, "/moderacao");

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
      const moderador = ehModerador(req.usuario!.tipoConta);

      if (!ehDono && !moderador) {
        return res.status(403).json({ erro: "Você não tem permissão para restaurar este ponto." });
      }

      // RB09: restaurar conteúdo de um ponto já publicado é papel da moderação. O dono só
      // pode voltar versões enquanto o ponto ainda é rascunho (ou foi rejeitado), antes de
      // passar pela aprovação; senão restaurar seria um jeito de burlar a moderação.
      if (!moderador && ponto.status !== StatusPonto.RASCUNHO && ponto.status !== StatusPonto.REJEITADO) {
        return res.status(403).json({
          erro: "A restauração de um ponto publicado ou em análise é feita pela moderação.",
        });
      }

      const versao = await prisma.versaoPonto.findFirst({
        where: { id: versaoId.data, idPonto: id.data },
      });

      if (!versao) {
        return res.status(404).json({ erro: "Versão não encontrada." });
      }

      // A própria restauração gera uma nova versão do estado atual, para que a
      // ação seja reversível (RB09).
      const ponteAtualizado = await prisma.$transaction(async (tx) => {
        await registrarVersaoPonto(ponto, "antes_de_restaurar", req.usuario!.id, tx);

        return tx.pontoTuristico.update({
          where: { id: id.data },
          data: {
            ...(versao.dados as Prisma.PontoTuristicoUpdateInput),
            versao: { increment: 1 },
          },
          select: pontoSelecaoCompleta,
        });
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
      select: {
        id: true,
        idPonto: true,
        idAutor: true,
        nota: true,
        comentario: true,
        fotoUrl: true,
        dataCriacao: true,
        autor: { select: { id: true, nome: true } },
      },
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

// A foto é opcional: com ela a requisição vem como multipart/form-data; sem ela, como JSON.
function receberFotoDaAvaliacao(req: Request, res: Response, next: NextFunction) {
  if (req.is("multipart/form-data")) {
    return receberImagem("foto", "avaliacoes")(req, res, next);
  }

  return next();
}

pontosRouter.post(
  "/:id/avaliacoes",
  autenticar,
  limiteContribuicao,
  receberFotoDaAvaliacao,
  async (req: Request, res: Response) => {
    const arquivo = req.file;

    try {
      const id = idSchema.safeParse(req.params.id);

      if (!id.success) {
        await removerArquivoLocal(arquivo?.path);
        return res.status(400).json({ erro: "Identificador inválido." });
      }

      const resultado = avaliacaoSchema.safeParse(req.body);

      if (!resultado.success) {
        await removerArquivoLocal(arquivo?.path);

        return res.status(400).json({
          erro: "Dados da avaliação inválidos.",
          detalhes: resultado.error.flatten(),
        });
      }

      const ponto = await prisma.pontoTuristico.findFirst({
        where: { id: id.data, status: StatusPonto.PUBLICADO },
        select: { id: true, nome: true },
      });

      if (!ponto) {
        await removerArquivoLocal(arquivo?.path);
        return res.status(404).json({ erro: "Ponto turístico não encontrado." });
      }

      // RF15: filtro automático de spam/linguagem; foto sempre passa por revisão humana
      // (não dá para julgar uma imagem automaticamente). O que não é retido é publicado.
      const comentario = resultado.data.comentario || null;
      const suspeito = conteudoSuspeito(comentario);
      const retida = suspeito || Boolean(arquivo);
      const motivoRetencao = suspeito ? "conteudo_suspeito" : arquivo ? "foto_anexada" : null;

      let avaliacao;

      try {
        avaliacao = await prisma.avaliacao.create({
          data: {
            idPonto: id.data,
            idAutor: req.usuario!.id,
            nota: resultado.data.nota,
            comentario,
            fotoUrl: arquivo ? caminhoPublicoImagem(arquivo, "avaliacoes") : null,
            status: retida ? StatusSolicitacao.PENDENTE : StatusSolicitacao.APROVADA,
            motivoRetencao,
          },
        });
      } catch (erro) {
        await removerArquivoLocal(arquivo?.path);

        // A trava é do banco (índice único), então vale mesmo com requisições simultâneas.
        if (ehViolacaoDeUnicidade(erro)) {
          return res.status(409).json({ erro: "Você já avaliou este ponto." });
        }

        throw erro;
      }

      registrarEvento("avaliacao");

      if (!retida) {
        await incrementarReputacao(req.usuario!.id, PONTOS_REPUTACAO.AVALIACAO_APROVADA);
      } else {
        await notificarModeradores(
          suspeito
            ? `Avaliação sinalizada como suspeita em "${ponto.nome}".`
            : `Avaliação com foto aguardando revisão em "${ponto.nome}".`,
          "/moderacao",
        );
      }

      await registrarAuditoria({
        idUsuario: req.usuario!.id,
        acao: "criar",
        entidade: "avaliacao",
        idEntidade: avaliacao.id,
      });

      return res.status(201).json({ ...avaliacao, retidaParaModeracao: retida });
    } catch (error) {
      await removerArquivoLocal(arquivo?.path);
      console.error("Erro ao criar avaliação:", error);

      return res.status(500).json({ erro: "Erro interno ao criar avaliação." });
    }
  },
);

export default pontosRouter;
