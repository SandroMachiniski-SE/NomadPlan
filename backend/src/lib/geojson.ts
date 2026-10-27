// Importação de inventário em GeoJSON (RF18). Cada Feature vira uma "linha" com as mesmas
// colunas do CSV, para as duas formas de importar passarem pela mesma validação.

export const MAX_FEATURES_IMPORTACAO = 5000;

export interface LinhaImportacao {
  /** Posição humana (1 = primeiro registro), usada no relatório de erros. */
  numero: number;
  valores: Record<string, string>;
  /** Preenchido quando a Feature nem chega a virar uma linha válida. */
  erro?: string;
}

const PROPRIEDADES_ACEITAS = [
  "nome",
  "descricao",
  "categoria",
  "cidade",
  "endereco",
  "faixaPreco",
  "acessibilidade",
  "siteOficial",
  "telefoneContato",
  "horarioFuncionamento",
] as const;

export class ErroGeoJson extends Error {}

function paraTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return typeof valor === "string" ? valor : String(valor);
}

export function linhasDeGeoJson(conteudo: string): LinhaImportacao[] {
  let documento: unknown;

  try {
    documento = JSON.parse(conteudo);
  } catch {
    throw new ErroGeoJson("O arquivo não é um JSON válido.");
  }

  const raiz = documento as { type?: string; features?: unknown };

  if (!raiz || raiz.type !== "FeatureCollection" || !Array.isArray(raiz.features)) {
    throw new ErroGeoJson('O arquivo precisa ser um GeoJSON do tipo "FeatureCollection".');
  }

  if (raiz.features.length > MAX_FEATURES_IMPORTACAO) {
    throw new ErroGeoJson(`O arquivo tem mais de ${MAX_FEATURES_IMPORTACAO} registros. Divida em partes menores.`);
  }

  return raiz.features.map((feature, indice): LinhaImportacao => {
    const numero = indice + 1;
    const f = feature as {
      type?: string;
      geometry?: { type?: string; coordinates?: unknown } | null;
      properties?: Record<string, unknown> | null;
    };

    if (!f || f.type !== "Feature") {
      return { numero, valores: {}, erro: 'O item não é uma "Feature" do GeoJSON.' };
    }

    const valores: Record<string, string> = {};

    for (const campo of PROPRIEDADES_ACEITAS) {
      valores[campo] = paraTexto(f.properties?.[campo]).trim();
    }

    if (f.geometry) {
      if (f.geometry.type !== "Point") {
        return { numero, valores, erro: `Geometria "${f.geometry.type}" não suportada: use Point.` };
      }

      const [longitude, latitude] = (f.geometry.coordinates ?? []) as unknown[];

      if (typeof longitude !== "number" || typeof latitude !== "number") {
        return { numero, valores, erro: "Coordenadas do Point inválidas (esperado [longitude, latitude])." };
      }

      valores.longitude = String(longitude);
      valores.latitude = String(latitude);
    }

    return { numero, valores };
  });
}
