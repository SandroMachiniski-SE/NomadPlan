import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { limiteLogin, limiteLoginPorEmail } from "./rateLimit";

// Simula um login que sempre falha (senha errada): o handler devolve 401, e o
// rate limit deve virar 429 a partir da 11ª tentativa.
function criarApp(trustProxy: boolean) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.use(express.json());
  app.post("/auth/login", limiteLogin, limiteLoginPorEmail, (_req, res) => {
    res.status(401).json({ erro: "Credenciais inválidas." });
  });
  return app;
}

function iniciar(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function tentar(base: string, email: string, ip?: string): Promise<number> {
  const resposta = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ip ? { "X-Forwarded-For": ip } : {}) },
    body: JSON.stringify({ email, senha: "senha-errada" }),
  });
  return resposta.status;
}

describe("rate limit do login", () => {
  let semProxy: { server: Server; base: string };
  let comProxy: { server: Server; base: string };

  before(async () => {
    semProxy = await iniciar(criarApp(false));
    comProxy = await iniciar(criarApp(true));
  });

  after(() => {
    semProxy.server.close();
    comProxy.server.close();
  });

  it("responde 401 nas 10 primeiras senhas erradas do mesmo IP e 429 na 11ª", async () => {
    for (let i = 1; i <= 10; i++) {
      assert.equal(await tentar(semProxy.base, `pessoa${i}@exemplo.com`), 401, `tentativa ${i}`);
    }
    assert.equal(await tentar(semProxy.base, "pessoa11@exemplo.com"), 429);
  });

  it("com trust proxy, IPs diferentes têm contadores separados", async () => {
    for (let i = 1; i <= 15; i++) {
      assert.equal(await tentar(comProxy.base, `outra${i}@exemplo.com`, `203.0.113.${i}`), 401, `IP ${i}`);
    }
  });

  it("bloqueia por e-mail mesmo trocando de IP a cada tentativa", async () => {
    const alvo = "vitima@exemplo.com";
    for (let i = 1; i <= 10; i++) {
      assert.equal(await tentar(comProxy.base, alvo, `198.51.100.${i}`), 401, `tentativa ${i}`);
    }
    assert.equal(await tentar(comProxy.base, alvo, "198.51.100.200"), 429);
    // outro e-mail, vindo de um IP novo, continua liberado
    assert.equal(await tentar(comProxy.base, "outra-pessoa@exemplo.com", "198.51.100.201"), 401);
  });
});
