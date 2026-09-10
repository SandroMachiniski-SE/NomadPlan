import { Request, Response, NextFunction } from "express";
import type { TipoConta } from "@prisma/client";
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

export function autenticar(req: Request, res: Response, next: NextFunction) {
  const cabecalho = req.headers.authorization;

  if (!cabecalho || !cabecalho.startsWith("Bearer ")) {
    return res.status(401).json({
      erro: "Autenticação necessária. Faça login para continuar.",
    });
  }

  const token = cabecalho.slice("Bearer ".length);

  try {
    const payload = verificarToken(token);

    req.usuario = {
      id: payload.sub,
      tipoConta: payload.tipoConta,
    };

    return next();
  } catch {
    return res.status(401).json({
      erro: "Sessão inválida ou expirada. Faça login novamente.",
    });
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
