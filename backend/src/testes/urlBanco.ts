import "dotenv/config";

export function urlDoBancoDeTeste(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error("Defina DATABASE_URL (ou TEST_DATABASE_URL) para rodar os testes de integração.");
  }

  const url = new URL(base);
  const nome = url.pathname.replace(/^\//, "");

  if (!nome.endsWith("_teste")) {
    url.pathname = `/${nome}_teste`;
  }

  return url.toString();
}
