import fs from "fs";
import path from "path";
import { OrigemRegistro, PontoTuristico, StatusPonto } from "@prisma/client";
import prisma from "./prisma";
import { distanciaMetros } from "./geo";
import { registrarVersaoPonto } from "./versionamento";
import {
  aceitaContatoDoOverture,
  correspondente,
  DISTANCIA_MESMO_LUGAR_METROS,
  ehHospedagemNova,
  nomesParecidos,
  siteDoLugar,
  telefoneDoLugar,
  tipoDeHospedagem,
  type LugarOverture,
} from "./overture";

// Grava no banco o que veio do Overture Maps (scripts/dados/baixar_overture.py):
//   - pontos que já temos ganham telefone e site quando estão vazios (nunca sobrescreve);
//   - hospedagens confiáveis que ainda não existem viram pontos novos, publicados;
//   - o idOverture evita duplicar numa nova importação, e um ponto rejeitado não volta.

export const PASTA_DADOS_OVERTURE = path.resolve(process.cwd(), "prisma", "dados", "overture");

export interface DadosOvertureDaCidade {
  fonte: string;
  licenca: string;
  cidade: string;
  baixadoEm: string;
  lugares: LugarOverture[];
}

export interface ResumoImportacaoOverture {
  complementados: number;
  vinculados: number;
  criados: number;
}

export function lerDadosOverture(arquivos: string[] = []): DadosOvertureDaCidade[] {
  const caminhos =
    arquivos.length > 0
      ? arquivos.map((arquivo) => path.resolve(arquivo))
      : fs.existsSync(PASTA_DADOS_OVERTURE)
        ? fs
            .readdirSync(PASTA_DADOS_OVERTURE)
            .filter((nome) => nome.endsWith(".json"))
            .sort()
            .map((nome) => path.join(PASTA_DADOS_OVERTURE, nome))
        : [];

  return caminhos.map((caminho) => JSON.parse(fs.readFileSync(caminho, "utf8")) as DadosOvertureDaCidade);
}

function vazio(valor: string | null): boolean {
  return valor === null || valor.trim() === "";
}

async function complementar(
  ponto: PontoTuristico,
  lugar: LugarOverture,
  vincular: boolean,
  agora: Date,
): Promise<boolean> {
  const dados: { telefoneContato?: string; siteOficial?: string } = {};
  const telefone = telefoneDoLugar(lugar);
  const site = siteDoLugar(lugar);

  if (vazio(ponto.telefoneContato) && telefone) dados.telefoneContato = telefone;
  if (vazio(ponto.siteOficial) && site) dados.siteOficial = site;

  const mudouConteudo = Object.keys(dados).length > 0;

  if (!mudouConteudo && !vincular) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    if (mudouConteudo) {
      await registrarVersaoPonto(ponto, "Complementado com dados do Overture Maps", null, tx);
    }

    await tx.pontoTuristico.update({
      where: { id: ponto.id },
      data: {
        ...dados,
        ...(vincular ? { idOverture: lugar.idOverture } : {}),
        sincronizadoEm: agora,
        ...(mudouConteudo ? { versao: { increment: 1 } } : {}),
      },
    });
  });

  return mudouConteudo;
}

export async function importarOverture(
  cidades: DadosOvertureDaCidade[],
  agora: Date = new Date(),
): Promise<ResumoImportacaoOverture> {
  const resumo: ResumoImportacaoOverture = { complementados: 0, vinculados: 0, criados: 0 };

  for (const { cidade, lugares } of cidades) {
    const porId = new Map(lugares.map((l) => [l.idOverture, l]));

    // Inclui os rejeitados: o idOverture deles não pode virar ponto de novo.
    const jaVinculados = await prisma.pontoTuristico.findMany({
      where: { idOverture: { in: [...porId.keys()] } },
      select: { idOverture: true },
    });
    const usados = new Set(jaVinculados.map((p) => p.idOverture!));

    const existentes = await prisma.pontoTuristico.findMany({
      where: { cidade: { equals: cidade, mode: "insensitive" }, status: { not: StatusPonto.REJEITADO } },
    });

    for (const ponto of existentes) {
      if (!aceitaContatoDoOverture(ponto.categoria)) continue;

      const lugar = ponto.idOverture
        ? porId.get(ponto.idOverture)
        : correspondente(
            ponto,
            lugares.filter((l) => !usados.has(l.idOverture)),
          );

      if (!lugar) continue;

      const vincular = !ponto.idOverture;

      if (await complementar(ponto, lugar, vincular, agora)) {
        resumo.complementados += 1;
      } else if (vincular) {
        resumo.vinculados += 1;
      }

      usados.add(lugar.idOverture);
    }

    // Hospedagens novas: sem repetir umas às outras nem os pontos que já existem.
    const novas: LugarOverture[] = [];

    for (const lugar of [...lugares].sort((a, b) => b.confianca - a.confianca)) {
      const mesmoLugar = (outro: { nome: string; latitude: number | null; longitude: number | null }) =>
        outro.latitude !== null &&
        outro.longitude !== null &&
        nomesParecidos(outro.nome, lugar.nome) &&
        distanciaMetros(outro.latitude, outro.longitude, lugar.latitude, lugar.longitude) <= DISTANCIA_MESMO_LUGAR_METROS;

      if (
        ehHospedagemNova(lugar, cidade) &&
        !usados.has(lugar.idOverture) &&
        !existentes.some(mesmoLugar) &&
        !novas.some(mesmoLugar)
      ) {
        novas.push(lugar);
      }
    }

    if (novas.length > 0) {
      const { count } = await prisma.pontoTuristico.createMany({
        data: novas.map((lugar) => ({
          idOverture: lugar.idOverture,
          nome: lugar.nome.slice(0, 160),
          descricao: `${tipoDeHospedagem(lugar)}.`,
          categoria: "Hospedagem",
          cidade,
          endereco: lugar.endereco?.slice(0, 200) ?? null,
          latitude: lugar.latitude,
          longitude: lugar.longitude,
          telefoneContato: telefoneDoLugar(lugar),
          siteOficial: siteDoLugar(lugar),
          origem: OrigemRegistro.API,
          status: StatusPonto.PUBLICADO,
          sincronizadoEm: agora,
        })),
        skipDuplicates: true,
      });

      resumo.criados += count;
    }
  }

  return resumo;
}
