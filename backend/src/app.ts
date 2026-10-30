import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { RAIZ_UPLOADS } from "./lib/caminhos";
import pontosRouter from "./routes/pontos.routes";
import roteirosRouter from "./routes/roteiros.routes";
import authRouter from "./routes/auth.routes";
import sugestoesRouter from "./routes/sugestoes.routes";
import verificacoesRouter from "./routes/verificacoes.routes";
import avaliacoesRouter from "./routes/avaliacoes.routes";
import notificacoesRouter from "./routes/notificacoes.routes";
import adminRouter from "./routes/admin.routes";
import salvosRouter from "./routes/salvos.routes";
import convitesRouter from "./routes/convites.routes";

interface ErroComStatus {
  type?: string;
  status?: number;
}

/**
 * Monta a aplicação Express sem abrir porta. Separar isso do `listen` permite que
 * os testes de integração subam o app em uma porta aleatória.
 */
export function criarApp(): express.Express {
  const app = express();

  // Atrás de proxy reverso (Nginx, load balancer) o IP real do cliente vem do
  // X-Forwarded-For. Sem isso o rate limit por IP enxerga só o IP do proxy e
  // bloqueia todos os usuários juntos. Defina TRUST_PROXY com o número de proxies
  // confiáveis à frente da API (ex.: 1). Sem a variável, o comportamento não muda.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  app.use(helmet());

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  app.use(
    cors({
      origin: frontendUrl,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    }),
  );

  // Limite explícito do corpo JSON: também contém o custo de validar coleções grandes.
  app.use(express.json({ limit: "100kb" }));

  if (process.env.NODE_ENV !== "test") {
    app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  }

  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(RAIZ_UPLOADS),
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      servico: "nomadplan-api",
    });
  });

  app.use("/auth", authRouter);
  app.use("/pontos", pontosRouter);
  app.use("/roteiros", roteirosRouter);
  app.use("/sugestoes", sugestoesRouter);
  app.use("/verificacoes", verificacoesRouter);
  app.use("/avaliacoes", avaliacoesRouter);
  app.use("/notificacoes", notificacoesRouter);
  app.use("/salvos", salvosRouter);
  app.use("/convites", convitesRouter);
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
      const { type, status } = (error ?? {}) as ErroComStatus;

      // Erros do próprio parser de JSON são problema do cliente, não do servidor.
      if (type === "entity.parse.failed") {
        return res.status(400).json({ erro: "O corpo da requisição não é um JSON válido." });
      }

      if (type === "entity.too.large" || status === 413) {
        return res.status(413).json({ erro: "O corpo da requisição é grande demais." });
      }

      console.error("Erro não tratado:", error);

      return res.status(500).json({
        erro: "Erro interno do servidor.",
      });
    },
  );

  return app;
}
