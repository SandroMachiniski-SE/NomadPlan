import { execSync } from "child_process";
import { urlDoBancoDeTeste } from "../testes/urlBanco";
import { PrismaClient } from "@prisma/client";

// Cria o banco de testes (se ainda não existir) e aplica todas as migrations nele.
// Uso: npm run test:preparar  (é chamado automaticamente por npm run test:integracao)

async function main() {
  const urlTeste = new URL(urlDoBancoDeTeste());
  const nomeTeste = urlTeste.pathname.replace(/^\//, "");

  // Conecta ao banco "postgres" do mesmo servidor só para poder criar o banco de testes.
  const urlAdmin = new URL(urlTeste.toString());
  urlAdmin.pathname = "/postgres";

  const admin = new PrismaClient({ datasources: { db: { url: urlAdmin.toString() } } });

  try {
    const existe = await admin.$queryRawUnsafe<{ existe: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${nomeTeste.replace(/'/g, "''")}') AS existe`,
    );

    if (!existe[0]?.existe) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${nomeTeste.replace(/"/g, '""')}"`);
      console.log(`Banco de testes "${nomeTeste}" criado.`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    env: { ...process.env, DATABASE_URL: urlTeste.toString() },
  });
}

main().catch((erro) => {
  console.error("Falha ao preparar o banco de testes:", erro);
  process.exit(1);
});
