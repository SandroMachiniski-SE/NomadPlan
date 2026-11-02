import "dotenv/config";
import prisma from "../lib/prisma";
import { registrarAuditoria } from "../lib/auditoria";
import { importarOverture, lerDadosOverture } from "../lib/importacaoOverture";

// Uso: npm run overture:importar [-- arquivo.json ...]
//
// Leva ao banco o que foi baixado com "python scripts/dados/baixar_overture.py" (por padrão,
// todos os arquivos de prisma/dados/overture/). Rode depois de importar o OpenStreetMap: o
// Overture completa os pontos que já existem. Pode ser repetido sem duplicar nada.

async function main() {
  const cidades = lerDadosOverture(process.argv.slice(2).filter((a) => !a.startsWith("--")));

  if (cidades.length === 0) {
    throw new Error('Nenhum arquivo encontrado. Rode antes "python scripts/dados/baixar_overture.py <cidade>".');
  }

  const resumo = await importarOverture(cidades);

  await registrarAuditoria({
    idUsuario: null,
    acao: "importar_overture",
    entidade: "ponto_turistico",
    detalhes: { cidades: cidades.map((c) => ({ cidade: c.cidade, lugares: c.lugares.length })), ...resumo },
  });

  for (const c of cidades) {
    console.log(`${c.cidade}: ${c.lugares.length} lugares no arquivo (baixado em ${new Date(c.baixadoEm).toLocaleDateString("pt-BR")}).`);
  }

  console.log(
    `Pontos complementados com telefone ou site: ${resumo.complementados}. ` +
      `Vinculados sem mudança: ${resumo.vinculados}. Hospedagens novas: ${resumo.criados}.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
