import { Router, Request, Response } from "express";
import { z } from "zod";
import { TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  gerarHashSenha,
  gerarToken,
  gerarTokenRedefinicaoSenha,
  verificarSenha,
  verificarTokenRedefinicaoSenha,
} from "../lib/auth";
import { autenticar } from "../middleware/auth";
import { limiteCriacaoConta, limiteLogin } from "../middleware/rateLimit";

const authRouter = Router();

const tiposContaPublicos = [
  TipoConta.VISITANTE,
  TipoConta.MORADOR,
  TipoConta.NEGOCIO,
  TipoConta.GESTOR,
] as const;

const registrarSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(180),
  senha: z.string().min(8).max(72),
  tipoConta: z.enum(tiposContaPublicos).default(TipoConta.VISITANTE),
  cidadeBase: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(1),
});

const atualizarPerfilSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  cidadeBase: z.string().trim().max(120).nullable().optional(),
  interesses: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

const esqueciSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const redefinirSenhaSchema = z.object({
  token: z.string().min(1),
  novaSenha: z.string().min(8).max(72),
});

const usuarioSelecaoPublica = {
  id: true,
  nome: true,
  email: true,
  tipoConta: true,
  cidadeBase: true,
  interesses: true,
  reputacao: true,
  dataCriacao: true,
} as const;

authRouter.post("/registrar", limiteCriacaoConta, async (req: Request, res: Response) => {
  try {
    const resultado = registrarSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados de cadastro inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const dados = resultado.data;

    const existente = await prisma.usuario.findUnique({
      where: { email: dados.email },
      select: { id: true },
    });

    if (existente) {
      return res.status(409).json({
        erro: "Já existe uma conta cadastrada com este e-mail.",
      });
    }

    const senhaHash = await gerarHashSenha(dados.senha);

    const usuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: dados.email,
        senhaHash,
        tipoConta: dados.tipoConta,
        cidadeBase: dados.cidadeBase || null,
      },
      select: usuarioSelecaoPublica,
    });

    const token = gerarToken({ sub: usuario.id, tipoConta: usuario.tipoConta });

    return res.status(201).json({ usuario, token });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);

    return res.status(500).json({
      erro: "Erro interno ao registrar usuário.",
    });
  }
});

authRouter.post("/login", limiteLogin, async (req: Request, res: Response) => {
  try {
    const resultado = loginSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Informe e-mail e senha válidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const { email, senha } = resultado.data;

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    const senhaValida = usuario
      ? await verificarSenha(senha, usuario.senhaHash)
      : false;

    if (!usuario || !senhaValida) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos.",
      });
    }

    if (!usuario.ativo) {
      return res.status(403).json({
        erro: "Esta conta está desativada.",
      });
    }

    const token = gerarToken({ sub: usuario.id, tipoConta: usuario.tipoConta });

    const { senhaHash: _senhaHash, ativo: _ativo, ...usuarioPublico } = usuario;

    return res.json({ usuario: usuarioPublico, token });
  } catch (error) {
    console.error("Erro ao autenticar usuário:", error);

    return res.status(500).json({
      erro: "Erro interno ao autenticar usuário.",
    });
  }
});

authRouter.get("/me", autenticar, async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: usuarioSelecaoPublica,
    });

    if (!usuario) {
      return res.status(404).json({
        erro: "Usuário não encontrado.",
      });
    }

    return res.json(usuario);
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);

    return res.status(500).json({
      erro: "Erro interno ao buscar perfil.",
    });
  }
});

authRouter.put("/me", autenticar, async (req: Request, res: Response) => {
  try {
    const resultado = atualizarPerfilSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados de perfil inválidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const dados = resultado.data;

    const usuario = await prisma.usuario.update({
      where: { id: req.usuario!.id },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.cidadeBase !== undefined
          ? { cidadeBase: dados.cidadeBase || null }
          : {}),
        ...(dados.interesses !== undefined ? { interesses: dados.interesses } : {}),
      },
      select: usuarioSelecaoPublica,
    });

    return res.json(usuario);
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    return res.status(500).json({
      erro: "Erro interno ao atualizar perfil.",
    });
  }
});

authRouter.post("/esqueci-senha", async (req: Request, res: Response) => {
  try {
    const resultado = esqueciSenhaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Informe um e-mail válido.",
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: resultado.data.email },
      select: { id: true },
    });

    // Resposta genérica sempre — evita que a rota revele quais e-mails existem.
    if (usuario) {
      const token = gerarTokenRedefinicaoSenha(usuario.id);

      // TODO(módulo futuro): substituir por envio real de e-mail (RF02).
      // Por ora, o link é registrado no log do servidor para uso em ambiente de
      // desenvolvimento/demonstração acadêmica.
      const linkRedefinicao = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/redefinir-senha?token=${token}`;
      console.log(`Link de redefinição de senha para ${resultado.data.email}: ${linkRedefinicao}`);
    }

    return res.json({
      mensagem:
        "Se houver uma conta com este e-mail, enviaremos instruções de redefinição.",
    });
  } catch (error) {
    console.error("Erro ao solicitar redefinição de senha:", error);

    return res.status(500).json({
      erro: "Erro interno ao solicitar redefinição de senha.",
    });
  }
});

authRouter.post("/redefinir-senha", async (req: Request, res: Response) => {
  try {
    const resultado = redefinirSenhaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados inválidos para redefinição de senha.",
        detalhes: resultado.error.flatten(),
      });
    }

    let idUsuario: number;

    try {
      idUsuario = verificarTokenRedefinicaoSenha(resultado.data.token);
    } catch {
      return res.status(400).json({
        erro: "Token de redefinição inválido ou expirado.",
      });
    }

    const senhaHash = await gerarHashSenha(resultado.data.novaSenha);

    await prisma.usuario.update({
      where: { id: idUsuario },
      data: { senhaHash },
    });

    return res.json({
      mensagem: "Senha redefinida com sucesso. Faça login com a nova senha.",
    });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);

    return res.status(500).json({
      erro: "Erro interno ao redefinir senha.",
    });
  }
});

export default authRouter;
