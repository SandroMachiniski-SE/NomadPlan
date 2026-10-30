import "dotenv/config";
import prisma from "../lib/prisma";
import { criarRoteiroDeExemplo, NOME_DO_ROTEIRO_EXEMPLO } from "../lib/roteiroExemplo";

// Uso: npm run roteiro:exemplo [-- email@da.conta]
//
// Cria o roteiro de demonstração "caderno de viagem" (vários dias e cidades, atividades livres,
// trilha com acampamento e pernoites) para a conta informada; padrão: morador@nomadplan.local.
// O seed já cria esse roteiro; este comando serve para bancos que já existiam.

async function main() {
  const email = process.argv[2] ?? "morador@nomadplan.local";
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario) {
    throw new Error(`Conta ${email} não encontrada.`);
  }

  const { criado, semPonto } = await criarRoteiroDeExemplo(usuario.id);

  console.log(criado ? `Roteiro "${NOME_DO_ROTEIRO_EXEMPLO}" criado para ${email}.` : `${email} já tem esse roteiro.`);

  if (semPonto.length > 0) {
    console.log(`Viraram atividade livre (ponto não encontrado): ${semPonto.join("; ")}.`);
  }
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
