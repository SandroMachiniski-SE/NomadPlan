import { TipoConta } from "@prisma/client";
import prisma from "./prisma";
import { registrarAuditoria } from "./auditoria";
import { criarNotificacao } from "./notificacoes";

// AF01: tentativas de login ficam no log de segurança (usuário/IP/horário) e uma
// sequência de bloqueios gera alerta aos administradores.

const JANELA_ALERTA_MS = 60 * 60 * 1000;
const BLOQUEIOS_PARA_ALERTA = 3;

export async function registrarFalhaLogin(params: {
  idUsuario: number | null;
  ip: string;
  motivo: "senha_invalida" | "codigo_mfa_invalido";
}): Promise<void> {
  // O e-mail digitado não é guardado: quando a conta não existe, o campo pode conter
  // uma senha digitada no lugar errado.
  await registrarAuditoria({
    idUsuario: params.idUsuario,
    acao: "login_falhou",
    entidade: "autenticacao",
    detalhes: { ip: params.ip, motivo: params.motivo },
  });
}

export async function registrarBloqueioLogin(ip: string, escopo: "ip" | "conta"): Promise<void> {
  await registrarAuditoria({
    idUsuario: null,
    acao: "login_bloqueado",
    entidade: "autenticacao",
    detalhes: { ip, escopo },
  });

  try {
    const desde = new Date(Date.now() - JANELA_ALERTA_MS);

    const bloqueios = await prisma.logAuditoria.count({
      where: { acao: "login_bloqueado", dataCriacao: { gte: desde } },
    });

    if (bloqueios < BLOQUEIOS_PARA_ALERTA) {
      return;
    }

    const alertasRecentes = await prisma.logAuditoria.count({
      where: { acao: "alerta_forca_bruta", dataCriacao: { gte: desde } },
    });

    if (alertasRecentes > 0) {
      return;
    }

    await registrarAuditoria({
      idUsuario: null,
      acao: "alerta_forca_bruta",
      entidade: "autenticacao",
      detalhes: { bloqueiosNaUltimaHora: bloqueios },
    });

    const admins = await prisma.usuario.findMany({
      where: { tipoConta: TipoConta.ADMIN, ativo: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        criarNotificacao(
          admin.id,
          `Possível ataque de força bruta: ${bloqueios} bloqueios de login na última hora.`,
          "/admin",
        ),
      ),
    );
  } catch (error) {
    console.error("Erro ao avaliar alerta de força bruta:", error);
  }
}
