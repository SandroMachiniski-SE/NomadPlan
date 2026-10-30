// Converte o horário de funcionamento do OpenStreetMap (chave "opening_hours", por exemplo
// "Mo-Fr 09:00-18:00; Sa 09:00-13:00; Su,PH off") para o texto em português que o restante
// do sistema mostra e interpreta (ver horarios.ts): "Seg-Sex 9h-18h; Sáb 9h-13h; Dom fechado".
//
// Só a parte mais usada da especificação é aceita: dias da semana, feriados (PH), faixas de
// horário, "off"/"closed" e "24/7". Regras com meses, semanas, datas, nascer do sol,
// comentários ou horário sem fim ("18:00+") devolvem null: é melhor o ponto ficar com
// "horário não informado" do que com um horário errado.

const DIAS_OSM = ["su", "mo", "tu", "we", "th", "fr", "sa"]; // índice = Date.getDay()
const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SEMANA_A_PARTIR_DE_SEGUNDA = [1, 2, 3, 4, 5, 6, 0];
const TAMANHO_MAXIMO = 200;

const DIA = "(?:mo|tu|we|th|fr|sa|su)";
const ITEM_DIAS = `(?:${DIA}(?:\\s*-\\s*${DIA})?|ph)`;
const SELETOR_DIAS = new RegExp(`^(${ITEM_DIAS}(?:\\s*,\\s*${ITEM_DIAS})*)(?:\\s*:)?(?:\\s+|$)`, "i");
const FAIXA = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

// Minutos desde a meia-noite; "fim" menor que "inicio" atravessa a meia-noite.
type Faixa = [inicio: number, fim: number];

interface Regra {
  dias: number[]; // vazio = todos os dias
  feriados: boolean;
  faixas: Faixa[]; // vazio = fechado
}

function lerFaixas(texto: string): Faixa[] | null {
  if (texto === "" || texto === "24/7") {
    return [[0, 24 * 60]];
  }

  if (/^(off|closed)$/i.test(texto)) {
    return [];
  }

  const faixas: Faixa[] = [];

  for (const parte of texto.split(/\s*,\s*/)) {
    const m = parte.match(FAIXA);

    if (!m) {
      return null;
    }

    const [hIni, mIni, hFim, mFim] = m.slice(1).map(Number);

    if (hIni > 23 || hFim > 48 || mIni > 59 || mFim > 59) {
      return null;
    }

    // "18:00-24:00" e "18:00-00:00" terminam à meia-noite; "00:00-24:00" é o dia todo;
    // "22:00-26:00" é o mesmo que "22:00-02:00".
    const fim = (hFim * 60 + mFim) % (24 * 60) || 24 * 60;

    faixas.push([hIni * 60 + mIni, fim]);
  }

  return faixas;
}

function lerDias(seletor: string): { dias: number[]; feriados: boolean } {
  const dias = new Set<number>();
  let feriados = false;

  for (const item of seletor.toLowerCase().split(/\s*,\s*/)) {
    if (item === "ph") {
      feriados = true;
      continue;
    }

    const [inicio, fim = inicio] = item.split(/\s*-\s*/).map((d) => DIAS_OSM.indexOf(d));

    // Intervalos podem dar a volta na semana ("Fr-Mo").
    for (let dia = inicio; ; dia = (dia + 1) % 7) {
      dias.add(dia);
      if (dia === fim) break;
    }
  }

  return { dias: [...dias], feriados };
}

function lerRegra(texto: string): Regra | null {
  const seletor = texto.match(SELETOR_DIAS);
  const resto = (seletor ? texto.slice(seletor[0].length) : texto).trim();
  const faixas = lerFaixas(resto);

  if (!faixas) {
    return null;
  }

  if (!seletor) {
    return { dias: [], feriados: false, faixas };
  }

  return { ...lerDias(seletor[1]), faixas };
}

function formatarMinutos(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

function descreverFaixas(faixas: Faixa[]): string {
  if (faixas.length === 0) {
    return "fechado";
  }

  return [...faixas]
    .sort((a, b) => a[0] - b[0])
    .map(([inicio, fim]) =>
      inicio === 0 && fim === 24 * 60 ? "24h" : `${formatarMinutos(inicio)}-${formatarMinutos(fim)}`,
    )
    .join(" e ");
}

function rotuloDosDias(dias: number[]): string {
  const primeiro = NOMES_DIAS[dias[0]];

  // Sempre como intervalo: "Sáb e Dom" seria lido pelo interpretador como duas cláusulas.
  return dias.length === 1 ? primeiro : `${primeiro}-${NOMES_DIAS[dias[dias.length - 1]]}`;
}

/**
 * Converte o "opening_hours" do OpenStreetMap para o formato em português usado nos pontos.
 * Devolve null quando o texto usa recursos da especificação que não tratamos.
 */
export function converterHorarioOsm(original: string): string | null {
  const texto = original.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().replace(/;$/, "");

  if (!texto) {
    return null;
  }

  // Dia sem regra = fechado (é o que a especificação do OpenStreetMap determina).
  const semana: Faixa[][] = Array.from({ length: 7 }, () => []);
  let feriados: Faixa[] | null = null;

  for (const bloco of texto.split(/\s*;\s*/)) {
    // Dentro de um bloco, ", " seguido de outro dia começa uma regra adicional, que soma
    // horários em vez de substituir ("Mo-Fr 09:00-12:00, Sa 09:00-12:00").
    const partes = bloco.split(/(?<=\d|off|closed)\s*,\s*(?=(?:mo|tu|we|th|fr|sa|su|ph)\b)/i);

    for (const [indice, parte] of partes.entries()) {
      const regra = lerRegra(parte);

      if (!regra) {
        return null;
      }

      const adicional = indice > 0;
      const dias = regra.dias.length === 0 && !regra.feriados ? [0, 1, 2, 3, 4, 5, 6] : regra.dias;

      for (const dia of dias) {
        semana[dia] = adicional ? [...semana[dia], ...regra.faixas] : regra.faixas;
      }

      if (regra.feriados) {
        feriados = adicional && feriados ? [...feriados, ...regra.faixas] : regra.faixas;
      }
    }
  }

  // Agrupa os dias seguidos (de segunda a domingo) que têm o mesmo horário.
  const grupos: { dias: number[]; horario: string }[] = [];

  for (const dia of SEMANA_A_PARTIR_DE_SEGUNDA) {
    const horario = descreverFaixas(semana[dia]);
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.horario === horario) {
      ultimo.dias.push(dia);
    } else {
      grupos.push({ dias: [dia], horario });
    }
  }

  // "Sex-Seg": o grupo do fim de semana continua na segunda-feira seguinte.
  if (grupos.length > 2 && grupos[0].horario === grupos[grupos.length - 1].horario) {
    grupos[grupos.length - 1].dias.push(...grupos.shift()!.dias);
  }

  const abertos = grupos.filter((g) => g.horario !== "fechado");

  if (abertos.length === 0) {
    return null;
  }

  let clausulas: string[];

  if (grupos.length === 1) {
    clausulas = [`Todos os dias, ${grupos[0].horario}`];
  } else {
    const horarioFeriados = feriados && feriados.length > 0 ? descreverFaixas(feriados) : null;
    let feriadosIncluidos = false;

    clausulas = [
      ...abertos.map((g) => {
        // Feriados só aparecem junto de um grupo com o mesmo horário: sozinhos ("Feriados
        // 9h-13h"), o interpretador entenderia como todos os dias.
        const comFeriados = !feriadosIncluidos && g.horario === horarioFeriados;
        feriadosIncluidos ||= comFeriados;

        return `${rotuloDosDias(g.dias)}${comFeriados ? " e feriados" : ""} ${g.horario}`;
      }),
      ...grupos.filter((g) => g.horario === "fechado").map((g) => `${rotuloDosDias(g.dias)} fechado`),
    ];
  }

  if (feriados && feriados.length === 0) {
    clausulas.push("Feriados: fechado");
  }

  const resultado = clausulas.join("; ");

  return resultado.length <= TAMANHO_MAXIMO ? resultado : null;
}
