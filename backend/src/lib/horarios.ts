// Interpreta o texto livre de "horário de funcionamento" (RB07). O formato não é
// estruturado, então reconhecemos os padrões mais comuns em português e, quando não
// entendemos o texto, assumimos que o ponto está aberto: preferimos incluir um ponto
// incerto a excluir um ponto válido de um roteiro gerado automaticamente.
//
// Exemplos entendidos:
//   "Seg-Sex 9h-18h"                    "Todos os dias, 24h"            "Aberto 24 horas"
//   "Seg-Sex 9h-12h e 14h-18h"          "Seg-Sex 9h-18h, Sáb 9h-13h"    "Terça a domingo, das 9h às 17h"
//   "Seg-Sáb 9:00-18:00; Dom fechado"   "Sex-Sáb 22h-4h" (vira a noite)

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const NOME_DIA = "(?:dom|seg|ter|qua|qui|sex|sab)[a-z]*";
const SEPARADOR = "(?:-|a|as|ate)";
const HORA = "(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-");
}

function indiceDoDia(token: string): number {
  return DIAS.indexOf(token.slice(0, 3));
}

interface Janela {
  inicio: number; // em horas (ex.: 9.5 = 9h30)
  fim: number;
}

interface Clausula {
  dias: Set<number> | null; // null = todos os dias
  janelas: Janela[] | null; // null = o dia todo
  fechado: boolean;
}

function lerHora(horas: string, minutosH?: string, minutosDoisPontos?: string): number {
  return Number(horas) + Number(minutosH ?? minutosDoisPontos ?? 0) / 60;
}

function extrairDias(clausula: string): Set<number> | null {
  if (/todos os dias|diariamente|todo dia/.test(clausula)) {
    return null;
  }

  const intervalo = clausula.match(new RegExp(`(${NOME_DIA})\\s*${SEPARADOR}\\s*(${NOME_DIA})`));

  if (intervalo) {
    const inicio = indiceDoDia(intervalo[1]);
    const fim = indiceDoDia(intervalo[2]);

    if (inicio !== -1 && fim !== -1) {
      const permitidos = new Set<number>();
      let atual = inicio;

      // Percorre o intervalo circular (ex.: "sex-dom" cobre sex, sáb, dom).
      for (let i = 0; i < 7; i += 1) {
        permitidos.add(atual);
        if (atual === fim) break;
        atual = (atual + 1) % 7;
      }

      return permitidos;
    }
  }

  const soltos = [...clausula.matchAll(new RegExp(`\\b(${NOME_DIA})`, "g"))]
    .map((m) => indiceDoDia(m[1]))
    .filter((i) => i !== -1);

  return soltos.length > 0 ? new Set(soltos) : null;
}

function extrairJanelas(clausula: string): Janela[] | null {
  const janelas = [
    ...clausula.matchAll(new RegExp(`${HORA}\\s*${SEPARADOR}\\s*${HORA}`, "g")),
  ].map((m) => ({
    inicio: lerHora(m[1], m[2], m[3]),
    fim: lerHora(m[4], m[5], m[6]),
  }));

  if (janelas.length > 0) {
    return janelas;
  }

  // "24h" / "24 horas" sozinho (sem faixa) significa o dia inteiro.
  if (/\b24\s*(?:h|hs|horas)\b/.test(clausula)) {
    return [{ inicio: 0, fim: 24 }];
  }

  return null;
}

function separarClausulas(texto: string): string[] {
  const dia = `(?=${NOME_DIA})`;

  return texto
    .split(new RegExp(`\\s*;\\s*|\\s*,\\s*${dia}|\\s+e\\s+${dia}|\\s*/\\s*${dia}`))
    .map((parte) => parte.trim())
    .filter(Boolean);
}

function interpretar(texto: string): Clausula[] {
  const clausulas = separarClausulas(texto).map((parte): Clausula => {
    const fechado = /\b(fechado|nao abre|sem expediente)\b/.test(parte);

    return { dias: extrairDias(parte), janelas: fechado ? null : extrairJanelas(parte), fechado };
  });

  // Uma cláusula só com horário ("e 14h-18h") continua a anterior ("Seg-Sex 9h-12h e 14h-18h").
  return clausulas;
}

// O gerador de roteiros consulta o mesmo texto de horário muitas vezes (cada ponto, a cada
// passo do planejamento). Interpretar é a parte cara, então o resultado fica guardado por
// texto; os horários reais se repetem bastante ("Todos os dias, 9h-18h"...).
const LIMITE_CACHE_HORARIOS = 5000;
const cacheInterpretacao = new Map<string, Clausula[]>();

function clausulasEntendidas(texto: string): Clausula[] {
  const guardado = cacheInterpretacao.get(texto);

  if (guardado) {
    return guardado;
  }

  const entendidas = interpretar(normalizar(texto)).filter(
    (c) => c.fechado || c.janelas !== null || c.dias !== null,
  );

  if (cacheInterpretacao.size >= LIMITE_CACHE_HORARIOS) {
    cacheInterpretacao.clear();
  }

  cacheInterpretacao.set(texto, entendidas);

  return entendidas;
}

/**
 * Diz se o ponto estaria aberto no dia/hora informados. Cada cláusula (por ex. "Seg-Sex
 * 9h-12h e 14h-18h" ou "Sáb 9h-13h") define dias e janelas; o ponto está aberto se alguma
 * cláusula o cobre. Texto vazio ou que não conseguimos entender conta como aberto.
 */
export function estaAbertoNoHorario(
  horarioFuncionamento: string | null,
  dataHora: Date,
): boolean {
  if (!horarioFuncionamento || !horarioFuncionamento.trim()) {
    return true;
  }

  const entendidas = clausulasEntendidas(horarioFuncionamento);

  if (entendidas.length === 0) {
    return true;
  }

  const dia = dataHora.getDay();
  const diaAnterior = (dia + 6) % 7;
  const hora = dataHora.getHours() + dataHora.getMinutes() / 60;

  return entendidas.some((clausula) => {
    if (clausula.fechado) {
      return false;
    }

    const aplicaHoje = clausula.dias === null || clausula.dias.has(dia);
    const aplicaOntem = clausula.dias === null || clausula.dias.has(diaAnterior);
    const janelas = clausula.janelas ?? [{ inicio: 0, fim: 24 }];

    return janelas.some(({ inicio, fim }) => {
      if (fim > inicio) {
        return aplicaHoje && hora >= inicio && hora < fim;
      }

      // Janela que atravessa a meia-noite (ex.: 22h-2h): a parte da madrugada pertence
      // ao expediente que começou na véspera.
      return (aplicaHoje && hora >= inicio) || (aplicaOntem && hora < fim);
    });
  });
}
