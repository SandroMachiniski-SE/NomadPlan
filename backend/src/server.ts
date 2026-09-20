import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import prisma from "./lib/prisma";
import pontosRouter from "./routes/pontos.routes";
import roteirosRouter from "./routes/roteiros.routes";
import authRouter from "./routes/auth.routes";
import sugestoesRouter from "./routes/sugestoes.routes";
import verificacoesRouter from "./routes/verificacoes.routes";
import avaliacoesRouter from "./routes/avaliacoes.routes";
import notificacoesRouter from "./routes/notificacoes.routes";
import adminRouter from "./routes/admin.routes";

const app = express();

// Atrás de proxy reverso (Nginx, load balancer) o IP real do cliente vem do
// X-Forwarded-For. Sem isso o rate limit por IP enxerga só o IP do proxy e
// bloqueia todos os usuários juntos. Defina TRUST_PROXY com o número de proxies
// confiáveis à frente da API (ex.: 1). Sem a variável, o comportamento não muda.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

const port = Number(process.env.PORT) || 3333;

app.use(helmet());
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

app.use(
  cors({
    origin: frontendUrl,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan("dev"));

app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "..", "uploads")),
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    servico: "NomadPlan-plus-backend",
  });
});

app.use("/auth", authRouter);
app.use("/pontos", pontosRouter);
app.use("/roteiros", roteirosRouter);
app.use("/sugestoes", sugestoesRouter);
app.use("/verificacoes", verificacoesRouter);
app.use("/avaliacoes", avaliacoesRouter);
app.use("/notificacoes", notificacoesRouter);
app.use("/admin", adminRouter);

app.use((_req, res) => {
  res.status(404).json({
    erro: "Rota não encontrada.",
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Erro não tratado:", error);

    res.status(500).json({
      erro: "Erro interno do servidor.",
    });
  },
);

const server = app.listen(port, () => {
  console.log(`NomadPlan API executando em http://localhost:${port}`);
});

async function shutdown() {
  console.log("Encerrando servidor...");

  await prisma.$disconnect();

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);