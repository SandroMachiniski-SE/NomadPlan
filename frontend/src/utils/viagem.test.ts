import { describe, expect, it } from "vitest";
import { conferirViagem, formatarCombustivel, lerNumero, pedidoDaViagem, type OpcoesViagemDeCarro } from "./viagem";

const simples = (texto: string) => texto.replace(/\s/g, " ");

const opcoes = (alteracoes: Partial<OpcoesViagemDeCarro> = {}): OpcoesViagemDeCarro => ({
  ativa: true,
  origem: null,
  kmPorDia: "500",
  horasPorDia: "",
  comVolta: false,
  consumo: "",
  preco: "",
  ...alteracoes,
});

describe("lerNumero", () => {
  it("aceita vírgula, ponto e o R$ na frente", () => {
    expect(lerNumero("11,5")).toBe(11.5);
    expect(lerNumero("6.29")).toBe(6.29);
    expect(lerNumero("R$ 6,29")).toBe(6.29);
  });

  it("devolve null para vazio ou texto inválido", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("  ")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
  });
});

describe("conferirViagem", () => {
  it("aceita um pedido dentro das faixas", () => {
    expect(conferirViagem(opcoes())).toBeNull();
    expect(conferirViagem(opcoes({ horasPorDia: "8", consumo: "11,5", preco: "6,29" }))).toBeNull();
  });

  it("exige o alvo por dia entre 150 e 1.000 km", () => {
    const mensagem = "O alvo por dia vai de 150 a 1.000 km.";

    expect(conferirViagem(opcoes({ kmPorDia: "" }))).toBe(mensagem);
    expect(conferirViagem(opcoes({ kmPorDia: "149" }))).toBe(mensagem);
    expect(conferirViagem(opcoes({ kmPorDia: "1001" }))).toBe(mensagem);
    expect(conferirViagem(opcoes({ kmPorDia: "150" }))).toBeNull();
    expect(conferirViagem(opcoes({ kmPorDia: "1000" }))).toBeNull();
  });

  it("confere as horas ao volante, o consumo e o preço só quando preenchidos", () => {
    expect(conferirViagem(opcoes({ horasPorDia: "1" }))).toBe("O máximo de horas ao volante vai de 2 a 14.");
    expect(conferirViagem(opcoes({ horasPorDia: "15" }))).toBe("O máximo de horas ao volante vai de 2 a 14.");
    expect(conferirViagem(opcoes({ consumo: "2" }))).toBe("O consumo do carro vai de 3 a 40 km/l.");
    expect(conferirViagem(opcoes({ consumo: "abc" }))).toBe("O consumo do carro vai de 3 a 40 km/l.");
    expect(conferirViagem(opcoes({ preco: "25" }))).toBe("O preço do litro vai de R$ 1,00 a R$ 20,00.");
  });
});

describe("pedidoDaViagem", () => {
  it("não monta o bloco quando a caixa está desmarcada", () => {
    expect(pedidoDaViagem(opcoes({ ativa: false }), [], [])).toBeUndefined();
  });

  it("converte o que foi digitado para o formato da API", () => {
    const pedido = pedidoDaViagem(
      opcoes({ kmPorDia: "550,4", horasPorDia: "8", consumo: "11,5", preco: "6,29", comVolta: true }),
      [],
      [],
    );

    expect(pedido).toMatchObject({
      kmPorDia: 550,
      horasPorDia: 8,
      consumoKmPorLitro: 11.5,
      precoLitroCentavos: 629,
      comVolta: true,
    });
  });

  it("omite os campos que ficaram vazios", () => {
    const pedido = pedidoDaViagem(opcoes(), [], []);

    expect(pedido).not.toHaveProperty("horasPorDia");
    expect(pedido).not.toHaveProperty("consumoKmPorLitro");
    expect(pedido).not.toHaveProperty("precoLitroCentavos");
    expect(pedido).not.toHaveProperty("origem");
  });
});

describe("formatarCombustivel", () => {
  it("fica vazio sem estimativa", () => {
    expect(formatarCombustivel(null, null)).toBe("");
    expect(formatarCombustivel(41.8, undefined)).toBe("");
  });

  it("mostra litros e custo quando há estimativa", () => {
    expect(simples(formatarCombustivel(41.8, 26292))).toBe(" · ~41,8 l · ~R$ 262,92");
  });
});
