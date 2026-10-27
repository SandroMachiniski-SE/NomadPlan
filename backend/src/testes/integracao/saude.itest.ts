import "../ambiente";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarCliente, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

describe("infraestrutura de testes de integração", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;

  before(async () => {
    await limparBanco();
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  after(async () => {
    await servidor.fechar();
  });

  it("responde ao health check", async () => {
    const r = await api("GET", "/health");

    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { status: "ok", servico: "nomadplan-api" });
  });

  it("devolve 404 em JSON para rota inexistente", async () => {
    const r = await api("GET", "/nada-aqui");

    assert.equal(r.status, 404);
    assert.equal(r.corpo.erro, "Rota não encontrada.");
  });

  it("devolve 400 (e não 500) para JSON malformado", async () => {
    const r = await api("POST", "/auth/login", {
      headers: { "Content-Type": "application/json" },
      form: undefined,
      json: undefined,
    });
    assert.ok([400, 401].includes(r.status));

    const resposta = await fetch(`${servidor.base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{isto não é json",
    });
    assert.equal(resposta.status, 400);
  });
});
