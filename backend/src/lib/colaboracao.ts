import prisma from "./prisma";

// Roteiro colaborativo: quem pode fazer o quê.
//
//  - DONO: tudo (inclusive excluir, compartilhar o link público e gerenciar convidados).
//  - EDITOR: altera paradas, dias, custos, checklist, notas e dados do roteiro.
//  - LEITOR: só consulta.

export type Papel = "DONO" | "EDITOR" | "LEITOR";
export type Nivel = "leitura" | "edicao" | "dono";

const PESO: Record<Papel, number> = { LEITOR: 1, EDITOR: 2, DONO: 3 };
const EXIGIDO: Record<Nivel, number> = { leitura: 1, edicao: 2, dono: 3 };

export function papelPermite(papel: Papel, nivel: Nivel): boolean {
  return PESO[papel] >= EXIGIDO[nivel];
}

/**
 * Nível mínimo exigido por uma requisição a /roteiros/:id/<resto>. Consultas pedem
 * leitura; o que muda o roteiro pede edição; excluir, compartilhar publicamente e
 * convidar pedem o dono. A gestão de colaboradores confere o papel na própria rota
 * (o dono gerencia, e qualquer participante pode sair).
 */
export function nivelExigido(metodo: string, resto: string): Nivel {
  const rota = resto.replace(/\/+$/, "") || "/";

  if (metodo === "GET" || metodo === "HEAD") {
    return rota.startsWith("/convites") ? "dono" : "leitura";
  }

  if (rota.startsWith("/colaboradores")) {
    return "leitura";
  }

  if (rota === "/" && metodo === "DELETE") {
    return "dono";
  }

  if (rota.startsWith("/compartilhar") || rota.startsWith("/convites")) {
    return "dono";
  }

  return "edicao";
}

/** Papel da pessoa no roteiro, ou nulo se ela não participa dele. */
export async function papelNoRoteiro(idRoteiro: number, idUsuario: number): Promise<Papel | null> {
  const roteiro = await prisma.roteiro.findUnique({
    where: { id: idRoteiro },
    select: { idUsuario: true, colaboradores: { where: { idUsuario }, select: { papel: true } } },
  });

  if (!roteiro) {
    return null;
  }

  if (roteiro.idUsuario === idUsuario) {
    return "DONO";
  }

  return roteiro.colaboradores[0]?.papel ?? null;
}

export const MAX_PARTICIPANTES = 10;
