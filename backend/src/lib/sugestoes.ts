import { conteudoSuspeito } from "./moderacaoTexto";

// RB04/AF05/RF23: regras de confiança das sugestões de edição de pontos.

/** Quantos usuários diferentes precisam propor a mesma mudança para ela ser aplicada sozinha. */
export const CONFIRMACOES_PARA_APLICAR = 2;

export type MotivoRetencao = "conteudo_suspeito" | "foto_anexada";

export function sugestaoSuspeita(campos: Record<string, string>, mensagem?: string | null): boolean {
  return Object.values(campos).some((valor) => conteudoSuspeito(valor)) || conteudoSuspeito(mensagem);
}

function normalizarValor(valor: string): string {
  return valor.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Duas propostas são "a mesma" se mexem nos mesmos campos com os mesmos valores. */
export function mesmaProposta(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const chavesA = Object.keys(a).sort();
  const chavesB = Object.keys(b).sort();

  if (chavesA.length !== chavesB.length || chavesA.some((chave, i) => chave !== chavesB[i])) {
    return false;
  }

  return chavesA.every((chave) => normalizarValor(String(a[chave])) === normalizarValor(String(b[chave])));
}
