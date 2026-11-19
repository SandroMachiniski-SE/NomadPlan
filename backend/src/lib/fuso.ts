// O NomadPlan é do Brasil: horários de funcionamento, o início do passeio e o dia das métricas
// valem no horário de Brasília, seja qual for o fuso do servidor (o contêiner da VPS roda em UTC,
// e com o relógio dele um museu que abre às 13h parecia aberto às 12:14).

export const FUSO_PADRAO = "America/Sao_Paulo";

const DIAS_DA_SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatador = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_PADRAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface HoraLocal {
  ano: number;
  /** 1 a 12. */
  mes: number;
  dia: number;
  /** 0 = domingo, como Date.getDay(). */
  diaDaSemana: number;
  hora: number;
  minuto: number;
}

/** Data e hora que o relógio de Brasília marca no instante dado. */
export function horaLocal(data: Date): HoraLocal {
  const partes = Object.fromEntries(formatador.formatToParts(data).map((p) => [p.type, p.value]));

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    diaDaSemana: DIAS_DA_SEMANA.indexOf(partes.weekday),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}

/** O instante em que o relógio de Brasília marca a data e a hora pedidas (dia além do mês vira o seguinte). */
export function instanteLocal(ano: number, mes: number, dia: number, hora: number, minuto = 0): Date {
  const comoSeFosseUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const local = horaLocal(new Date(comoSeFosseUtc));
  const diferenca = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto) - comoSeFosseUtc;

  return new Date(comoSeFosseUtc - diferenca);
}
