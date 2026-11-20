import { formatarHoraEmBrasilia } from "./fuso";

export function formatarDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }

  return `${(metros / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** "14:30" a partir de um instante em ISO 8601, no horário de Brasília (o mesmo em que o servidor calcula). */
export function formatarHora(iso: string): string {
  return formatarHoraEmBrasilia(iso);
}

/** 45 -> "45 min"; 90 -> "1h30"; 120 -> "2h". */
export function formatarDuracao(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));

  if (total < 60) {
    return `${total} min`;
  }

  const horas = Math.floor(total / 60);
  const resto = total % 60;

  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 12550 -> "R$ 125,50". */
export function formatarMoeda(centavos: number): string {
  return MOEDA.format(centavos / 100);
}

// O que pode estar no campo de valor enquanto se digita: números (com pontos de milhar), no máximo uma
// vírgula e até duas casas depois dela. Inclui os passos no meio do caminho ("25,", "1.").
const DIGITACAO_DE_VALOR = /^(?:\d+(?:\.\d+)*(?:\.|,\d{0,2})?|,\d{0,2})?$/;

/**
 * Regra do campo de valor em reais: letras, sinais, símbolos, vírgula repetida ou mais de duas casas
 * decimais simplesmente não entram. Devolve o texto novo se ele ainda é um valor bem digitado; senão
 * devolve o anterior, e o campo não muda. Nada é apagado ou corrigido em silêncio, e um "-25,90" colado
 * não vira "25,90".
 */
export function aceitarDigitacaoDeValor(anterior: string, novo: string): string {
  return DIGITACAO_DE_VALOR.test(novo) ? novo : anterior;
}

/**
 * Converte o que a pessoa digitou ("12,50", "12.5", "1.234,56", "R$ 20") em centavos.
 * Vazio devolve null (sem valor); texto que não é um valor devolve NaN.
 */
export function lerValorEmCentavos(texto: string): number | null {
  // Custo e teto não são negativos: o sinal de menos não pode sumir na limpeza e virar positivo.
  if (/[-−–]/.test(texto)) return Number.NaN;

  if (texto.trim() === "") return null;

  // Só o prefixo "R$" e espaços podem acompanhar os números: letras ou símbolos no meio ("abc25,90",
  // "25abc") não são descartados em silêncio, o texto inteiro deixa de ser um valor.
  const correspondencia = /^(?:R\$)?\s*([\d.,]+)$/i.exec(texto.trim());

  if (!correspondencia) return Number.NaN;

  const limpo = correspondencia[1];

  // Separadores soltos ("2..5", "1,,5") também não são um valor.
  if (/[.,]{2}/.test(limpo)) return Number.NaN;

  let normalizado: string;

  if (limpo.includes(",")) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(limpo)) {
    normalizado = limpo;
  } else {
    normalizado = limpo.replace(/\./g, "");
  }

  const reais = Number(normalizado);

  return Number.isFinite(reais) ? Math.round(reais * 100) : Number.NaN;
}
