import { defineConfig } from "@playwright/test";
import { urlDoBancoE2e } from "../backend/src/scripts/ambienteE2e";

// Os testes sobem a própria API e o próprio frontend em portas dedicadas, apontando para
// um banco de dados exclusivo (nomadplan_e2e): não interferem no sistema de desenvolvimento.
const PORTA_API = 3350;
const PORTA_WEB = 5190;
const emCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./testes",
  // As contas e pontos compartilham um mesmo banco: os arquivos rodam em sequência.
  workers: 1,
  fullyParallel: false,
  forbidOnly: emCI,
  retries: emCI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: emCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./suporte/preparar.ts",
  use: {
    baseURL: `http://localhost:${PORTA_WEB}`,
    // No computador usa o Edge já instalado; no CI, o Chromium baixado pelo Playwright.
    channel: emCI ? undefined : "msedge",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npx tsx src/server.ts",
      cwd: "../backend",
      url: `http://localhost:${PORTA_API}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(PORTA_API),
        DATABASE_URL: urlDoBancoE2e(),
        FRONTEND_URL: `http://localhost:${PORTA_WEB}`,
        JWT_SECRET: "segredo-de-e2e-apenas-para-testes-automatizados",
        JWT_EXPIRES_IN: "1d",
        RATE_LIMIT_OFF: "1",
        METRICAS_INTERVALO_MS: "500",
        SMTP_HOST: "",
      },
    },
    {
      command: `npx vite --port ${PORTA_WEB} --strictPort`,
      cwd: "../frontend",
      url: `http://localhost:${PORTA_WEB}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: `http://localhost:${PORTA_API}` },
    },
  ],
});
