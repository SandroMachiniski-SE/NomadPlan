import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "./prisma";

type Cliente = PrismaClient | Prisma.TransactionClient;

// RF26: histórico de versões também para roteiros. Cada alteração guarda antes um
// retrato do roteiro (campos + paradas), para auditar ou voltar atrás.

export const MAX_VERSOES_POR_ROTEIRO = 50;

export interface DadosVersaoRoteiro {
  nome: string;
  descricao: string | null;
  cidade: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  // `dia` não existe nas versões gravadas antes do roteiro por dia: valem como dia 1. As
  // atividades livres (sem idPonto), o período e a pernoite vieram depois e são opcionais.
  itens: {
    idPonto: number | null;
    ordem: number;
    dia?: number;
    observacao: string | null;
    custoCentavos?: number | null;
    titulo?: string | null;
    periodo?: "MANHA" | "TARDE" | "NOITE" | "DIA_INTEIRO" | null;
    pernoite?: boolean;
  }[];
}

export async function registrarVersaoRoteiro(
  idRoteiro: number,
  motivo: string,
  idAutor: number | null,
  cliente: Cliente = prisma,
): Promise<void> {
  const roteiro = await cliente.roteiro.findUnique({
    where: { id: idRoteiro },
    include: {
      itens: {
        orderBy: [{ dia: "asc" }, { pernoite: "asc" }, { ordem: "asc" }],
        select: {
          idPonto: true,
          ordem: true,
          dia: true,
          observacao: true,
          custoCentavos: true,
          titulo: true,
          periodo: true,
          pernoite: true,
        },
      },
    },
  });

  if (!roteiro) {
    return;
  }

  const dados: DadosVersaoRoteiro = {
    nome: roteiro.nome,
    descricao: roteiro.descricao,
    cidade: roteiro.cidade,
    dataInicio: roteiro.dataInicio ? roteiro.dataInicio.toISOString() : null,
    dataFim: roteiro.dataFim ? roteiro.dataFim.toISOString() : null,
    itens: roteiro.itens,
  };

  await cliente.versaoRoteiro.create({
    data: { idRoteiro, dados: dados as unknown as Prisma.InputJsonValue, idAutor, motivo },
  });

  const excedentes = await cliente.versaoRoteiro.findMany({
    where: { idRoteiro },
    orderBy: { id: "desc" },
    skip: MAX_VERSOES_POR_ROTEIRO,
    select: { id: true },
  });

  if (excedentes.length > 0) {
    await cliente.versaoRoteiro.deleteMany({ where: { id: { in: excedentes.map((v) => v.id) } } });
  }
}
