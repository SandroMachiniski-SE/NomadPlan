// Parser/serializador CSV minimalista (sem dependência externa): suporta campos
// entre aspas com vírgulas/aspas escapadas ("" dentro de um campo entre aspas).

export function analisarCsv(conteudo: string): string[][] {
  const linhas: string[][] = [];
  let campoAtual = "";
  let linhaAtual: string[] = [];
  let dentroDeAspas = false;

  const texto = conteudo.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];

    if (dentroDeAspas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campoAtual += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campoAtual += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeAspas = true;
    } else if (char === ",") {
      linhaAtual.push(campoAtual);
      campoAtual = "";
    } else if (char === "\n") {
      linhaAtual.push(campoAtual);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campoAtual = "";
    } else {
      campoAtual += char;
    }
  }

  if (campoAtual.length > 0 || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual);
    linhas.push(linhaAtual);
  }

  return linhas.filter((linha) => linha.some((campo) => campo.trim().length > 0));
}

export function linhasParaObjetos(linhas: string[][]): Record<string, string>[] {
  if (linhas.length === 0) {
    return [];
  }

  const [cabecalho, ...resto] = linhas;
  const colunas = cabecalho.map((coluna) => coluna.trim());

  return resto.map((linha) => {
    const objeto: Record<string, string> = {};
    colunas.forEach((coluna, indice) => {
      objeto[coluna] = (linha[indice] ?? "").trim();
    });
    return objeto;
  });
}

function escaparCampoCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export function objetosParaCsv(colunas: string[], linhas: Record<string, unknown>[]): string {
  const cabecalho = colunas.map(escaparCampoCsv).join(",");

  const corpo = linhas.map((linha) =>
    colunas
      .map((coluna) => {
        const valor = linha[coluna];
        return escaparCampoCsv(valor === null || valor === undefined ? "" : String(valor));
      })
      .join(","),
  );

  return [cabecalho, ...corpo].join("\n");
}
