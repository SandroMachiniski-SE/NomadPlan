const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const ABREVIACOES_DIA: Record<string, number> = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
  sáb: 6,
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function extrairDiasPermitidos(textoNormalizado: string): Set<number> | null {
  if (textoNormalizado.includes("todos os dias") || textoNormalizado.includes("24h")) {
    return null; // null = sem restrição de dia
  }

  const intervaloDias = textoNormalizado.match(/(dom|seg|ter|qua|qui|sex|sab)[a-z]*\s*-\s*(dom|seg|ter|qua|qui|sex|sab)[a-z]*/);

  if (!intervaloDias) {
    return null;
  }

  const inicio = ABREVIACOES_DIA[intervaloDias[1]];
  const fim = ABREVIACOES_DIA[intervaloDias[2]];

  if (inicio === undefined || fim === undefined) {
    return null;
  }

  const permitidos = new Set<number>();
  let atual = inicio;

  // Percorre o intervalo circular (ex.: "sex-dom" cobre sex, sáb, dom).
  for (let i = 0; i < DIAS_SEMANA.length; i += 1) {
    permitidos.add(atual);
    if (atual === fim) break;
    atual = (atual + 1) % 7;
  }

  return permitidos;
}

function extrairFaixaHoras(textoNormalizado: string): { inicio: number; fim: number } | null {
  if (textoNormalizado.includes("24h")) {
    return { inicio: 0, fim: 24 };
  }

  const faixa = textoNormalizado.match(/(\d{1,2})h(\d{2})?\s*-\s*(\d{1,2})h(\d{2})?/);

  if (!faixa) {
    return null;
  }

  const inicio = Number(faixa[1]) + Number(faixa[2] ?? 0) / 60;
  const fim = Number(faixa[3]) + Number(faixa[4] ?? 0) / 60;

  if (Number.isNaN(inicio) || Number.isNaN(fim)) {
    return null;
  }

  return { inicio, fim };
}

/**
 * Interpreta o texto livre de horário de funcionamento (ex.: "Seg-Sex 9h-18h") e
 * verifica se o ponto estaria aberto no dia/hora informados (RB07). O formato não é
 * estruturado, então textos que não seguem os padrões reconhecidos (dia-dia, Xh-Yh,
 * "todos os dias", "24h") são tratados como "sem informação suficiente" e, nesse
 * caso, assumimos que o ponto está aberto — preferimos incluir um ponto incerto do
 * que excluir um ponto válido de um roteiro gerado automaticamente.
 */
export function estaAbertoNoHorario(
  horarioFuncionamento: string | null,
  dataHora: Date,
): boolean {
  if (!horarioFuncionamento || !horarioFuncionamento.trim()) {
    return true;
  }

  const textoNormalizado = normalizar(horarioFuncionamento);

  const diasPermitidos = extrairDiasPermitidos(textoNormalizado);

  if (diasPermitidos && !diasPermitidos.has(dataHora.getDay())) {
    return false;
  }

  const faixaHoras = extrairFaixaHoras(textoNormalizado);

  if (!faixaHoras) {
    return true;
  }

  const horaAtual = dataHora.getHours() + dataHora.getMinutes() / 60;

  // Faixa que atravessa a meia-noite (ex.: "22h-2h"): está aberto depois do início
  // OU antes do fim.
  if (faixaHoras.fim < faixaHoras.inicio) {
    return horaAtual >= faixaHoras.inicio || horaAtual <= faixaHoras.fim;
  }

  return horaAtual >= faixaHoras.inicio && horaAtual <= faixaHoras.fim;
}
