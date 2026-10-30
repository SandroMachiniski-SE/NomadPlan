import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { registrarBloqueioLogin } from "../lib/seguranca";

// Só os testes de integração (que registram dezenas de contas a partir do mesmo IP)
// definem RATE_LIMIT_OFF=1. O teste que verifica os limites reais não define.
const semLimite = () => process.env.RATE_LIMIT_OFF === "1";

// RB10: limites de taxa para operações sensíveis a abuso (spam de contas,
// sugestões ou avaliações em massa). Limite por IP — simplificação aceitável para
// o escopo acadêmico; não tenta distinguir usuários atrás do mesmo NAT/IP.
export const limiteCriacaoConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  skip: semLimite,
  legacyHeaders: false,
  message: { erro: "Muitas contas criadas a partir deste endereço. Tente novamente mais tarde." },
});

export const limiteContribuicao = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  skip: semLimite,
  legacyHeaders: false,
  message: {
    erro: "Muitas contribuições em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
});

// AF01: bloqueio temporário do login por excesso de tentativas. O limite por conta é
// o do RFC (3 falhas); o limite por IP é mais folgado porque vários usuários podem
// compartilhar o mesmo endereço (rede da faculdade, por exemplo).
export const JANELA_LOGIN_MS = 15 * 60 * 1000;
export const TENTATIVAS_LOGIN_POR_CONTA = 3;
export const TENTATIVAS_LOGIN_POR_IP = 10;

// Quem registra o bloqueio (log de segurança e alerta). Fica trocável para que os
// testes unitários dos limitadores não dependam do banco de dados.
export const ganchos = {
  aoBloquearLogin: (ip: string, escopo: "ip" | "conta"): Promise<void> =>
    registrarBloqueioLogin(ip, escopo),
};

type RequisicaoLimitada = Request & {
  rateLimit?: { used: number; limit: number; resetTime?: Date };
};

function minutosRestantes(resetTime: Date | undefined): number {
  const ms = resetTime ? resetTime.getTime() - Date.now() : JANELA_LOGIN_MS;

  return Math.max(1, Math.ceil(ms / 60000));
}

function criarLimiteLogin(opcoes: {
  limite: number;
  escopo: "ip" | "conta";
  chave?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: JANELA_LOGIN_MS,
    limit: opcoes.limite,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: semLimite,
    ...(opcoes.chave ? { keyGenerator: opcoes.chave } : {}),
    handler: (requisicao, res) => {
      const req = requisicao as RequisicaoLimitada;
      const minutos = minutosRestantes(req.rateLimit?.resetTime);

      // Só a primeira requisição bloqueada gera log/alerta, não cada tentativa seguinte.
      if (req.rateLimit && req.rateLimit.used === opcoes.limite + 1) {
        void ganchos.aoBloquearLogin(req.ip ?? "", opcoes.escopo);
      }

      res.status(429).json({
        erro: `Muitas tentativas. Tente novamente em ${minutos} ${minutos === 1 ? "minuto" : "minutos"} ou recupere a senha.`,
        tentarNovamenteEmMinutos: minutos,
      });
    },
  });
}

export const limiteLogin = criarLimiteLogin({ limite: TENTATIVAS_LOGIN_POR_IP, escopo: "ip" });

// Segundo limite, por e-mail: quem testa senhas de uma mesma conta trocando de IP não
// é barrado pelo limite por IP. Se o corpo não trouxer um e-mail, cai para o IP.
// Contrapartida: 3 falhas contra um e-mail também bloqueiam o login legítimo dessa
// conta pelo restante da janela — por isso a mensagem oferece a recuperação de senha.
export const limiteLoginPorEmail = criarLimiteLogin({
  limite: TENTATIVAS_LOGIN_POR_CONTA,
  escopo: "conta",
  chave: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email ? `email:${email}` : ipKeyGenerator(req.ip ?? "");
  },
});

// Recuperação de senha: sem limite, /esqueci-senha permite disparar e-mails em
// massa e /redefinir-senha permite tentar tokens à vontade.
export const limiteRecuperacaoSenha = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  skip: semLimite,
  legacyHeaders: false,
  message: {
    erro: "Muitas solicitações de recuperação de senha. Aguarde alguns minutos e tente novamente.",
  },
});
