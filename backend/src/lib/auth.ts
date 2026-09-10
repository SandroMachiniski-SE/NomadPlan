import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { TipoConta } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const RESET_TOKEN_EXPIRES_IN = "15m";

if (!JWT_SECRET) {
  throw new Error("A variável de ambiente JWT_SECRET é obrigatória.");
}

const SALT_ROUNDS = 10;

export interface TokenPayload {
  sub: number;
  tipoConta: TipoConta;
}

interface ResetTokenPayload {
  sub: number;
  tipo: "reset-senha";
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

export function gerarToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verificarToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as unknown as TokenPayload;
}

export function gerarTokenRedefinicaoSenha(idUsuario: number): string {
  const payload: ResetTokenPayload = { sub: idUsuario, tipo: "reset-senha" };

  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: RESET_TOKEN_EXPIRES_IN,
  });
}

export function verificarTokenRedefinicaoSenha(token: string): number {
  const payload = jwt.verify(token, JWT_SECRET as string) as unknown as ResetTokenPayload;

  if (payload.tipo !== "reset-senha") {
    throw new Error("Token não é válido para redefinição de senha.");
  }

  return payload.sub;
}
