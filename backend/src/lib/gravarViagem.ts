import { StatusPonto, type Prisma } from "@prisma/client";
import prisma from "./prisma";
import { pontoDoElemento, type ElementoOsm } from "./osm";
import { importarPontosOsm, type PontoParaImportar } from "./importacaoOsm";
import type { EntradaDaViagem, PlanoDaViagem, TrechoPlanejado } from "./viagemDeCarro";

// Salvamento e leitura da viagem de carro de um roteiro: os campos da viagem, um trecho_estrada
// por trecho dirigido e o pernoite de cada noite (o hotel escolhido ou "hotel a definir"). As
// hospedagens das cidades de pernoite entram no catálogo para poderem ser escolhidas depois.

export interface NoiteSalva {
  perna: number;
  noite: number;
  codigoIbge: number | null;
  idOsm?: string;
}

/** Problema no pedido de salvamento (vira o status informado com a mensagem). */
export class ErroAoSalvarViagem extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

function noitesDoPlano(plano: PlanoDaViagem) {
  return plano.pernas.flatMap((p) =>
    p.trechos.flatMap((t) => (t.noite === null ? [] : [{ perna: p.perna, trecho: t as TrechoPlanejado & { noite: number } }])),
  );
}

/** As noites recalculadas (perna, noite e cidade) são as mesmas que a pessoa viu na tela? */
export function conferirNoites(plano: PlanoDaViagem, noites: NoiteSalva[]): boolean {
  const calculadas = noitesDoPlano(plano);

  return (
    calculadas.length === noites.length &&
    calculadas.every(({ perna, trecho }) =>
      noites.some((n) => n.perna === perna && n.noite === trecho.noite && n.codigoIbge === (trecho.pernoite?.codigoIbge ?? null)),
    )
  );
}

/** Dias que terminam num pernoite da estrada (os pernoites deles vêm da viagem, não das paradas). */
export function diasComNoiteNaEstrada(plano: PlanoDaViagem): Set<number> {
  return new Set(noitesDoPlano(plano).map(({ trecho }) => trecho.dia));
}

/** Confere que cada hotel escolhido está entre as hospedagens da cidade daquela noite. */
export function conferirHoteis(plano: PlanoDaViagem, noites: NoiteSalva[]): void {
  for (const { perna, trecho } of noitesDoPlano(plano)) {
    const escolhida = noites.find((n) => n.perna === perna && n.noite === trecho.noite);
    const codigo = trecho.pernoite?.codigoIbge;

    if (!escolhida?.idOsm) continue;

    const resumo = codigo ? plano.resumos.get(codigo) : undefined;

    if (!resumo?.hospedagens.some((h) => h.idOsm === escolhida.idOsm)) {
      throw new ErroAoSalvarViagem(`Hotel não encontrado entre as hospedagens de ${trecho.pernoite?.cidade ?? "esta noite"}.`, 400);
    }
  }
}

/** Leva ao catálogo as hospedagens das cidades de pernoite; devolve idOsm → id do ponto. */
export async function hospedagensParaOCatalogo(plano: PlanoDaViagem): Promise<Map<string, number>> {
  const pontos = new Map<string, PontoParaImportar>();

  for (const { trecho } of noitesDoPlano(plano)) {
    const cidade = trecho.pernoite;
    const resumo = cidade?.codigoIbge ? plano.resumos.get(cidade.codigoIbge) : undefined;

    for (const h of resumo?.hospedagens ?? []) {
      const [tipo, id] = h.idOsm.split("/");
      const elemento: ElementoOsm = { type: tipo as ElementoOsm["type"], id: Number(id), lat: h.latitude, lon: h.longitude, tags: h.tags };
      const ponto = pontoDoElemento(elemento, cidade!.cidade);

      if (ponto && !pontos.has(ponto.idOsm)) {
        const { wikidata: _w, wikimediaCommons: _c, descricaoGerada: _d, ...paraImportar } = ponto;
        pontos.set(ponto.idOsm, paraImportar);
      }
    }
  }

  if (pontos.size === 0) return new Map();

  await importarPontosOsm([...pontos.values()]);

  // Hotel rejeitado pela moderação (ou ainda em revisão) não vira pernoite: fica só o nome.
  const gravados = await prisma.pontoTuristico.findMany({
    where: { idOsm: { in: [...pontos.keys()] }, status: StatusPonto.PUBLICADO },
    select: { id: true, idOsm: true },
  });

  return new Map(gravados.map((p) => [p.idOsm!, p.id]));
}

export async function gravarViagemDeCarro(
  tx: Prisma.TransactionClient,
  idRoteiro: number,
  entrada: EntradaDaViagem,
  plano: PlanoDaViagem,
  noites: NoiteSalva[],
  idsDosHoteis: Map<string, number>,
): Promise<void> {
  await tx.roteiro.update({
    where: { id: idRoteiro },
    data: {
      viagemOrigem: entrada.origem.codigoIbge,
      kmPorDia: entrada.kmPorDia,
      horasPorDia: entrada.horasPorDia,
      viagemVolta: entrada.comVolta,
      consumoKmPorLitro: entrada.consumoKmPorLitro,
      precoLitroCentavos: entrada.precoLitroCentavos,
    },
  });

  await tx.trechoEstrada.createMany({
    data: plano.pernas.flatMap((p) =>
      p.trechos.map((t) => ({
        idRoteiro,
        dia: t.dia,
        perna: p.perna,
        noite: t.noite,
        deNome: t.de,
        paraNome: t.para,
        metros: t.metros,
        segundos: t.segundos,
        ocupaODia: t.ocupaODia,
        noFimDoDia: t.noFimDoDia,
        litros: t.litros,
        custoCombustivelCentavos: t.custoCentavos,
        tracado: t.tracado,
      })),
    ),
  });

  for (const { perna, trecho } of noitesDoPlano(plano)) {
    const escolhida = noites.find((n) => n.perna === perna && n.noite === trecho.noite);
    const pernoite = trecho.pernoite!;
    const idPonto = escolhida?.idOsm ? idsDosHoteis.get(escolhida.idOsm) : undefined;
    const hotel = escolhida?.idOsm ? plano.resumos.get(pernoite.codigoIbge!)?.hospedagens.find((h) => h.idOsm === escolhida.idOsm) : undefined;
    // Hotel que o classificador do OSM não aceitou como ponto continua escolhido, pelo nome.
    const titulo = idPonto
      ? null
      : hotel
        ? `Pernoite no ${hotel.nome} (${pernoite.cidade})`
        : pernoite.codigoIbge
          ? `Pernoite em ${pernoite.cidade} (hotel a definir)`
          : `Pernoite no km ${Math.round(pernoite.km)} (a definir)`;

    await tx.itemRoteiro.create({
      data: { idRoteiro, idPonto: idPonto ?? null, titulo, dia: trecho.dia, ordem: 0, pernoite: true },
    });
  }
}

type RoteiroComViagem = {
  kmPorDia: number | null;
  horasPorDia: Prisma.Decimal | null;
  viagemVolta: boolean | null;
  consumoKmPorLitro: Prisma.Decimal | null;
  precoLitroCentavos: number | null;
  municipioDeOrigem: { codigoIbge: number; nome: string; uf: string } | null;
};

const numero = (valor: Prisma.Decimal | null) => (valor === null ? null : Number(valor));

/** Os campos da viagem como a API devolve; o link público não mostra consumo nem preço. */
export function viagemDoRoteiro(roteiro: RoteiroComViagem, publico = false) {
  if (roteiro.kmPorDia === null) return null;

  const origem = roteiro.municipioDeOrigem;
  const base = {
    origem: origem ? { codigoIbge: origem.codigoIbge, cidade: origem.nome, uf: origem.uf } : null,
    kmPorDia: roteiro.kmPorDia,
    horasPorDia: numero(roteiro.horasPorDia),
    comVolta: roteiro.viagemVolta ?? false,
  };

  return publico
    ? base
    : { ...base, consumoKmPorLitro: numero(roteiro.consumoKmPorLitro), precoLitroCentavos: roteiro.precoLitroCentavos };
}

type TrechoGravado = {
  dia: number;
  perna: number;
  noite: number | null;
  deNome: string;
  paraNome: string;
  metros: number;
  segundos: number;
  ocupaODia: boolean;
  noFimDoDia: boolean;
  litros: Prisma.Decimal | null;
  custoCombustivelCentavos: number | null;
  tracado: Prisma.JsonValue;
};

export function trechosDoRoteiro(trechos: TrechoGravado[], publico = false) {
  return trechos.map((t) => {
    const base = {
      dia: t.dia,
      perna: t.perna,
      noite: t.noite,
      de: t.deNome,
      para: t.paraNome,
      metros: t.metros,
      segundos: t.segundos,
      ocupaODia: t.ocupaODia,
      noFimDoDia: t.noFimDoDia,
      tracado: t.tracado as [number, number][],
    };

    return publico ? base : { ...base, litros: numero(t.litros), custoCentavos: t.custoCombustivelCentavos };
  });
}

export const selecaoDaViagem = {
  kmPorDia: true,
  horasPorDia: true,
  viagemVolta: true,
  consumoKmPorLitro: true,
  precoLitroCentavos: true,
  municipioDeOrigem: { select: { codigoIbge: true, nome: true, uf: true } },
  trechosEstrada: { orderBy: [{ dia: "asc" }, { perna: "asc" }] },
} as const satisfies Prisma.RoteiroSelect;
