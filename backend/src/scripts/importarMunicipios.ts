import "dotenv/config";
import prisma from "../lib/prisma";
import { importarMunicipios, lerMunicipios } from "../lib/municipios";

// Uso: npm run municipios:importar
//
// Leva ao banco os municípios de prisma/dados/municipios.json (gerado por "npm run
// municipios:baixar"). Pode ser repetido: atualiza pelo código IBGE.

async function main() {
  const total = await importarMunicipios(lerMunicipios());

  console.log(`${total} municípios gravados.`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
