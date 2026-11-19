import { describe, expect, it } from "vitest";
import { extrairMensagemErro } from "./erro";

describe("extrairMensagemErro", () => {
  it("devolve o texto de erro enviado pela API", () => {
    expect(extrairMensagemErro({ response: { data: { erro: "Já existe." } } }, "padrão")).toBe("Já existe.");
  });

  it("cai na mensagem padrão sem resposta, sem texto ou com texto de outro tipo", () => {
    expect(extrairMensagemErro(new Error("x"), "padrão")).toBe("padrão");
    expect(extrairMensagemErro({ response: { data: {} } }, "padrão")).toBe("padrão");
    expect(extrairMensagemErro({ response: { data: { erro: 500 } } }, "padrão")).toBe("padrão");
    expect(extrairMensagemErro(null, "padrão")).toBe("padrão");
    expect(extrairMensagemErro("texto", "padrão")).toBe("padrão");
  });
});
