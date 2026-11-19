// O NomadPlan é do Brasil e o servidor calcula horários de funcionamento, chegadas e saídas no horário de
// Brasília (backend/src/lib/fuso.ts), seja qual for o fuso do navegador. A tela usa o mesmo fuso: o início
// do passeio digitado é "o horário de Brasília" e as horas mostradas voltam no mesmo relógio. Sem isso, quem
// usa o site com o computador em outro fuso (viajando, VPN, Manaus, Portugal) via um horário e o servidor
// usava outro.

export const FUSO_PADRAO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_PADRAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function relogioDeBrasilia(data: Date) {
  const partes = Object.fromEntries(formatador.formatToParts(data).map((p) => [p.type, p.value]));

  return Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute));
}

/**
 * O instante (ISO 8601) em que o relógio de Brasília marca o que a pessoa digitou num campo
 * datetime-local ("2026-11-20T09:00"), e não o horário do navegador. Texto fora desse formato devolve null.
 */
export function instanteEmBrasilia(textoLocal: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(textoLocal);

  if (!m) return null;

  const [ano, mes, dia, hora, minuto] = m.slice(1).map(Number);
  const comoSeFosseUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);

  if (Number.isNaN(comoSeFosseUtc)) return null;

  // Quanto o relógio de Brasília difere do UTC naquele momento (hoje, 3 h; calculado, não fixo).
  const diferenca = relogioDeBrasilia(new Date(comoSeFosseUtc)) - comoSeFosseUtc;

  return new Date(comoSeFosseUtc - diferenca).toISOString();
}

/** "14:30" a partir de um instante em ISO 8601, no relógio de Brasília. */
export function formatarHoraEmBrasilia(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO_PADRAO });
}
