import fs from "fs";
import path from "path";
import type { PontoParaImportar } from "./importacaoOsm";

// Os pontos baixados do OpenStreetMap ficam versionados em prisma/dados/osm/ (um arquivo
// por cidade). Assim o seed, o CI e quem clona o projeto têm os mesmos dados reais sem
// depender da Overpass API estar no ar. A pasta é relativa à execução (backend/), como os
// uploads (ver caminhos.ts).
export const PASTA_DADOS_OSM = path.resolve(process.cwd(), "prisma", "dados", "osm");

export const ATRIBUICAO_OSM = "© colaboradores do OpenStreetMap";
export const LICENCA_OSM = "Open Database License (ODbL) 1.0 — https://www.openstreetmap.org/copyright";

export interface DadosOsmDaCidade {
  fonte: string;
  licenca: string;
  atribuicao: string;
  cidade: string;
  uf: string;
  baixadoEm: string;
  pontos: PontoParaImportar[];
}

export function nomeDoArquivo(cidade: string): string {
  const slug = cidade
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug}.json`;
}

/** Lê os arquivos informados ou, sem nenhum, todos os da pasta de dados. */
export function lerDadosOsm(arquivos: string[] = []): DadosOsmDaCidade[] {
  const caminhos =
    arquivos.length > 0
      ? arquivos.map((arquivo) => path.resolve(arquivo))
      : fs.existsSync(PASTA_DADOS_OSM)
        ? fs
            .readdirSync(PASTA_DADOS_OSM)
            .filter((nome) => nome.endsWith(".json"))
            .sort()
            .map((nome) => path.join(PASTA_DADOS_OSM, nome))
        : [];

  return caminhos.map((caminho) => JSON.parse(fs.readFileSync(caminho, "utf8")) as DadosOsmDaCidade);
}
