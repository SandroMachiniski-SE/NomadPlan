import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// RB10: limites de taxa para operações sensíveis a abuso (spam de contas,
// sugestões ou avaliações em massa). Limite por IP — simplificação aceitável para
// o escopo acadêmico; não tenta distinguir usuários atrás do mesmo NAT/IP.
export const limiteCriacaoConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas contas criadas a partir deste endereço. Tente novamente mais tarde." },
});

export const limiteContribuicao = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Muitas contribuições em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
});

// Limita tentativas de login por IP para dificultar força bruta de senha.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    erro: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  },
});

// Segundo limite de login, por e-mail: quem testa senhas de uma mesma conta
// trocando de IP não é barrado pelo limite por IP. Se o corpo não trouxer um
// e-mail, cai para o IP. Contrapartida: 10 tentativas erradas contra um e-mail
// também bloqueiam o login legítimo dessa conta por 15 minutos.
export const limiteLoginPorEmail = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email ? `email:${email}` : ipKeyGenerator(req.ip ?? "");
  },
  message: {
    erro: "Muitas tentativas de login para esta conta. Aguarde alguns minutos e tente novamente.",
  },
});
