import prisma from "./prisma";

// RF28/RNF26: métricas de uso agregadas por dia. Os eventos são contados em memória e
// gravados em lote (a cada poucos segundos): assim uma busca não vira uma escrita no
// banco, o que pesaria justamente no caminho mais usado da API.

export const TIPOS_EVENTO = [
  "busca",
  "roteiro_gerado",
  "roteiro_criado",
  "cadastro",
  "login",
  "avaliacao",
  "ponto_cadastrado",
  "ponto_salvo",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

type Persistidor = (lote: { dia: string; tipo: string; total: number }[]) => Promise<void>;

const INTERVALO_DESCARGA_MS = Number(process.env.METRICAS_INTERVALO_MS) || 5000;

const pendentes = new Map<string, number>();
let temporizador: NodeJS.Timeout | null = null;

export function diaLocal(data: Date = new Date()): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

async function persistirNoBanco(lote: { dia: string; tipo: string; total: number }[]): Promise<void> {
  for (const { dia, tipo, total } of lote) {
    await prisma.$executeRaw`
      INSERT INTO metrica_diaria (dia, tipo, total)
      VALUES (${dia}::date, ${tipo}, ${total})
      ON CONFLICT (dia, tipo) DO UPDATE SET total = metrica_diaria.total + EXCLUDED.total
    `;
  }
}

let persistidor: Persistidor = persistirNoBanco;

/** Troca a forma de gravar (usado nos testes unitários, sem banco). */
export function configurarPersistidor(novo: Persistidor | null): void {
  persistidor = novo ?? persistirNoBanco;
}

export function registrarEvento(tipo: TipoEvento, quantidade: number = 1): void {
  const chave = `${diaLocal()}|${tipo}`;
  pendentes.set(chave, (pendentes.get(chave) ?? 0) + quantidade);

  if (!temporizador) {
    temporizador = setTimeout(() => {
      temporizador = null;
      void descarregarMetricas();
    }, INTERVALO_DESCARGA_MS);

    // Não segura o processo vivo só por causa das métricas (importante nos testes).
    temporizador.unref();
  }
}

export function eventosPendentes(): number {
  return [...pendentes.values()].reduce((soma, valor) => soma + valor, 0);
}

/** Grava no banco tudo o que está em memória. Em caso de falha, devolve os contadores. */
export async function descarregarMetricas(): Promise<void> {
  if (pendentes.size === 0) {
    return;
  }

  const lote = [...pendentes].map(([chave, total]) => {
    const [dia, tipo] = chave.split("|");
    return { dia, tipo, total };
  });

  pendentes.clear();

  try {
    await persistidor(lote);
  } catch (error) {
    console.error("Erro ao gravar métricas de uso:", error);

    for (const { dia, tipo, total } of lote) {
      const chave = `${dia}|${tipo}`;
      pendentes.set(chave, (pendentes.get(chave) ?? 0) + total);
    }
  }
}

export interface PontoDaSerie {
  dia: string;
  [tipo: string]: number | string;
}

/** Série diária dos últimos `dias` dias, com zeros nos dias sem evento. */
export async function serieDeUso(dias: number): Promise<PontoDaSerie[]> {
  await descarregarMetricas();

  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1));

  const registros = await prisma.$queryRaw<{ dia: string; tipo: string; total: number }[]>`
    SELECT to_char(dia, 'YYYY-MM-DD') AS dia, tipo, total
    FROM metrica_diaria
    WHERE dia >= ${diaLocal(inicio)}::date
  `;

  const porDia = new Map<string, Record<string, number>>();

  for (let i = 0; i < dias; i += 1) {
    const dia = diaLocal(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
    porDia.set(dia, Object.fromEntries(TIPOS_EVENTO.map((tipo) => [tipo, 0])));
  }

  for (const { dia, tipo, total } of registros) {
    const linha = porDia.get(dia);
    if (linha && tipo in linha) {
      linha[tipo] = Number(total);
    }
  }

  return [...porDia].map(([dia, valores]) => ({ dia, ...valores }));
}

export function serieParaCsv(serie: PontoDaSerie[]): string {
  const colunas = ["dia", ...TIPOS_EVENTO];
  const linhas = serie.map((ponto) => colunas.map((coluna) => String(ponto[coluna] ?? 0)).join(","));

  return [colunas.join(","), ...linhas].join("\n");
}
