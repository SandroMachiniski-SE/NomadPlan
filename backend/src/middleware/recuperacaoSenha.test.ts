import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { limiteRecuperacaoSenha } from "./rateLimit";

describe("rate limit da recuperação de senha", () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.post("/auth/esqueci-senha", limiteRecuperacaoSenha, (_req, res) => {
      res.json({ mensagem: "ok" });
    });
    app.post("/auth/redefinir-senha", limiteRecuperacaoSenha, (_req, res) => {
      res.status(400).json({ erro: "Token inválido." });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
  });

  it("bloqueia a 11ª solicitação (contando as duas rotas juntas) com 429", async () => {
    const status: number[] = [];

    for (let i = 0; i < 11; i += 1) {
      const rota = i % 2 === 0 ? "esqueci-senha" : "redefinir-senha";
      const resposta = await fetch(`${base}/auth/${rota}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      status.push(resposta.status);
    }

    assert.deepEqual(status.slice(0, 10), [200, 400, 200, 400, 200, 400, 200, 400, 200, 400]);
    assert.equal(status[10], 429);
  });
});
