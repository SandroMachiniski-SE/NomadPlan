import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import prisma from "./lib/prisma";
import pontosRouter from "./routes/pontos.routes";
import roteirosRouter from "./routes/roteiros.routes";
import authRouter from "./routes/auth.routes";

const app = express();

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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    servico: "NomadPlan-plus-backend",
  });
});

app.use("/auth", authRouter);
app.use("/pontos", pontosRouter);
app.use("/roteiros", roteirosRouter);

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