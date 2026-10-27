import { Router, Request, Response } from "express";
import { z } from "zod";
import { TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  gerarHashSenha,
  gerarToken,
  gerarTokenRedefinicaoSenha,
  impressaoSenha,
  impressoesIguais,
  verificarSenha,
  verificarSenhaOuFalso,
  verificarTokenRedefinicaoSenha,
} from "../lib/auth";
import { cifrar, decifrar } from "../lib/criptografia";
import { enviarEmailRedefinicaoSenha } from "../lib/email";
import { registrarAuditoria } from "../lib/auditoria";
import { registrarFalhaLogin } from "../lib/seguranca";
import { gerarSegredoTotp, urlOtpauth, verificarTotp } from "../lib/totp";
import { anonimizarUsuario, ErroPrivacidade, exportarDadosDoUsuario } from "../lib/privacidade";
import { IDIOMAS, PREFERENCIAS_ACESSIBILIDADE } from "../lib/preferencias";
import { registrarEvento } from "../lib/metricasUso";
import { autenticar } from "../middleware/auth";
import {
  limiteCriacaoConta,
  limiteLogin,
  limiteLoginPorEmail,
  limiteRecuperacaoSenha,
} from "../middleware/rateLimit";

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
  // LGPD: o cadastro só é aceito com o consentimento explícito do usuário.
  aceitouPolitica: z.literal(true, {
    error: "É necessário aceitar a Política de Privacidade para criar a conta.",
  }),
});

const codigoMfaSchema = z.string().trim().regex(/^\d{6}$/, "O código tem 6 números.");

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(1),
  codigoMfa: codigoMfaSchema.optional(),
});

const atualizarPerfilSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  cidadeBase: z.string().trim().max(120).nullable().optional(),
  interesses: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  idioma: z.enum(IDIOMAS).optional(),
  preferenciasAcessibilidade: z
    .array(z.enum(PREFERENCIAS_ACESSIBILIDADE as [string, ...string[]]))
    .max(PREFERENCIAS_ACESSIBILIDADE.length)
    .optional(),
});

const esqueciSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const redefinirSenhaSchema = z.object({
  token: z.string().min(1),
  novaSenha: z.string().min(8).max(72),
});

const confirmarComSenhaSchema = z.object({
  senha: z.string().min(1),
  codigoMfa: codigoMfaSchema.optional(),
});

const ativarMfaSchema = z.object({ codigo: codigoMfaSchema });

const usuarioSelecaoPublica = {
  id: true,
  nome: true,
  email: true,
  tipoConta: true,
  cidadeBase: true,
  interesses: true,
  idioma: true,
  preferenciasAcessibilidade: true,
  reputacao: true,
  mfaAtivo: true,
  consentimentoEm: true,
  dataCriacao: true,
} as const;

// Último passo TOTP aceito por segredo: impede reaproveitar o mesmo código de 6 dígitos
// enquanto ele ainda está dentro da janela de validade. A chave é o segredo cifrado (único
// a cada configuração), então reconfigurar o 2FA começa do zero.
const ultimoPassoMfa = new Map<string, number>();

function confereCodigoMfa(segredoCifrado: string | null, codigo: string | undefined): boolean {
  if (!segredoCifrado || !codigo) {
    return false;
  }

  const passo = verificarTotp(decifrar(segredoCifrado), codigo);

  if (passo === null || passo <= (ultimoPassoMfa.get(segredoCifrado) ?? -1)) {
    return false;
  }

  ultimoPassoMfa.set(segredoCifrado, passo);

  return true;
}

authRouter.post("/registrar", limiteCriacaoConta, async (req: Request, res: Response) => {
  try {
    const resultado = registrarSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: resultado.error.issues[0]?.path.includes("aceitouPolitica")
          ? resultado.error.issues[0].message
          : "Dados de cadastro inválidos.",
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
        consentimentoEm: new Date(),
      },
      select: usuarioSelecaoPublica,
    });

    registrarEvento("cadastro");

    const token = gerarToken({ sub: usuario.id, tipoConta: usuario.tipoConta });

    return res.status(201).json({ usuario, token });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);

    return res.status(500).json({
      erro: "Erro interno ao registrar usuário.",
    });
  }
});

authRouter.post("/login", limiteLogin, limiteLoginPorEmail, async (req: Request, res: Response) => {
  try {
    const resultado = loginSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Informe e-mail e senha válidos.",
        detalhes: resultado.error.flatten(),
      });
    }

    const { email, senha, codigoMfa } = resultado.data;

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    // Compara sempre (com hash falso se a conta não existe) para não revelar, pelo
    // tempo de resposta, quais e-mails estão cadastrados.
    const senhaValida = await verificarSenhaOuFalso(senha, usuario?.senhaHash);

    if (!usuario || !senhaValida) {
      await registrarFalhaLogin({
        idUsuario: usuario?.id ?? null,
        ip: req.ip ?? "",
        motivo: "senha_invalida",
      });

      return res.status(401).json({
        erro: "E-mail ou senha inválidos. Verifique e tente novamente.",
      });
    }

    if (!usuario.ativo) {
      return res.status(403).json({
        erro: "Esta conta está desativada.",
      });
    }

    if (usuario.mfaAtivo) {
      // Senha correta, mas falta o segundo fator: não é falha (não conta para o bloqueio).
      if (!codigoMfa) {
        return res.json({ mfaNecessario: true });
      }

      if (!confereCodigoMfa(usuario.mfaSegredo, codigoMfa)) {
        await registrarFalhaLogin({ idUsuario: usuario.id, ip: req.ip ?? "", motivo: "codigo_mfa_invalido" });

        return res.status(401).json({ erro: "Código de verificação inválido ou já utilizado." });
      }
    }

    const token = gerarToken({ sub: usuario.id, tipoConta: usuario.tipoConta });

    await registrarAuditoria({
      idUsuario: usuario.id,
      acao: "login_ok",
      entidade: "autenticacao",
      detalhes: { mfa: usuario.mfaAtivo },
    });
    registrarEvento("login");

    const usuarioPublico = await prisma.usuario.findUnique({
      where: { id: usuario.id },
      select: usuarioSelecaoPublica,
    });

    return res.json({ usuario: usuarioPublico, token });
  } catch (error) {
    console.error("Erro ao autenticar usuário:", error);

    return res.status(500).json({
      erro: "Erro interno ao autenticar usuário.",
    });
  }
});

// RNF09: a sessão expira, mas pode ser renovada enquanto o token atual ainda for válido
// e a conta continuar ativa (o middleware já confere isso).
authRouter.post("/renovar", autenticar, async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: usuarioSelecaoPublica,
    });

    if (!usuario) {
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    return res.json({ usuario, token: gerarToken({ sub: usuario.id, tipoConta: usuario.tipoConta }) });
  } catch (error) {
    console.error("Erro ao renovar sessão:", error);

    return res.status(500).json({ erro: "Erro interno ao renovar sessão." });
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
        ...(dados.idioma !== undefined ? { idioma: dados.idioma } : {}),
        ...(dados.preferenciasAcessibilidade !== undefined
          ? { preferenciasAcessibilidade: dados.preferenciasAcessibilidade }
          : {}),
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

// LGPD: quem já tinha conta antes da política passa a aceitá-la explicitamente.
authRouter.post("/consentimento", autenticar, async (req: Request, res: Response) => {
  try {
    const atual = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { consentimentoEm: true },
    });

    const usuario = await prisma.usuario.update({
      where: { id: req.usuario!.id },
      data: { consentimentoEm: atual?.consentimentoEm ?? new Date() },
      select: usuarioSelecaoPublica,
    });

    return res.json(usuario);
  } catch (error) {
    console.error("Erro ao registrar consentimento:", error);

    return res.status(500).json({ erro: "Erro interno ao registrar consentimento." });
  }
});

// LGPD (portabilidade): o usuário baixa tudo o que o sistema guarda sobre ele.
authRouter.get("/me/dados", autenticar, async (req: Request, res: Response) => {
  try {
    const dados = await exportarDadosDoUsuario(req.usuario!.id);

    res.setHeader("Content-Disposition", "attachment; filename=meus-dados-nomadplan.json");

    return res.json(dados);
  } catch (error) {
    console.error("Erro ao exportar dados do usuário:", error);

    return res.status(500).json({ erro: "Erro interno ao exportar seus dados." });
  }
});

// LGPD/AF10: exclusão (anonimização) da conta, confirmada com a senha.
authRouter.delete("/me", autenticar, limiteLogin, async (req: Request, res: Response) => {
  try {
    const resultado = confirmarComSenhaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Informe sua senha para confirmar a exclusão da conta." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });

    if (!usuario || !(await verificarSenha(resultado.data.senha, usuario.senhaHash))) {
      return res.status(403).json({ erro: "Senha incorreta." });
    }

    if (usuario.mfaAtivo && !confereCodigoMfa(usuario.mfaSegredo, resultado.data.codigoMfa)) {
      return res.status(403).json({ erro: "Código de verificação inválido ou já utilizado." });
    }

    await anonimizarUsuario(usuario.id);

    return res.json({ mensagem: "Seus dados pessoais foram removidos e a conta foi encerrada." });
  } catch (error) {
    if (error instanceof ErroPrivacidade) {
      return res.status(error.status).json({ erro: error.message });
    }

    console.error("Erro ao excluir conta:", error);

    return res.status(500).json({ erro: "Erro interno ao excluir a conta." });
  }
});

// RF21: autenticação em dois fatores (TOTP). Configurar gera o segredo; a ativação só
// vale depois de o usuário provar que o aplicativo autenticador gera o código certo.
authRouter.post("/mfa/configurar", autenticar, async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { id: true, email: true, mfaAtivo: true },
    });

    if (!usuario) {
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    if (usuario.mfaAtivo) {
      return res.status(409).json({ erro: "A verificação em duas etapas já está ativa." });
    }

    const segredo = gerarSegredoTotp();

    await prisma.usuario.update({ where: { id: usuario.id }, data: { mfaSegredo: cifrar(segredo) } });

    return res.json({ segredo, otpauthUrl: urlOtpauth(usuario.email, segredo) });
  } catch (error) {
    console.error("Erro ao configurar a verificação em duas etapas:", error);

    return res.status(500).json({ erro: "Erro interno ao configurar a verificação em duas etapas." });
  }
});

authRouter.post("/mfa/ativar", autenticar, limiteLogin, async (req: Request, res: Response) => {
  try {
    const resultado = ativarMfaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Informe o código de 6 números do aplicativo." });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { id: true, mfaAtivo: true, mfaSegredo: true },
    });

    if (!usuario?.mfaSegredo) {
      return res.status(409).json({ erro: "Inicie a configuração antes de ativar." });
    }

    if (usuario.mfaAtivo) {
      return res.status(409).json({ erro: "A verificação em duas etapas já está ativa." });
    }

    if (!confereCodigoMfa(usuario.mfaSegredo, resultado.data.codigo)) {
      return res.status(400).json({ erro: "Código inválido. Confira o aplicativo e tente de novo." });
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { mfaAtivo: true } });

    await registrarAuditoria({ idUsuario: usuario.id, acao: "mfa_ativado", entidade: "usuario", idEntidade: usuario.id });

    return res.json({ mensagem: "Verificação em duas etapas ativada." });
  } catch (error) {
    console.error("Erro ao ativar a verificação em duas etapas:", error);

    return res.status(500).json({ erro: "Erro interno ao ativar a verificação em duas etapas." });
  }
});

authRouter.post("/mfa/desativar", autenticar, limiteLogin, async (req: Request, res: Response) => {
  try {
    const resultado = confirmarComSenhaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({ erro: "Informe sua senha e o código do aplicativo." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });

    if (!usuario?.mfaAtivo) {
      return res.status(409).json({ erro: "A verificação em duas etapas não está ativa." });
    }

    if (
      !(await verificarSenha(resultado.data.senha, usuario.senhaHash)) ||
      !confereCodigoMfa(usuario.mfaSegredo, resultado.data.codigoMfa)
    ) {
      return res.status(403).json({ erro: "Senha ou código de verificação incorretos." });
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { mfaAtivo: false, mfaSegredo: null } });

    await registrarAuditoria({ idUsuario: usuario.id, acao: "mfa_desativado", entidade: "usuario", idEntidade: usuario.id });

    return res.json({ mensagem: "Verificação em duas etapas desativada." });
  } catch (error) {
    console.error("Erro ao desativar a verificação em duas etapas:", error);

    return res.status(500).json({ erro: "Erro interno ao desativar a verificação em duas etapas." });
  }
});

authRouter.post("/esqueci-senha", limiteRecuperacaoSenha, async (req: Request, res: Response) => {
  try {
    const resultado = esqueciSenhaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Informe um e-mail válido.",
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: resultado.data.email },
      select: { id: true, nome: true, senhaHash: true, ativo: true },
    });

    // Resposta genérica sempre — evita que a rota revele quais e-mails existem.
    if (usuario?.ativo) {
      const token = gerarTokenRedefinicaoSenha(usuario.id, usuario.senhaHash);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const link = `${frontendUrl}/redefinir-senha?token=${token}`;

      // Não aguardamos o envio: o SMTP leva segundos, e esperar faria a resposta
      // demorar só quando a conta existe — o que revelaria quais e-mails estão
      // cadastrados. Falhas de envio ficam registradas no log do servidor.
      enviarEmailRedefinicaoSenha({
        para: resultado.data.email,
        nome: usuario.nome,
        link,
      }).catch((error) => {
        console.error("Falha ao enviar e-mail de redefinição de senha:", error);
      });
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

authRouter.post("/redefinir-senha", limiteRecuperacaoSenha, async (req: Request, res: Response) => {
  try {
    const resultado = redefinirSenhaSchema.safeParse(req.body);

    if (!resultado.success) {
      return res.status(400).json({
        erro: "Dados inválidos para redefinição de senha.",
        detalhes: resultado.error.flatten(),
      });
    }

    const erroTokenInvalido = {
      erro: "Token de redefinição inválido ou expirado.",
    };

    let dadosToken: ReturnType<typeof verificarTokenRedefinicaoSenha>;

    try {
      dadosToken = verificarTokenRedefinicaoSenha(resultado.data.token);
    } catch {
      return res.status(400).json(erroTokenInvalido);
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: dadosToken.idUsuario },
      select: { id: true, senhaHash: true, ativo: true },
    });

    // O token só vale enquanto a senha for a mesma de quando ele foi emitido:
    // depois de usado (ou de qualquer troca de senha) ele deixa de funcionar.
    if (
      !usuario ||
      !usuario.ativo ||
      !impressoesIguais(dadosToken.impressao, impressaoSenha(usuario.senhaHash))
    ) {
      return res.status(400).json(erroTokenInvalido);
    }

    const senhaHash = await gerarHashSenha(resultado.data.novaSenha);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash },
    });

    await registrarAuditoria({
      idUsuario: usuario.id,
      acao: "senha_redefinida",
      entidade: "usuario",
      idEntidade: usuario.id,
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
