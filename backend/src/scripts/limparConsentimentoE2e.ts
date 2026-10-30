import "./ambienteE2e";
import prisma from "../lib/prisma";

// Apoio dos testes de ponta a ponta: deixa uma conta sem consentimento registrado,
// simulando uma conta criada antes da Política de Privacidade.
// Uso: tsx src/scripts/limparConsentimentoE2e.ts <email>

async function main() {
  const email = process.argv[2];

  if (!email) {
    throw new Error("Informe o e-mail da conta.");
  }

  await prisma.usuario.update({ where: { email }, data: { consentimentoEm: null } });
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
