import { Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * Registra uma ação sensível no log de auditoria (RF20, RNF12). Cobrimos as
 * operações de moderação/administração e as edições de pontos — não instrumentamos
 * literalmente toda rota da API, já que a maioria (buscas, leitura de perfil, etc.)
 * não é uma "operação crítica de CRUD" no sentido do RFC.
 */
export async function registrarAuditoria(params: {
  idUsuario: number | null;
  acao: string;
  entidade: string;
  idEntidade?: number | null;
  detalhes?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.logAuditoria.create({
      data: {
        idUsuario: params.idUsuario,
        acao: params.acao,
        entidade: params.entidade,
        idEntidade: params.idEntidade ?? null,
        detalhes: (params.detalhes as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (error) {
    // Auditoria não deve nunca quebrar a operação principal.
    console.error("Erro ao registrar log de auditoria:", error);
  }
}
