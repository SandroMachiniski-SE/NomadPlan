import fs from "fs";
import { buscarJson } from "../lib/baixarCidade";
import { ARQUIVO_MUNICIPIOS, converterMunicipiosDoIbge } from "../lib/municipios";

// Uso: npm run municipios:baixar
//
// Baixa a lista de municípios do Brasil com as coordenadas da sede e grava
// prisma/dados/municipios.json. Fonte: github.com/kelvins/municipios-brasileiros (licença MIT),
// compilada a partir dos dados do IBGE. Depois, "npm run municipios:importar" leva ao banco.

const BASE = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json";
// 5.568 municípios + Distrito Federal + Fernando de Noronha + Boa Esperança do Norte (MT, o mais novo).
const TOTAL_DE_MUNICIPIOS = 5571;

async function main() {
  const [municipios, estados] = await Promise.all([
    buscarJson<Parameters<typeof converterMunicipiosDoIbge>[0]>(`${BASE}/municipios.json`),
    buscarJson<Parameters<typeof converterMunicipiosDoIbge>[1]>(`${BASE}/estados.json`),
  ]);

  const lista = converterMunicipiosDoIbge(municipios, estados).sort((a, b) => a.codigoIbge - b.codigoIbge);

  if (lista.length !== TOTAL_DE_MUNICIPIOS) {
    throw new Error(`Esperava ${TOTAL_DE_MUNICIPIOS} municípios e vieram ${lista.length}; arquivo não gravado.`);
  }

  fs.writeFileSync(ARQUIVO_MUNICIPIOS, `${JSON.stringify(lista, null, 1)}\n`, "utf8");
  console.log(`${lista.length} municípios gravados em prisma/dados/municipios.json.`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
