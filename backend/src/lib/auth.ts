import { createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { TipoConta } from "@prisma/client";
import { validarSegredoJwt } from "./segredoJwt";

const JWT_SECRET = validarSegredoJwt(process.env.JWT_SECRET, process.env.NODE_ENV);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const RESET_TOKEN_EXPIRES_IN = "15m";

const SALT_ROUNDS = 10;

// Hash de uma senha qualquer, usado para gastar o mesmo tempo do bcrypt quando o
// e-mail não existe. Sem isso, o login responde bem mais rápido para e-mails
// inexistentes e o tempo de resposta revela quais contas estão cadastradas.
const HASH_FALSO = bcrypt.hashSync("nomadplan-senha-inexistente", SALT_ROUNDS);

export interface TokenPayload {
  sub: number;
  tipoConta: TipoConta;
}

interface ResetTokenPayload {
  sub: number;
  tipo: "reset-senha";
  // Impressão digital do hash de senha vigente quando o token foi emitido.
  v: string;
}

export interface TokenRedefinicaoSenha {
  idUsuario: number;
  impressao: string;
}

export async function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS);
}

export async function verificarSenha(
  senha: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/**
 * Compara a senha com o hash da conta, ou com um hash falso quando a conta não
 * existe (hash nulo), para que o tempo gasto seja o mesmo nos dois casos.
 */
export async function verificarSenhaOuFalso(
  senha: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const coincide = await bcrypt.compare(senha, hash ?? HASH_FALSO);

  return Boolean(hash) && coincide;
}

export function gerarToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verificarToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
}

export function impressaoSenha(senhaHash: string): string {
  return createHash("sha256").update(senhaHash).digest("hex").slice(0, 32);
}

export function impressoesIguais(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * O token de redefinição leva a impressão do hash de senha atual. Assim que a
 * senha muda, o hash muda e o token deixa de valer: cada link só pode ser usado
 * uma vez, mesmo dentro dos 15 minutos de validade.
 */
export function gerarTokenRedefinicaoSenha(idUsuario: number, senhaHashAtual: string): string {
  const payload: ResetTokenPayload = {
    sub: idUsuario,
    tipo: "reset-senha",
    v: impressaoSenha(senhaHashAtual),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: RESET_TOKEN_EXPIRES_IN,
  });
}

export function verificarTokenRedefinicaoSenha(token: string): TokenRedefinicaoSenha {
  const payload = jwt.verify(token, JWT_SECRET) as unknown as ResetTokenPayload;

  if (payload.tipo !== "reset-senha" || typeof payload.v !== "string") {
    throw new Error("Token não é válido para redefinição de senha.");
  }

  return { idUsuario: payload.sub, impressao: payload.v };
}
