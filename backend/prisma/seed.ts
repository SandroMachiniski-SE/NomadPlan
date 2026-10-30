import "dotenv/config";
import { TipoConta } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { gerarHashSenha } from "../src/lib/auth";
import { lerDadosOsm } from "../src/lib/dadosOsm";
import { importarPontosOsm } from "../src/lib/importacaoOsm";
import { importarOverture, lerDadosOverture } from "../src/lib/importacaoOverture";
import { aplicarCuradoria, lerCuradoria } from "../src/lib/curadoria";
import { criarRoteiroDeExemplo } from "../src/lib/roteiroExemplo";

const SENHA_DEMONSTRACAO = "senha-temporaria";

async function main() {
  // O seed cria contas com senha conhecida: em produção seria uma porta aberta.
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed cria contas de demonstração com senha conhecida e não deve rodar em produção.");
  }

  const usuario = await prisma.usuario.upsert({
    where: {
      email: "admin@nomadplan.local",
    },
    update: {},
    create: {
      nome: "Administrador NomadPlan",
      email: "admin@nomadplan.local",
      // Login de demonstração: admin@nomadplan.local / senha-temporaria (troque em produção).
      senhaHash: await gerarHashSenha(SENHA_DEMONSTRACAO),
      tipoConta: TipoConta.ADMIN,
      cidadeBase: "Joinville",
      consentimentoEm: new Date(),
    },
  });

  await criarContasDeDemonstracao();

  // Pontos reais do OpenStreetMap (prisma/dados/osm/), baixados com "npm run osm:baixar".
  const cidades = lerDadosOsm();
  const resumo = await importarPontosOsm(cidades.flatMap((c) => c.pontos));
  // Overture Maps (prisma/dados/overture/): telefone e site que faltam e hospedagens.
  const overture = await importarOverture(lerDadosOverture());
  // Pontos conferidos pela equipe em fontes oficiais (prisma/dados/curadoria.json).
  const curadoria = await aplicarCuradoria(lerCuradoria());
  // Roteiro de demonstração no formato de caderno de viagem (vários dias e cidades, pernoites).
  const morador = await prisma.usuario.findUniqueOrThrow({ where: { email: "morador@nomadplan.local" } });
  await criarRoteiroDeExemplo(morador.id);

  console.log("Dados iniciais inseridos com sucesso.");
  console.log(
    `Pontos do OpenStreetMap (${cidades.map((c) => c.cidade).join(", ")}): ${resumo.criados} novos, ` +
      `${resumo.complementados + resumo.vinculados + resumo.semMudanca} já existiam.`,
  );
  console.log(
    `Overture Maps: ${overture.complementados} pontos complementados, ${overture.criados} hospedagens novas.`,
  );
  console.log(`Curadoria: ${curadoria.aplicados} pontos conferidos em fontes oficiais.`);
  console.log(`Login de demonstração: ${usuario.email} / ${SENHA_DEMONSTRACAO} (e moderador@, negocio@ e morador@nomadplan.local).`);
}

// Contas de cada papel para demonstrar o sistema.
async function criarContasDeDemonstracao() {
  const senhaHash = await gerarHashSenha(SENHA_DEMONSTRACAO);
  const contas = [
    { nome: "Moderador NomadPlan", email: "moderador@nomadplan.local", tipoConta: TipoConta.MODERADOR },
    { nome: "Negócio NomadPlan", email: "negocio@nomadplan.local", tipoConta: TipoConta.NEGOCIO },
    { nome: "Morador NomadPlan", email: "morador@nomadplan.local", tipoConta: TipoConta.MORADOR },
  ];

  for (const conta of contas) {
    await prisma.usuario.upsert({
      where: { email: conta.email },
      update: {},
      create: { ...conta, senhaHash, cidadeBase: "Joinville", consentimentoEm: new Date() },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });