import { describe, expect, it } from "vitest";
import { formatarHoraEmBrasilia, instanteEmBrasilia } from "./fuso";

describe("instanteEmBrasilia", () => {
  it("09:00 digitado é 09:00 em Brasília (12:00 UTC), seja qual for o fuso do navegador", () => {
    expect(instanteEmBrasilia("2026-11-20T09:00")).toBe("2026-11-20T12:00:00.000Z");
  });

  it("passa da meia-noite para o dia seguinte em UTC", () => {
    expect(instanteEmBrasilia("2026-11-20T22:30")).toBe("2026-11-21T01:30:00.000Z");
  });

  it("aceita segundos e rejeita o que não é data e hora", () => {
    expect(instanteEmBrasilia("2026-11-20T09:00:30")).toBe("2026-11-20T12:00:00.000Z");
    expect(instanteEmBrasilia("")).toBeNull();
    expect(instanteEmBrasilia("amanhã às 9")).toBeNull();
  });
});

describe("formatarHoraEmBrasilia", () => {
  it("mostra o relógio de Brasília e não o do navegador", () => {
    expect(formatarHoraEmBrasilia("2026-11-20T12:00:00.000Z")).toBe("09:00");
    expect(formatarHoraEmBrasilia("2026-11-21T01:30:00.000Z")).toBe("22:30");
  });

  it("é o inverso de instanteEmBrasilia", () => {
    const instante = instanteEmBrasilia("2026-07-04T14:45");

    expect(formatarHoraEmBrasilia(instante!)).toBe("14:45");
  });
});
