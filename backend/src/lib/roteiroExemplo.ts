import { PeriodoDoDia, StatusPonto } from "@prisma/client";
import prisma from "./prisma";

// Roteiro de demonstração no formato de um caderno de viagem: vários dias e cidades, bate-voltas a
// partir de uma cidade-base, atividades livres ("Rolê pelo centro"), períodos do dia, trilha com
// acampamento e onde dormir em cada noite. Cada parada aponta para um ponto real pelo nome; se o
// ponto não existir no banco, vira uma atividade livre com o mesmo nome (o roteiro nunca quebra).

export const NOME_DO_ROTEIRO_EXEMPLO = "Caderno de viagem: Norte de SC, Serra e Ilha em 10 dias";

interface ParadaDoExemplo {
  /** Ponto do banco, pelo nome exato. */
  ponto?: string;
  /** Atividade livre. */
  titulo?: string;
  periodo?: PeriodoDoDia;
  observacao?: string;
}

interface DiaDoExemplo {
  cidade: string;
  paradas: ParadaDoExemplo[];
  /** Onde dormir: hospedagem do banco (pelo nome) ou texto livre. */
  pernoite?: { ponto?: string; titulo?: string };
}

const { MANHA, TARDE, NOITE, DIA_INTEIRO } = PeriodoDoDia;

export const DIAS_DO_EXEMPLO: DiaDoExemplo[] = [
  {
    cidade: "Joinville",
    paradas: [
      { titulo: "Rolê pelo centro histórico e pela Rua das Palmeiras", periodo: MANHA },
      { ponto: "Museu Nacional de Imigração e Colonização", periodo: TARDE },
      { ponto: "Zum Schlauch", periodo: NOITE, observacao: "Jantar de comida alemã" },
    ],
    pernoite: { ponto: "Hotel Tannenhof" },
  },
  {
    cidade: "Joinville",
    paradas: [
      { ponto: "Museu Arqueológico de Sambaqui de Joinville", periodo: MANHA },
      { ponto: "Museu de Arte de Joinville", periodo: TARDE },
      { ponto: "Complexo Estação da Memória", periodo: TARDE },
    ],
    pernoite: { ponto: "Hotel Tannenhof" },
  },
  {
    cidade: "São Francisco do Sul",
    paradas: [
      { titulo: "Bate-volta: rolê pelo centro histórico de São Francisco do Sul", periodo: MANHA },
      { ponto: "Museu Nacional do Mar", periodo: MANHA },
      { ponto: "Forte Marechal Luz", periodo: TARDE },
      { ponto: "Praia de Enseada", periodo: TARDE, observacao: "Pôr do sol na praia antes de voltar" },
    ],
    pernoite: { ponto: "Hotel Tannenhof" },
  },
  {
    cidade: "Blumenau",
    paradas: [
      { ponto: "Museu da Cerveja", periodo: TARDE },
      { ponto: "Portal da Vila Germânica", periodo: TARDE },
      { ponto: "Hofbräuhaus Blumenau", periodo: NOITE },
    ],
    pernoite: { ponto: "Hotel Glória Blumenau" },
  },
  {
    cidade: "Pomerode",
    paradas: [
      { titulo: "Bate-volta: Rota do Enxaimel de bicicleta", periodo: MANHA },
      { ponto: "Casa do Imigrante Carl Weege", periodo: MANHA },
      { ponto: "Bioparque Zoo Pomerode", periodo: TARDE },
      { ponto: "Museu Pomerano", periodo: TARDE },
    ],
    pernoite: { ponto: "Hotel Glória Blumenau" },
  },
  {
    cidade: "Urubici",
    paradas: [
      { titulo: "Road trip pela serra até Urubici", periodo: DIA_INTEIRO },
      { ponto: "Cascata do Avencal", periodo: TARDE },
    ],
    pernoite: { ponto: "Pousada e Bistrô Encanto do Avencal" },
  },
  {
    cidade: "Urubici",
    paradas: [
      { titulo: "Trekking até a Pedra Furada", periodo: MANHA, observacao: "Levar água, lanche e roupa para o frio" },
      { ponto: "Morro da Igreja", periodo: TARDE },
      { ponto: "Inscrições Rupestres", periodo: TARDE },
      { titulo: "Céu estrelado no acampamento", periodo: NOITE },
    ],
    pernoite: { ponto: "Camping Nossa Senhora da Graça" },
  },
  {
    cidade: "Urubici",
    paradas: [
      { titulo: "Volta do acampamento", periodo: MANHA },
      { ponto: "Cascata Véu de Noiva", periodo: MANHA },
      { titulo: "Descida da serra rumo a Florianópolis", periodo: TARDE },
    ],
    pernoite: { ponto: "Hotel Castelmar" },
  },
  {
    cidade: "Florianópolis",
    paradas: [
      { titulo: "Stand up e caiaque na Lagoa da Conceição", periodo: MANHA },
      { ponto: "Mirante da Lagoa da Conceição", periodo: MANHA },
      { ponto: "Santo Antônio de Lisboa", periodo: TARDE, observacao: "Vilarejo açoriano; ostras no fim da tarde" },
    ],
    pernoite: { ponto: "Hotel Castelmar" },
  },
  {
    cidade: "Florianópolis",
    paradas: [
      { titulo: "Trilha até a Lagoinha do Leste", periodo: MANHA },
      { ponto: "Praia da Lagoinha do Leste", periodo: MANHA },
      { ponto: "Praia da Freguesia do Ribeirão da Ilha", periodo: TARDE, observacao: "Vilarejo do Ribeirão da Ilha" },
      { ponto: "Mercado Público Aldírio Simões", periodo: NOITE },
    ],
  },
];

async function idDoPonto(nome: string, cidade: string | undefined): Promise<number | null> {
  const ponto = await prisma.pontoTuristico.findFirst({
    where: { nome, ...(cidade ? { cidade } : {}), status: StatusPonto.PUBLICADO },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  return ponto?.id ?? null;
}

/** Cria o roteiro de exemplo para a pessoa, se ela ainda não tem um com esse nome. */
export async function criarRoteiroDeExemplo(idUsuario: number): Promise<{ criado: boolean; semPonto: string[] }> {
  const existente = await prisma.roteiro.findFirst({ where: { idUsuario, nome: NOME_DO_ROTEIRO_EXEMPLO } });

  if (existente) {
    return { criado: false, semPonto: [] };
  }

  const semPonto: string[] = [];
  const usados = new Set<number>();
  const itens: {
    idPonto: number | null;
    titulo: string | null;
    dia: number;
    ordem: number;
    periodo: PeriodoDoDia | null;
    pernoite: boolean;
    observacao: string | null;
  }[] = [];

  for (const [indice, dia] of DIAS_DO_EXEMPLO.entries()) {
    const paradas = [...dia.paradas, ...(dia.pernoite ? [{ ...dia.pernoite, pernoite: true }] : [])];

    for (const parada of paradas) {
      const pernoite = "pernoite" in parada;
      // Nos bate-voltas, dorme-se na cidade-base: o hotel pode ser de outra cidade.
      let idPonto = parada.ponto
        ? ((await idDoPonto(parada.ponto, dia.cidade)) ?? (pernoite ? await idDoPonto(parada.ponto, undefined) : null))
        : null;

      // Como visita, cada ponto entra uma vez só (a pernoite pode repetir o hotel).
      if (idPonto !== null && !pernoite && usados.has(idPonto)) idPonto = null;
      if (idPonto !== null && !pernoite) usados.add(idPonto);
      if (parada.ponto && idPonto === null) semPonto.push(`${parada.ponto} (${dia.cidade})`);

      itens.push({
        idPonto,
        titulo: idPonto === null ? (parada.titulo ?? parada.ponto ?? null) : null,
        dia: indice + 1,
        ordem: itens.length,
        periodo: "periodo" in parada ? (parada.periodo ?? null) : null,
        pernoite,
        observacao: "observacao" in parada ? (parada.observacao ?? null) : null,
      });
    }
  }

  await prisma.roteiro.create({
    data: {
      nome: NOME_DO_ROTEIRO_EXEMPLO,
      descricao:
        "Exemplo de planejamento em formato de caderno: base em Joinville com bate-volta a São Francisco do Sul, " +
        "Blumenau e Pomerode, trilha e acampamento na Serra de Urubici e fim da viagem na Ilha de Santa Catarina.",
      idUsuario,
      itens: { create: itens },
    },
  });

  return { criado: true, semPonto };
}
