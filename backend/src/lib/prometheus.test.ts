import { EventEmitter, once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { iniciarServidorDeMetricas, medirRequisicoes, registro, rotaDaRequisicao } from "./prometheus";

describe("rotaDaRequisicao", () => {
  it("usa a rota declarada, com o prefixo do roteador, e não o endereço pedido", () => {
    assert.equal(rotaDaRequisicao({ baseUrl: "/roteiros", route: { path: "/:id/itens" } } as never), "/roteiros/:id/itens");
  });

  it("a raiz de um roteador é só o prefixo, e a raiz da aplicação é /", () => {
    assert.equal(rotaDaRequisicao({ baseUrl: "/pontos", route: { path: "/" } } as never), "/pontos");
    assert.equal(rotaDaRequisicao({ baseUrl: "", route: { path: "/health" } } as never), "/health");
  });

  it("endereço sem rota (404) vira um único rótulo, para as métricas não crescerem sem limite", () => {
    assert.equal(rotaDaRequisicao({ baseUrl: "", route: undefined } as never), "(sem rota)");
  });
});

describe("medirRequisicoes", () => {
  it("conta a requisição e registra o tempo quando a resposta termina", async () => {
    const req = { method: "GET", baseUrl: "/pontos", route: { path: "/:id" } } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { statusCode: 200 }) as unknown as Response;
    let seguiu = false;

    medirRequisicoes(req, res, () => {
      seguiu = true;
    });
    assert.equal(seguiu, true, "chama o próximo middleware");

    res.emit("finish");

    const texto = await registro.metrics();

    assert.match(texto, /nomadplan_http_requisicoes_total\{metodo="GET",rota="\/pontos\/:id",status="200"\} 1/);
    assert.match(texto, /nomadplan_http_duracao_segundos_count\{metodo="GET",rota="\/pontos\/:id"\} 1/);
  });

  it("expõe também as métricas padrão do Node, com o prefixo do projeto", async () => {
    assert.match(await registro.metrics(), /nomadplan_process_cpu_user_seconds_total/);
  });
});

describe("iniciarServidorDeMetricas", () => {
  // Porta 0: o sistema escolhe uma livre, então o teste não briga com nada em execução.
  async function subir() {
    const servidor = iniciarServidorDeMetricas(0);
    await once(servidor, "listening");
    return { servidor, porta: (servidor.address() as AddressInfo).port };
  }

  it("responde as métricas em GET /metrics, no formato do Prometheus", async () => {
    const { servidor, porta } = await subir();

    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/metrics`);

      assert.equal(resposta.status, 200);
      assert.match(resposta.headers.get("content-type") ?? "", /text\/plain/);
      assert.match(await resposta.text(), /nomadplan_http_requisicoes_total|nomadplan_process_cpu_user_seconds_total/);
    } finally {
      servidor.close();
    }
  });

  it("qualquer outro endereço ou método é 404: só as métricas ficam expostas", async () => {
    const { servidor, porta } = await subir();

    try {
      assert.equal((await fetch(`http://127.0.0.1:${porta}/admin`)).status, 404);
      assert.equal((await fetch(`http://127.0.0.1:${porta}/metrics`, { method: "POST" })).status, 404);
    } finally {
      servidor.close();
    }
  });

  it("porta ocupada registra o erro em vez de derrubar o processo", async () => {
    const { servidor: primeiro, porta } = await subir();
    const erros: string[] = [];
    const original = console.error;
    console.error = (...argumentos: unknown[]) => void erros.push(argumentos.join(" "));

    try {
      const segundo = iniciarServidorDeMetricas(porta);
      await once(segundo, "error");

      assert.match(erros.join("\n"), /Métricas indisponíveis/);
      segundo.close();
    } finally {
      console.error = original;
      primeiro.close();
    }
  });
});
