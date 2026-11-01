import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { UFS } from "./geocodificacao";

// Os 5.571 municípios do Brasil, com a sede de cada um (IBGE). Ficam no banco para saber onde a
// pessoa mora, achar cidades de pernoite ao longo da estrada e buscar cidades sem depender do
// Nominatim. O arquivo versionado é gerado por "npm run municipios:baixar".

export const ARQUIVO_MUNICIPIOS = path.resolve(process.cwd(), "prisma", "dados", "municipios.json");

const LOTE_DE_IMPORTACAO = 500;

export interface Municipio {
  codigoIbge: number;
  cidade: string;
  uf: string;
  latitude: number;
  longitude: number;
}

interface MunicipioDoIbge {
  codigo_ibge: number;
  nome: string;
  latitude: number;
  longitude: number;
  codigo_uf: number;
}

export function converterMunicipiosDoIbge(
  municipios: MunicipioDoIbge[],
  estados: { codigo_uf: number; uf: string }[],
): Municipio[] {
  const siglas = new Map(estados.map((e) => [e.codigo_uf, e.uf]));

  return municipios.flatMap((m) => {
    const uf = siglas.get(m.codigo_uf);

    return uf
      ? [{ codigoIbge: m.codigo_ibge, cidade: m.nome, uf, latitude: m.latitude, longitude: m.longitude }]
      : [];
  });
}

// Sem acento, minúsculo e com espaços simples. Não usa o normalizarCidade de cidades.ts, que tira a
// última palavra de duas letras como se fosse a UF ("Santa Fé" viraria "santa"; "Pedro II", "pedro").
function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const UF_NO_FIM =/^(.*?)\s*[,/-]\s*([a-zA-Z]{2})\s*$/;

/** "Brasília, DF", "Brasília/DF" ou "Brasília - DF" → nome e UF; sigla que não é UF fica no nome. */
export function separarUf(texto: string): { nome: string; uf: string | null } {
  const limpo = texto.trim();
  const partes = UF_NO_FIM.exec(limpo);
  const uf = partes?.[2].toUpperCase();

  if (partes && uf && (UFS as readonly string[]).includes(uf) && partes[1].trim()) {
    return { nome: partes[1].trim(), uf };
  }

  return { nome: limpo, uf: null };
}

export function lerMunicipios(arquivo = ARQUIVO_MUNICIPIOS): Municipio[] {
  return JSON.parse(fs.readFileSync(arquivo, "utf8")) as Municipio[];
}

/** Grava ou atualiza (pelo código IBGE) e devolve quantos municípios foram enviados. */
export async function importarMunicipios(lista: Municipio[]): Promise<number> {
  for (let i = 0; i < lista.length; i += LOTE_DE_IMPORTACAO) {
    const linhas = lista
      .slice(i, i + LOTE_DE_IMPORTACAO)
      .map(
        (m) =>
          Prisma.sql`(${m.codigoIbge}, ${m.cidade}, ${normalizarNome(m.cidade)}, ${m.uf}, ${m.latitude}, ${m.longitude})`,
      );

    await prisma.$executeRaw`
      INSERT INTO municipio (codigo_ibge, nome, nome_normalizado, uf, latitude, longitude)
      VALUES ${Prisma.join(linhas)}
      ON CONFLICT (codigo_ibge) DO UPDATE SET
        nome = EXCLUDED.nome,
        nome_normalizado = EXCLUDED.nome_normalizado,
        uf = EXCLUDED.uf,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude
    `;
  }

  return lista.length;
}

const COLUNAS = Prisma.sql`codigo_ibge AS "codigoIbge", nome AS cidade, uf, latitude, longitude`;

export async function municipioPorCodigo(codigoIbge: number): Promise<Municipio | null> {
  const [m] = await prisma.$queryRaw<Municipio[]>`SELECT ${COLUNAS} FROM municipio WHERE codigo_ibge = ${codigoIbge}`;

  return m ?? null;
}

/** Municípios com exatamente esse nome (sem acento/maiúsculas), na UF se ela vier no texto. */
export async function procurarMunicipio(texto: string): Promise<Municipio[]> {
  const { nome, uf } = separarUf(texto);
  const alvo = normalizarNome(nome);

  return prisma.$queryRaw<Municipio[]>`
    SELECT ${COLUNAS} FROM municipio
    WHERE nome_normalizado = ${alvo} ${uf ? Prisma.sql`AND uf = ${uf}` : Prisma.empty}
    ORDER BY uf
  `;
}

/** Municípios cujo nome começa com o texto (para a busca quando o Nominatim não responde). */
export async function buscarMunicipiosPorNome(texto: string, limite = 10): Promise<Municipio[]> {
  const { nome, uf } = separarUf(texto);
  const prefixo = `${normalizarNome(nome).replace(/[\\%_]/g, "\\$&")}%`;

  return prisma.$queryRaw<Municipio[]>`
    SELECT ${COLUNAS} FROM municipio
    WHERE nome_normalizado LIKE ${prefixo} ${uf ? Prisma.sql`AND uf = ${uf}` : Prisma.empty}
    ORDER BY length(nome_normalizado), nome, uf
    LIMIT ${limite}
  `;
}

export async function municipioMaisProximo(
  latitude: number,
  longitude: number,
): Promise<(Municipio & { distanciaKm: number }) | null> {
  const ponto = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
  const [m] = await prisma.$queryRaw<(Municipio & { distanciaKm: number })[]>`
    SELECT ${COLUNAS}, ST_Distance(geom, ${ponto}) / 1000 AS "distanciaKm"
    FROM municipio
    ORDER BY geom <-> ${ponto}
    LIMIT 1
  `;

  return m ?? null;
}
