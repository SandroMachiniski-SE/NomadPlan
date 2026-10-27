export function formatarDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }

  return `${(metros / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** "14:30" a partir de um instante em ISO 8601, no horário do navegador. */
export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

/**
 * Converte o que a pessoa digitou ("12,50", "12.5", "1.234,56", "R$ 20") em centavos.
 * Vazio devolve null (sem valor); texto que não é um valor devolve NaN.
 */
export function lerValorEmCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,]/g, "");

  if (limpo === "") return texto.trim() === "" ? null : Number.NaN;

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
