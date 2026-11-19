import { describe, expect, it } from "vitest";
import { aceitarDigitacaoDeValor, formatarDistancia, formatarDuracao, formatarMoeda, lerValorEmCentavos } from "./formatar";

// O Intl usa espaço sem quebra entre "R$" e o valor: normalizamos para comparar com texto simples.
const simples = (texto: string) => texto.replace(/\s/g, " ");

describe("formatarDistancia", () => {
  it("mostra metros abaixo de 1 km", () => {
    expect(formatarDistancia(850)).toBe("850 m");
    expect(formatarDistancia(999.4)).toBe("999 m");
  });

  it("mostra km com uma casa e vírgula a partir de 1 km", () => {
    expect(formatarDistancia(1000)).toBe("1,0 km");
    expect(formatarDistancia(12345)).toBe("12,3 km");
  });
});

describe("formatarDuracao", () => {
  it("usa minutos abaixo de uma hora", () => {
    expect(formatarDuracao(45)).toBe("45 min");
    expect(formatarDuracao(0)).toBe("0 min");
  });

  it("usa horas e minutos com dois dígitos", () => {
    expect(formatarDuracao(90)).toBe("1h30");
    expect(formatarDuracao(125)).toBe("2h05");
  });

  it("omite os minutos quando a hora é exata", () => {
    expect(formatarDuracao(120)).toBe("2h");
  });

  it("não aceita duração negativa", () => {
    expect(formatarDuracao(-10)).toBe("0 min");
  });
});

describe("formatarMoeda", () => {
  it("converte centavos em reais", () => {
    expect(simples(formatarMoeda(12550))).toBe("R$ 125,50");
    expect(simples(formatarMoeda(0))).toBe("R$ 0,00");
  });
});

describe("lerValorEmCentavos", () => {
  it.each([
    ["12,50", 1250],
    ["12.5", 1250],
    ["1.234,56", 123456],
    ["R$ 20", 2000],
    ["1.500", 150000],
  ])("lê %s como %i centavos", (texto, centavos) => {
    expect(lerValorEmCentavos(texto)).toBe(centavos);
  });

  it("devolve null quando o campo está vazio", () => {
    expect(lerValorEmCentavos("")).toBeNull();
    expect(lerValorEmCentavos("   ")).toBeNull();
  });

  it("devolve NaN quando o texto não é um valor", () => {
    expect(lerValorEmCentavos("abc")).toBeNaN();
  });

  it.each(["abc25,90", "25abc", "25,90abc", "R$ abc25", "2 5", "1$0", "R$", "2..5", "1,,5", "25,9,0", "12e3"])(
    "texto com letras ou símbolos (%s) é inválido, não é limpo em silêncio",
    (texto) => {
      expect(lerValorEmCentavos(texto)).toBeNaN();
    },
  );

  it.each([
    ["R$20", 2000],
    ["r$ 20,5", 2050],
    ["  12,50  ", 1250],
    ["0,99", 99],
  ])("ainda aceita %s", (texto, centavos) => {
    expect(lerValorEmCentavos(texto)).toBe(centavos);
  });

  it.each(["-25,90", "−25,90", "R$ -25,90", "- 25", "25,90-"])(
    "valor negativo (%s) é inválido, não vira positivo",
    (texto) => {
      expect(lerValorEmCentavos(texto)).toBeNaN();
    },
  );
});

describe("aceitarDigitacaoDeValor", () => {
  it.each(["", "2", "25", "25,", "25,9", "25,90", "1.234,56", "1.", "12.5", ",5"])("aceita %j", (novo) => {
    expect(aceitarDigitacaoDeValor("anterior", novo)).toBe(novo);
  });

  it.each(["abc", "25abc", "abc25,90", "-25", "-25,90", "R$ 20", "25,901", "25,9,0", "1,,5", "1..2", "1.,5", "2 5", "12e3"])(
    "recusa %j e o campo fica como estava",
    (novo) => {
      expect(aceitarDigitacaoDeValor("12,5", novo)).toBe("12,5");
    },
  );

  it("tudo o que o campo aceita é um valor que dá para ler (ou ainda incompleto)", () => {
    for (const digitado of ["25,90", "1.234,56", "12", "0,5", ",5", "25,"]) {
      expect(lerValorEmCentavos(aceitarDigitacaoDeValor("", digitado))).not.toBeNaN();
    }
  });
});
