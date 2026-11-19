/**
 * Falha que costuma passar sozinha: o servidor não respondeu (rede, tempo esgotado) ou respondeu que está
 * indisponível ou ocupado (5xx, 408, 429). Um "não" de verdade (404, 401, 400...) não é temporário.
 */
export function ehFalhaTemporaria(erro: unknown): boolean {
  const resposta = (erro as { response?: { status?: number } } | null)?.response;

  if (!resposta) return true;

  const status = resposta.status ?? 0;

  return status >= 500 || status === 408 || status === 429;
}

/** Repete a tarefa, esperando entre as tentativas, enquanto a falha for temporária. */
export async function comNovasTentativas<T>(
  tarefa: () => Promise<T>,
  esperasMs: number[] = [1000, 3000],
  continuar: () => boolean = () => true,
): Promise<T> {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await tarefa();
    } catch (erro) {
      if (!ehFalhaTemporaria(erro) || tentativa >= esperasMs.length || !continuar()) throw erro;

      await new Promise((resolver) => setTimeout(resolver, esperasMs[tentativa]));
    }
  }
}
