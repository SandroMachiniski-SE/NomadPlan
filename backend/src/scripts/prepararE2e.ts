import "./ambienteE2e";
import { execSync } from "child_process";
import bcrypt from "bcryptjs";
import { PrismaClient, StatusPonto } from "@prisma/client";
import prisma from "../lib/prisma";
import { urlDoBancoE2e } from "./ambienteE2e";
import { CONTAS_E2E, SENHA_E2E } from "./contasE2e";

// Deixa o banco de ponta a ponta pronto: cria o banco (se preciso), aplica as migrations e
// recarrega os dados de partida. Roda antes de cada execução do Playwright.
// Uso: npm run e2e:preparar

const TABELAS_PRESERVADAS = new Set(["_prisma_migrations", "spatial_ref_sys"]);

async function criarBancoSeNecessario(): Promise<void> {
  const url = new URL(urlDoBancoE2e());
  const nome = url.pathname.replace(/^\//, "");

  const urlAdmin = new URL(url.toString());
  urlAdmin.pathname = "/postgres";

  const admin = new PrismaClient({ datasources: { db: { url: urlAdmin.toString() } } });

  try {
    const existe = await admin.$queryRawUnsafe<{ existe: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${nome.replace(/'/g, "''")}') AS existe`,
    );

    if (!existe[0]?.existe) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${nome.replace(/"/g, '""')}"`);
      console.log(`Banco de ponta a ponta "${nome}" criado.`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}

async function recarregarDados(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  const alvo = tabelas
    .map((t) => t.tablename)
    .filter((nome) => !TABELAS_PRESERVADAS.has(nome))
    .map((nome) => `"${nome}"`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${alvo.join(", ")} RESTART IDENTITY CASCADE`);

  const senhaHash = await bcrypt.hash(SENHA_E2E, 4);

  for (const conta of Object.values(CONTAS_E2E)) {
    await prisma.usuario.create({
      data: { ...conta, senhaHash, consentimentoEm: new Date() },
    });
  }

  const responsavel = await prisma.usuario.findUniqueOrThrow({ where: { email: CONTAS_E2E.negocio.email } });

  const pontos = [
    {
      nome: "Museu Nacional da Imigração E2E",
      categoria: "Cultura",
      cidade: "Joinville",
      latitude: -26.3045,
      longitude: -48.8487,
      acessibilidade: "Rampa e elevador",
      faixaPreco: "Gratuito",
      descricao: "Museu de teste com acervo sobre a história local.",
      seloVerificado: true,
    },
    {
      nome: "Parque da Cidade E2E",
      categoria: "Natureza",
      cidade: "Joinville",
      latitude: -26.3011,
      longitude: -48.8402,
      faixaPreco: "Gratuito",
      descricao: "Parque de teste com trilhas e lago.",
    },
    {
      nome: "Restaurante Sabor Local E2E",
      categoria: "Gastronomia",
      cidade: "Joinville",
      latitude: -26.3079,
      longitude: -48.8451,
      faixaPreco: "$$",
      descricao: "Restaurante de teste com culinária regional.",
    },
    {
      nome: "Mirante do Vale E2E",
      categoria: "Aventura",
      cidade: "Blumenau",
      latitude: -26.9194,
      longitude: -49.0661,
      faixaPreco: "Gratuito",
      descricao: "Mirante de teste em outra cidade.",
    },
  ];

  for (const ponto of pontos) {
    await prisma.pontoTuristico.create({
      data: {
        ...ponto,
        horarioFuncionamento: "Todos os dias, 24h",
        status: StatusPonto.PUBLICADO,
        idResponsavel: responsavel.id,
      },
    });
  }
}

async function main() {
  await criarBancoSeNecessario();
  await recarregarDados();
  console.log("Banco de ponta a ponta pronto.");
}

// Só executa quando chamado direto (o módulo também é importado para ler as contas).
if (require.main === module) {
  main()
    .catch((erro) => {
      console.error("Falha ao preparar o banco de ponta a ponta:", erro);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
