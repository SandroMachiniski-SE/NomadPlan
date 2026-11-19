import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { medirRequisicoes, registro, rotaDaRequisicao } from "./prometheus";

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
