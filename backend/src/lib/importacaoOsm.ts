import { OrigemRegistro, PontoTuristico, StatusPonto } from "@prisma/client";
import prisma from "./prisma";
import { distanciaMetros } from "./geo";
import { registrarVersaoPonto } from "./versionamento";
import type { PontoOsm } from "./osm";

// Grava no banco os pontos lidos do OpenStreetMap. Regras:
//   - ponto novo entra publicado, com origem "API" e o vínculo com o elemento do OSM;
//   - ponto que já veio do OSM antes (mesmo idOsm) não é duplicado;
//   - ponto cadastrado à mão com o mesmo nome (ou nome parecido a menos de 150 m) é
//     vinculado ao elemento do OSM em vez de ganhar uma cópia;
//   - num ponto que já existe, a importação só preenche o que está vazio: o que a
//     comunidade e os responsáveis editaram tem prioridade sobre o OSM;
//   - ponto rejeitado pela moderação continua rejeitado.

const CAMPOS_COMPLEMENTAVEIS = [
  "descricao",
  "endereco",
  "faixaPreco",
  "acessibilidade",
  "siteOficial",
  "telefoneContato",
  "horarioFuncionamento",
] as const;

const DISTANCIA_MESMO_LUGAR_METROS = 150;
const TAMANHO_DO_LOTE = 500;

export type PontoParaImportar = Omit<PontoOsm, "wikidata" | "wikimediaCommons" | "descricaoGerada">;

export interface ResumoImportacaoOsm {
  criados: number;
  complementados: number;
  vinculados: number;
  semMudanca: number;
  ignorados: number;
}

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function vazio(valor: string | null): boolean {
  return valor === null || valor.trim() === "";
}

/** Campos do OSM que preenchem lacunas do ponto existente (nunca sobrescreve). */
function complemento(existente: PontoTuristico, novo: PontoParaImportar) {
  const dados: Partial<Record<(typeof CAMPOS_COMPLEMENTAVEIS)[number] | "imagemUrl" | "imagemCredito" | "imagemFonte", string>> = {};

  for (const campo of CAMPOS_COMPLEMENTAVEIS) {
    const valor = novo[campo];

    if (vazio(existente[campo]) && valor) {
      dados[campo] = valor;
    }
  }

  if (vazio(existente.imagemUrl) && novo.imagemUrl) {
    dados.imagemUrl = novo.imagemUrl;
    if (novo.imagemCredito) dados.imagemCredito = novo.imagemCredito;
    if (novo.imagemFonte) dados.imagemFonte = novo.imagemFonte;
  }

  return dados;
}

function mesmoLugar(existente: PontoTuristico, novo: PontoParaImportar): boolean {
  const a = normalizarNome(existente.nome);
  const b = normalizarNome(novo.nome);

  if (a === b) {
    return true;
  }

  if (existente.latitude === null || existente.longitude === null) {
    return false;
  }

  const perto =
    distanciaMetros(existente.latitude, existente.longitude, novo.latitude, novo.longitude) <=
    DISTANCIA_MESMO_LUGAR_METROS;

  return perto && (a.includes(b) || b.includes(a));
}

async function atualizarExistente(
  existente: PontoTuristico,
  novo: PontoParaImportar,
  agora: Date,
  vincular: boolean,
): Promise<boolean> {
  const dados = complemento(existente, novo);
  const mudouConteudo = Object.keys(dados).length > 0;

  await prisma.$transaction(async (tx) => {
    if (mudouConteudo) {
      await registrarVersaoPonto(existente, "Complementado com dados do OpenStreetMap", null, tx);
    }

    await tx.pontoTuristico.update({
      where: { id: existente.id },
      data: {
        ...dados,
        ...(vincular ? { idOsm: novo.idOsm } : {}),
        sincronizadoEm: agora,
        // Quem estava editando o ponto precisa saber que ele mudou (bloqueio otimista).
        ...(mudouConteudo ? { versao: { increment: 1 } } : {}),
      },
    });
  });

  return mudouConteudo;
}

export async function importarPontosOsm(
  pontos: PontoParaImportar[],
  agora: Date = new Date(),
): Promise<ResumoImportacaoOsm> {
  const resumo: ResumoImportacaoOsm = { criados: 0, complementados: 0, vinculados: 0, semMudanca: 0, ignorados: 0 };

  const jaImportados = new Map(
    (
      await prisma.pontoTuristico.findMany({
        where: { idOsm: { in: pontos.map((p) => p.idOsm) } },
      })
    ).map((p) => [p.idOsm!, p]),
  );

  const cidades = [...new Set(pontos.map((p) => p.cidade))];
  const semVinculo = await prisma.pontoTuristico.findMany({
    where: {
      idOsm: null,
      status: { not: StatusPonto.REJEITADO },
      OR: cidades.map((cidade) => ({ cidade: { equals: cidade, mode: "insensitive" as const } })),
    },
  });

  const novos: PontoParaImportar[] = [];

  for (const ponto of pontos) {
    const importado = jaImportados.get(ponto.idOsm);

    if (importado) {
      if (importado.status === StatusPonto.REJEITADO) {
        resumo.ignorados += 1;
      } else if (await atualizarExistente(importado, ponto, agora, false)) {
        resumo.complementados += 1;
      } else {
        resumo.semMudanca += 1;
      }
      continue;
    }

    const indice = semVinculo.findIndex(
      (existente) => normalizarNome(existente.cidade) === normalizarNome(ponto.cidade) && mesmoLugar(existente, ponto),
    );

    if (indice !== -1) {
      const [existente] = semVinculo.splice(indice, 1);

      await atualizarExistente(existente, ponto, agora, true);
      resumo.vinculados += 1;
      continue;
    }

    novos.push(ponto);
  }

  for (let inicio = 0; inicio < novos.length; inicio += TAMANHO_DO_LOTE) {
    const { count } = await prisma.pontoTuristico.createMany({
      data: novos.slice(inicio, inicio + TAMANHO_DO_LOTE).map((ponto) => ({
        idOsm: ponto.idOsm,
        nome: ponto.nome,
        descricao: ponto.descricao,
        categoria: ponto.categoria,
        cidade: ponto.cidade,
        endereco: ponto.endereco,
        latitude: ponto.latitude,
        longitude: ponto.longitude,
        faixaPreco: ponto.faixaPreco,
        acessibilidade: ponto.acessibilidade,
        siteOficial: ponto.siteOficial,
        telefoneContato: ponto.telefoneContato,
        horarioFuncionamento: ponto.horarioFuncionamento,
        imagemUrl: ponto.imagemUrl,
        imagemCredito: ponto.imagemCredito,
        imagemFonte: ponto.imagemFonte,
        origem: OrigemRegistro.API,
        status: StatusPonto.PUBLICADO,
        sincronizadoEm: agora,
      })),
      // Duas importações ao mesmo tempo não duplicam: o idOsm é único no banco.
      skipDuplicates: true,
    });

    resumo.criados += count;
  }

  return resumo;
}
