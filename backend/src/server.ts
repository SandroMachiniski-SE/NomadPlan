import "dotenv/config";
import prisma from "./lib/prisma";
import { criarApp } from "./app";
import { descreverConfiguracaoEmail, lerConfiguracaoSmtp } from "./lib/email";
import { descarregarMetricas } from "./lib/metricasUso";
import { iniciarServidorDeMetricas } from "./lib/prometheus";

const app = criarApp();

const port = Number(process.env.PORT) || 3333;

const server = app.listen(port, () => {
  console.log(`NomadPlan API executando em http://localhost:${port}`);
  console.log(descreverConfiguracaoEmail(lerConfiguracaoSmtp()));
});

// Métricas para o Prometheus em porta interna (não é a da API; o proxy HTTPS não a encaminha).
const servidorDeMetricas = process.env.METRICAS_PORT === "0" ? null : iniciarServidorDeMetricas(Number(process.env.METRICAS_PORT) || 9464);

async function shutdown() {
  console.log("Encerrando servidor...");

  // Eventos de uso ainda em memória não podem se perder no desligamento.
  await descarregarMetricas().catch((error) => console.error("Erro ao salvar métricas:", error));
  await prisma.$disconnect();

  servidorDeMetricas?.close();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
