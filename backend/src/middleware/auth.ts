import { Request, Response, NextFunction } from "express";
import type { TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { verificarToken } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: number;
        tipoConta: TipoConta;
      };
    }
  }
}

/**
 * Valida o token E consulta a conta no banco. O papel que vale é o do banco, não o que
 * foi gravado no token: assim, rebaixar ou desativar uma conta tem efeito imediato em
 * vez de só quando o token (que dura horas) expirar (RB02, RNF09).
 */
async function carregarUsuarioDoToken(cabecalho: string | undefined) {
  if (!cabecalho || !cabecalho.startsWith("Bearer ")) {
    return { motivo: "ausente" as const };
  }

  let idUsuario: number;

  try {
    idUsuario = verificarToken(cabecalho.slice("Bearer ".length)).sub;
  } catch {
    return { motivo: "invalido" as const };
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    select: { id: true, tipoConta: true, ativo: true },
  });

  if (!usuario || !usuario.ativo) {
    return { motivo: "desativada" as const };
  }

  return { motivo: "ok" as const, usuario: { id: usuario.id, tipoConta: usuario.tipoConta } };
}

export async function autenticar(req: Request, res: Response, next: NextFunction) {
  try {
    const resultado = await carregarUsuarioDoToken(req.headers.authorization);

    if (resultado.motivo === "ausente") {
      return res.status(401).json({
        erro: "Autenticação necessária. Faça login para continuar.",
      });
    }

    if (resultado.motivo === "desativada") {
      return res.status(401).json({
        erro: "Esta conta não está mais ativa. Entre em contato com o suporte.",
      });
    }

    if (resultado.motivo === "invalido") {
      return res.status(401).json({
        erro: "Sessão inválida ou expirada. Faça login novamente.",
      });
    }

    req.usuario = resultado.usuario;

    return next();
  } catch (error) {
    return next(error);
  }
}

export async function autenticarOpcional(req: Request, _res: Response, next: NextFunction) {
  try {
    const resultado = await carregarUsuarioDoToken(req.headers.authorization);

    // Token ausente, inválido ou de conta desativada: segue como visitante anônimo.
    if (resultado.motivo === "ok") {
      req.usuario = resultado.usuario;
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export function autorizar(...tiposPermitidos: TipoConta[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({
        erro: "Autenticação necessária. Faça login para continuar.",
      });
    }

    if (!tiposPermitidos.includes(req.usuario.tipoConta)) {
      return res.status(403).json({
        erro: "Você não tem permissão para realizar esta ação.",
      });
    }

    return next();
  };
}
