import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { estaAbertoNoHorario } from "./horarios";
import { variantesDaCidade } from "./cidades";

// Busca de pontos turísticos (RF08/RF09). Uma única consulta cobre busca por texto,
// filtros, proximidade (PostGIS) e média de avaliações.

export const RAIO_BUSCA_KM_PADRAO = 10;
export const RAIO_BUSCA_KM_MAXIMO = 200;
export const ORDENACOES = ["relevancia", "distancia", "nome", "avaliacao"] as const;

export type Ordenacao = (typeof ORDENACOES)[number];

export interface FiltrosBusca {
  cidade?: string;
  categoria?: string;
  busca?: string;
  acessibilidade?: string;
  faixaPreco?: string;
  lat?: number;
  lng?: number;
  raioKm: number;
  limite: number;
  notaMinima?: number;
  abertoAgora?: boolean;
  ordenar?: Ordenacao;
}

export interface PontoBusca {
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
  imagemCredito: string | null;
  status: string;
  seloVerificado: boolean;
  mediaAvaliacao: number | null;
  totalAvaliacoes: number;
  distanciaMetros?: number;
}

export interface ResultadoBusca {
  total: number;
  dados: PontoBusca[];
  /** true quando a resposta veio do cache porque o banco não respondeu a tempo. */
  desatualizado?: boolean;
}

/** Faz % e _ digitados pelo usuário valerem como caracteres comuns no ILIKE. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

function contem(texto: string): string {
  return `%${escaparLike(texto)}%`;
}

function montarOrdenacao(filtros: FiltrosBusca, comCoordenadas: boolean): Prisma.Sql {
  const ordenacao: Ordenacao = filtros.ordenar ?? (comCoordenadas ? "distancia" : "relevancia");

  switch (ordenacao) {
    case "distancia":
      return comCoordenadas
        ? Prisma.sql`"distanciaMetros" ASC, p.nome ASC`
        : Prisma.sql`p.nome ASC`;
    case "avaliacao":
      return Prisma.sql`a.media DESC NULLS LAST, a.total DESC NULLS LAST, p.nome ASC`;
    case "relevancia": {
      const peso = filtros.busca
        ? Prisma.sql`CASE
            WHEN p.nome ILIKE ${`${escaparLike(filtros.busca)}%`} THEN 0
            WHEN p.nome ILIKE ${contem(filtros.busca)} THEN 1
            ELSE 2
          END,`
        : Prisma.empty;

      // Entre pontos igualmente bem avaliados, vêm primeiro os de cadastro mais completo:
      // com a base importada do OpenStreetMap, muitos ainda não têm foto nem horário.
      const completude = Prisma.sql`(
        CASE WHEN p.imagem_url IS NOT NULL THEN 2 ELSE 0 END
        + CASE WHEN p.horario_funcionamento IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN p.site_oficial IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN p.acessibilidade IS NOT NULL THEN 1 ELSE 0 END
      )`;

      return Prisma.sql`${peso} p.selo_verificado DESC, a.media DESC NULLS LAST, ${completude} DESC, p.nome ASC`;
    }
    default:
      return Prisma.sql`p.nome ASC`;
  }
}

export async function buscarPontos(filtros: FiltrosBusca): Promise<ResultadoBusca> {
  const comCoordenadas = filtros.lat !== undefined && filtros.lng !== undefined;

  const condicoes: Prisma.Sql[] = [Prisma.sql`p.status = 'PUBLICADO'`];

  if (comCoordenadas) {
    condicoes.push(
      Prisma.sql`p.geom IS NOT NULL`,
      Prisma.sql`ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(${filtros.lng}, ${filtros.lat}), 4326)::geography, ${filtros.raioKm * 1000})`,
    );
  }

  if (filtros.cidade) {
    // "Florianopolis" ou "Joinville, SC" acham a cidade certa; o que não corresponde a uma
    // cidade inteira continua valendo como trecho do nome ("Florian").
    const variantes = await variantesDaCidade(filtros.cidade);

    condicoes.push(
      variantes.length > 0
        ? Prisma.sql`p.cidade IN (${Prisma.join(variantes)})`
        : Prisma.sql`p.cidade ILIKE ${contem(filtros.cidade)}`,
    );
  }
  if (filtros.categoria) condicoes.push(Prisma.sql`p.categoria ILIKE ${contem(filtros.categoria)}`);
  if (filtros.acessibilidade) {
    condicoes.push(Prisma.sql`p.acessibilidade ILIKE ${contem(filtros.acessibilidade)}`);
  }
  if (filtros.faixaPreco) condicoes.push(Prisma.sql`p.faixa_preco ILIKE ${contem(filtros.faixaPreco)}`);
  if (filtros.busca) {
    condicoes.push(
      Prisma.sql`(p.nome ILIKE ${contem(filtros.busca)} OR p.descricao ILIKE ${contem(filtros.busca)})`,
    );
  }
  if (filtros.notaMinima !== undefined) {
    condicoes.push(Prisma.sql`COALESCE(a.media, 0) >= ${filtros.notaMinima}`);
  }

  // "Aberto agora" depende do texto livre de horário, que só o código sabe interpretar:
  // busca mais linhas do que o pedido e filtra depois.
  const limiteConsulta = filtros.abertoAgora ? Math.min(filtros.limite * 5, 500) : filtros.limite;

  const distancia = comCoordenadas
    ? Prisma.sql`, ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(${filtros.lng}, ${filtros.lat}), 4326)::geography) AS "distanciaMetros"`
    : Prisma.empty;

  const linhas = await prisma.$queryRaw<PontoBusca[]>`
    SELECT
      p.id, p.nome, p.descricao, p.categoria, p.cidade, p.endereco, p.latitude, p.longitude,
      p.faixa_preco AS "faixaPreco", p.acessibilidade, p.site_oficial AS "siteOficial",
      p.telefone_contato AS "telefoneContato", p.horario_funcionamento AS "horarioFuncionamento",
      p.imagem_url AS "imagemUrl", p.imagem_credito AS "imagemCredito", p.status::text AS status, p.selo_verificado AS "seloVerificado",
      a.media AS "mediaAvaliacao", COALESCE(a.total, 0) AS "totalAvaliacoes"
      ${distancia}
    FROM ponto_turistico p
    LEFT JOIN (
      SELECT id_ponto, AVG(nota)::float8 AS media, COUNT(*)::int AS total
      FROM avaliacao
      WHERE status = 'APROVADA'
      GROUP BY id_ponto
    ) a ON a.id_ponto = p.id
    WHERE ${Prisma.join(condicoes, " AND ")}
    ORDER BY ${montarOrdenacao(filtros, comCoordenadas)}
    LIMIT ${limiteConsulta}
  `;

  const agora = new Date();

  const dados = (
    filtros.abertoAgora
      ? linhas.filter((linha) => estaAbertoNoHorario(linha.horarioFuncionamento, agora))
      : linhas
  )
    .slice(0, filtros.limite)
    .map((linha) => ({
      ...linha,
      totalAvaliacoes: Number(linha.totalAvaliacoes),
      ...(linha.distanciaMetros !== undefined ? { distanciaMetros: Number(linha.distanciaMetros) } : {}),
    }));

  return { total: dados.length, dados };
}

// AF02: se a busca demorar demais ou o banco falhar, devolve o último resultado igual
// (se houver, e ainda recente) marcado como desatualizado, em vez de só dar erro.

export class ErroTempoEsgotado extends Error {
  constructor() {
    super("A busca excedeu o tempo limite.");
  }
}

interface OpcoesBuscador {
  executar: (filtros: FiltrosBusca) => Promise<ResultadoBusca>;
  tempoLimiteMs: number;
  validadeCacheMs?: number;
  maxEntradas?: number;
  agora?: () => number;
}

export function criarBuscador(opcoes: OpcoesBuscador) {
  const validade = opcoes.validadeCacheMs ?? 5 * 60 * 1000;
  const maxEntradas = opcoes.maxEntradas ?? 200;
  const agora = opcoes.agora ?? Date.now;
  const cache = new Map<string, { valor: ResultadoBusca; em: number }>();

  return async function buscar(filtros: FiltrosBusca): Promise<ResultadoBusca> {
    const chave = JSON.stringify(
      Object.entries(filtros)
        .filter(([, valor]) => valor !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    );

    let temporizador: NodeJS.Timeout | undefined;

    try {
      const resultado = await Promise.race([
        opcoes.executar(filtros),
        new Promise<never>((_, rejeitar) => {
          temporizador = setTimeout(() => rejeitar(new ErroTempoEsgotado()), opcoes.tempoLimiteMs);
        }),
      ]);

      cache.delete(chave);
      cache.set(chave, { valor: resultado, em: agora() });

      if (cache.size > maxEntradas) {
        const maisAntiga = cache.keys().next().value;
        if (maisAntiga !== undefined) cache.delete(maisAntiga);
      }

      return resultado;
    } catch (erro) {
      const guardado = cache.get(chave);

      if (guardado && agora() - guardado.em < validade) {
        return { ...guardado.valor, desatualizado: true };
      }

      throw erro;
    } finally {
      if (temporizador) clearTimeout(temporizador);
    }
  };
}

export const buscarComFallback = criarBuscador({
  executar: buscarPontos,
  tempoLimiteMs: Number(process.env.BUSCA_TIMEOUT_MS) || 5000,
});
