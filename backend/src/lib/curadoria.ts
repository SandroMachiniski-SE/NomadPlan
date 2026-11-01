import fs from "fs";
import path from "path";
import { StatusPonto } from "@prisma/client";
import prisma from "./prisma";
import { registrarVersaoPonto } from "./versionamento";
import { lerDadosOsm } from "./dadosOsm";
import type { PontoParaImportar } from "./importacaoOsm";

// Curadoria: pontos que a equipe conferiu em fontes oficiais (guias de museus das prefeituras,
// sites das instituições). O valor conferido substitui o que veio das importações (o OpenStreetMap
// pode estar desatualizado), mas nunca o que a comunidade ou o responsável editou depois. O ponto
// conferido ganha o selo de verificado.

export const ARQUIVO_CURADORIA = path.resolve(process.cwd(), "prisma", "dados", "curadoria.json");

export const CAMPOS_CURADOS = [
  "descricao",
  "endereco",
  "horarioFuncionamento",
  "faixaPreco",
  "acessibilidade",
  "telefoneContato",
  "siteOficial",
] as const;

type CampoCurado = (typeof CAMPOS_CURADOS)[number];

export interface ItemCuradoria {
  cidade: string;
  nome: string;
  fonte: string;
  conferidoEm: string;
  campos: Partial<Record<CampoCurado, string>>;
}

export interface ResumoCuradoria {
  aplicados: number;
  semMudanca: number;
  naoEncontrados: string[];
}

export function lerCuradoria(arquivo = ARQUIVO_CURADORIA): ItemCuradoria[] {
  return fs.existsSync(arquivo) ? (JSON.parse(fs.readFileSync(arquivo, "utf8")).itens as ItemCuradoria[]) : [];
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Aplica a curadoria. `importados` são os pontos como vieram do OpenStreetMap (por idOsm): um
 * campo só é trocado se ainda estiver vazio ou igual ao importado, ou seja, se ninguém o editou.
 */
export async function aplicarCuradoria(
  itens: ItemCuradoria[],
  importados: Map<string, PontoParaImportar> = new Map(
    lerDadosOsm().flatMap((c) => c.pontos.map((p) => [p.idOsm, p] as const)),
  ),
): Promise<ResumoCuradoria> {
  const resumo: ResumoCuradoria = { aplicados: 0, semMudanca: 0, naoEncontrados: [] };

  for (const item of itens) {
    const candidatos = await prisma.pontoTuristico.findMany({
      where: { cidade: { equals: item.cidade, mode: "insensitive" }, status: { not: StatusPonto.REJEITADO } },
    });
    const pontos = candidatos.filter((p) => normalizar(p.nome) === normalizar(item.nome));

    if (pontos.length === 0) {
      resumo.naoEncontrados.push(`${item.nome} (${item.cidade})`);
      continue;
    }

    for (const ponto of pontos) {
      const importado = ponto.idOsm ? importados.get(ponto.idOsm) : undefined;
      const dados: Partial<Record<CampoCurado, string>> = {};

      for (const campo of CAMPOS_CURADOS) {
        const conferido = item.campos[campo];
        const atual = ponto[campo];
        const naoEditado = atual === null || atual.trim() === "" || atual === (importado?.[campo] ?? null);

        if (conferido && conferido !== atual && naoEditado) {
          dados[campo] = conferido;
        }
      }

      if (Object.keys(dados).length === 0 && ponto.seloVerificado) {
        resumo.semMudanca += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await registrarVersaoPonto(ponto, `Conferido na fonte oficial (${item.fonte})`, null, tx);
        await tx.pontoTuristico.update({
          where: { id: ponto.id },
          data: { ...dados, seloVerificado: true, versao: { increment: 1 } },
        });
      });

      resumo.aplicados += 1;
    }
  }

  return resumo;
}
