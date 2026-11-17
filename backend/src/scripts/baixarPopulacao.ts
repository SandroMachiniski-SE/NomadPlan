import fs from "fs";
import { buscarJson } from "../lib/baixarCidade";
import { ARQUIVO_POPULACAO, lerMunicipios } from "../lib/municipios";

// Uso: npm run municipios:populacao
//
// Baixa a população estimada de todos os municípios (IBGE, tabela 6579, a estimativa mais recente)
// e grava prisma/dados/populacao.json. Depois, "npm run municipios:importar" leva ao banco.

const URL_DO_IBGE =
  "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6%5Ball%5D";

interface RespostaDoIbge {
  resultados: { series: { localidade: { id: string }; serie: Record<string, string> }[] }[];
}

async function main() {
  const [variavel] = await buscarJson<RespostaDoIbge[]>(URL_DO_IBGE);
  const series = variavel.resultados[0].series;
  const ano = Object.keys(series[0].serie)[0];
  const populacao: Record<string, number> = {};

  for (const { localidade, serie } of series) {
    const valor = Number(serie[ano]);

    if (Number.isInteger(valor) && valor > 0) populacao[localidade.id] = valor;
  }

  const semPopulacao = lerMunicipios().filter((m) => populacao[String(m.codigoIbge)] === undefined);

  // Um ou outro município novo pode faltar na estimativa; muitos faltando é sinal de resposta errada.
  if (semPopulacao.length > 20) {
    throw new Error(`${semPopulacao.length} municípios ficaram sem população; arquivo não gravado.`);
  }

  const conteudo = { fonte: "IBGE, estimativas da população (tabela 6579)", ano, populacao };

  fs.writeFileSync(ARQUIVO_POPULACAO, `${JSON.stringify(conteudo)}\n`, "utf8");
  console.log(
    `População de ${Object.keys(populacao).length} municípios (${ano}) gravada em prisma/dados/populacao.json.` +
      (semPopulacao.length ? ` Sem estimativa: ${semPopulacao.map((m) => `${m.cidade}/${m.uf}`).join(", ")}.` : ""),
  );
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
