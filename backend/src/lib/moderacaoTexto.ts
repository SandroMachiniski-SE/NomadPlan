const PALAVRAS_PROIBIDAS = [
  "porra",
  "merda",
  "idiota",
  "imbecil",
  "burro",
  "estupido",
  "estúpido",
  "otario",
  "otário",
  "cretino",
  "escroto",
  "lixo",
];

const REGEX_URL = /(https?:\/\/|www\.)\S+/i;

/**
 * Filtro automático simples de spam/linguagem (RF15) — checagem por palavrões
 * conhecidos e presença de links (comum em spam). Não substitui moderação humana:
 * apenas decide se o conteúdo entra direto ou fica retido para revisão manual.
 */
export function conteudoSuspeito(texto: string | null | undefined): boolean {
  if (!texto) {
    return false;
  }

  const normalizado = texto.toLowerCase();

  if (REGEX_URL.test(normalizado)) {
    return true;
  }

  return PALAVRAS_PROIBIDAS.some((palavra) => normalizado.includes(palavra));
}
