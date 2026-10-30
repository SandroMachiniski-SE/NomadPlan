import "dotenv/config";
import prisma from "../lib/prisma";
import { registrarAuditoria } from "../lib/auditoria";
import { aplicarCuradoria, lerCuradoria } from "../lib/curadoria";

// Uso: npm run curadoria:aplicar
//
// Aplica prisma/dados/curadoria.json: dados conferidos pela equipe em fontes oficiais. Rode depois
// das importações (osm:importar, overture:importar). Pode ser repetido.

async function main() {
  const itens = lerCuradoria();
  const resumo = await aplicarCuradoria(itens);

  await registrarAuditoria({
    idUsuario: null,
    acao: "aplicar_curadoria",
    entidade: "ponto_turistico",
    detalhes: { itens: itens.length, ...resumo },
  });

  console.log(`Curadoria: ${resumo.aplicados} pontos atualizados, ${resumo.semMudanca} já estavam em dia.`);

  if (resumo.naoEncontrados.length > 0) {
    console.log(`Não encontrados no banco: ${resumo.naoEncontrados.join("; ")}.`);
  }
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
