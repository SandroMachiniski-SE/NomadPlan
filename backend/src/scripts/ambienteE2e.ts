import path from "path";
import dotenv from "dotenv";

// O Playwright carrega este módulo a partir da pasta e2e/, então o .env do backend é
// buscado pelo caminho (no CI não há .env: as variáveis já vêm do ambiente).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Banco usado pelos testes de ponta a ponta (Playwright): fica separado do banco de
 * desenvolvimento e do banco dos testes de integração (que se apaga a cada execução).
 * Importe este módulo ANTES de qualquer outro que use o Prisma.
 */
export function urlDoBancoE2e(): string {
  if (process.env.E2E_DATABASE_URL) {
    return process.env.E2E_DATABASE_URL;
  }

  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error("Defina DATABASE_URL (ou E2E_DATABASE_URL) para rodar os testes de ponta a ponta.");
  }

  const url = new URL(base);
  const nome = url.pathname.replace(/^\//, "").replace(/_(teste|e2e)$/, "");

  url.pathname = `/${nome}_e2e`;

  return url.toString();
}

process.env.DATABASE_URL = urlDoBancoE2e();
