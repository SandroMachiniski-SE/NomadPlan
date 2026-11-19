import http from "node:http";
import type { NextFunction, Request, Response } from "express";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

// Observabilidade (Prometheus + Grafana): a API conta as requisições por método, rota e status e mede o
// tempo de resposta, além das métricas padrão do Node (memória, CPU, atraso do laço de eventos...).
// As métricas saem por uma porta INTERNA (METRICAS_PORT, padrão 9464), nunca pela porta pública da API:
// o proxy HTTPS só encaminha a porta da API, então /metrics não fica na internet.

export const registro = new Registry();

collectDefaultMetrics({ register: registro, prefix: "nomadplan_" });

const requisicoes = new Counter({
  name: "nomadplan_http_requisicoes_total",
  help: "Requisições HTTP atendidas, por método, rota e status.",
  labelNames: ["metodo", "rota", "status"] as const,
  registers: [registro],
});

const duracao = new Histogram({
  name: "nomadplan_http_duracao_segundos",
  help: "Tempo de resposta das requisições HTTP, em segundos.",
  labelNames: ["metodo", "rota"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registro],
});

/**
 * A rota como foi declarada ("/roteiros/:id"), não o endereço pedido ("/roteiros/42"): com o endereço
 * cada id criaria uma série nova e as métricas cresceriam sem limite. Endereço sem rota (404) vira um
 * rótulo único.
 */
export function rotaDaRequisicao(req: Pick<Request, "baseUrl" | "route">): string {
  const caminho = req.route?.path;

  if (typeof caminho !== "string") return "(sem rota)";

  const completo = `${req.baseUrl ?? ""}${caminho === "/" ? "" : caminho}`;

  return completo === "" ? "/" : completo;
}

/** Middleware: ao terminar a resposta, conta a requisição e registra o tempo. */
export function medirRequisicoes(req: Request, res: Response, next: NextFunction): void {
  const inicio = process.hrtime.bigint();

  res.on("finish", () => {
    const rota = rotaDaRequisicao(req);
    const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;

    requisicoes.inc({ metodo: req.method, rota, status: String(res.statusCode) });
    duracao.observe({ metodo: req.method, rota }, segundos);
  });

  next();
}

/** Servidor só de métricas, em porta interna. Devolve o servidor para poder ser fechado. */
export function iniciarServidorDeMetricas(porta: number): http.Server {
  const servidor = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/metrics") {
      res.setHeader("Content-Type", registro.contentType);
      res.end(await registro.metrics());
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  // Porta ocupada (dois servidores na mesma máquina, em desenvolvimento) não pode derrubar a API.
  servidor.on("error", (erro) => console.error(`Métricas indisponíveis na porta ${porta}:`, erro.message));

  servidor.listen(porta, () => console.log(`Métricas (Prometheus) em http://localhost:${porta}/metrics`));

  return servidor;
}
