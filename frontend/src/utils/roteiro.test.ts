import { describe, expect, it } from "vitest";
import type { ItemRoteiro } from "../types/roteiro";
import {
  MAX_DIAS,
  agruparPorDia,
  cidadesDoDia,
  contarDias,
  corDoDia,
  descreverTrecho,
  nomeDoItem,
  rotuloDoDia,
  totalDoDia,
} from "./roteiro";

function item(extra: Partial<ItemRoteiro>): ItemRoteiro {
  return {
    id: 1,
    idRoteiro: 1,
    idPonto: null,
    dia: 1,
    ordem: 1,
    titulo: null,
    periodo: null,
    pernoite: false,
    observacao: null,
    dataCriacao: "2026-11-01T00:00:00Z",
    ponto: null,
    deslocamento: null,
    ...extra,
  };
}

const ponto = (nome: string, cidade: string) =>
  ({ id: 1, nome, cidade }) as unknown as NonNullable<ItemRoteiro["ponto"]>;

describe("roteiro", () => {
  it("a cor do dia repete a partir do oitavo", () => {
    expect(corDoDia(1)).toBe(corDoDia(8));
    expect(corDoDia(1)).not.toBe(corDoDia(2));
  });

  it("agrupa por dia, mantém dias vazios e deixa a pernoite por último", () => {
    const grupos = agruparPorDia(
      [item({ id: 1, dia: 2, ordem: 1, pernoite: true }), item({ id: 2, dia: 2, ordem: 5 }), item({ id: 3, dia: 1 })],
      3,
    );

    expect(grupos.map((g) => g.dia)).toEqual([1, 2, 3]);
    expect(grupos[1].itens.map((i) => i.id)).toEqual([2, 1]);
    expect(grupos[2].itens).toEqual([]);
  });

  it("o nome da parada vem do ponto, do título ou do padrão", () => {
    expect(nomeDoItem(item({ ponto: ponto("Cascata", "Gramado") }))).toBe("Cascata");
    expect(nomeDoItem(item({ titulo: "Almoço" }))).toBe("Almoço");
    expect(nomeDoItem(item({}))).toBe("Atividade");
  });

  it("lista as cidades do dia sem repetir e ignora atividades livres", () => {
    const itens = [
      item({ ponto: ponto("A", "Gramado") }),
      item({ ponto: ponto("B", "Gramado") }),
      item({ ponto: ponto("C", "Canela") }),
      item({ titulo: "Livre" }),
    ];

    expect(cidadesDoDia(itens)).toEqual(["Gramado", "Canela"]);
  });

  it("conta os dias pelo maior em uso, pelo período ou pelo mínimo pedido, até o limite", () => {
    expect(contarDias([], null, null)).toBe(1);
    expect(contarDias([item({ dia: 4 })], null, null)).toBe(4);
    expect(contarDias([], "2026-11-01", "2026-11-05")).toBe(5);
    expect(contarDias([], null, null, 3)).toBe(3);
    expect(contarDias([], "2026-01-01", "2026-12-31")).toBe(MAX_DIAS);
    expect(contarDias([], "lixo", "lixo")).toBe(1);
  });

  it("rotula o dia com a data quando há início", () => {
    expect(rotuloDoDia(2, null)).toBe("Dia 2");
    expect(rotuloDoDia(2, "2026-11-04T00:00:00.000Z")).toMatch(/^Dia 2 · .*05\/11/);
  });

  it("descreve e soma os trechos", () => {
    expect(descreverTrecho({ metros: 1500, minutos: 20 })).toContain("≈");

    expect(
      totalDoDia([
        item({ deslocamento: { metros: 1000, minutos: 10 } }),
        item({ deslocamento: null }),
        item({ deslocamento: { metros: 500, minutos: 5 } }),
      ]),
    ).toEqual({ metros: 1500, minutos: 15 });
  });
});
