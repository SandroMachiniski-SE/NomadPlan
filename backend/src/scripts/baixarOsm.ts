import fs from "fs";
import path from "path";
import { baixarDadosDaCidade } from "../lib/baixarCidade";
import { nomeDoArquivo, PASTA_DADOS_OSM } from "../lib/dadosOsm";

// Uso: npm run osm:baixar -- Joinville Florianópolis Blumenau [--uf SC]
//
// Baixa do OpenStreetMap (Overpass API) os lugares de interesse turístico de cada cidade,
// busca no Wikidata/Wikimedia Commons a foto (com autor e licença) e a descrição dos que
// têm, e grava o resultado em prisma/dados/osm/<cidade>.json. Para levar ao banco, rode
// depois "npm run osm:importar".
//
// Os servidores são públicos e mantidos por voluntários: o script se identifica (User-Agent),
// faz uma consulta por cidade e espera entre elas. OVERPASS_URL troca o servidor (há
// espelhos, como https://overpass.kumi.systems/api/interpreter).

const ESPERA_ENTRE_CIDADES_MS = 5000;

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

function lerArgumentos(argv: string[]) {
  const cidades: string[] = [];
  let uf = "SC";

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--uf") {
      uf = (argv[i + 1] ?? "").toUpperCase();
      i += 1;
    } else {
      cidades.push(argv[i]);
    }
  }

  if (cidades.length === 0 || !/^[A-Z]{2}$/.test(uf)) {
    throw new Error('Uso: npm run osm:baixar -- Joinville "Balneário Camboriú" [--uf SC]');
  }

  return { cidades, uf };
}

async function main() {
  const { cidades, uf } = lerArgumentos(process.argv.slice(2));

  fs.mkdirSync(PASTA_DADOS_OSM, { recursive: true });

  for (const [indice, cidade] of cidades.entries()) {
    if (indice > 0) await esperar(ESPERA_ENTRE_CIDADES_MS);

    console.log(`${cidade}/${uf}: consultando o OpenStreetMap...`);

    const baixada = await baixarDadosDaCidade(cidade, uf);

    if (!baixada) {
      console.warn(`  Nenhum lugar encontrado. Confira o nome da cidade (com acentos) e a UF.`);
      continue;
    }

    const { dados, elementosLidos } = baixada;
    const { pontos } = dados;
    const arquivo = path.join(PASTA_DADOS_OSM, nomeDoArquivo(cidade));

    fs.writeFileSync(arquivo, `${JSON.stringify(dados, null, 2)}\n`, "utf8");

    const porCategoria = pontos.reduce<Record<string, number>>((contagem, p) => {
      contagem[p.categoria] = (contagem[p.categoria] ?? 0) + 1;
      return contagem;
    }, {});
    const comHorario = pontos.filter((p) => p.horarioFuncionamento).length;
    const comFoto = pontos.filter((p) => p.imagemUrl).length;

    console.log(`  ${pontos.length} pontos (${elementosLidos} elementos lidos) → ${path.relative(process.cwd(), arquivo)}`);
    console.log(`  por categoria: ${JSON.stringify(porCategoria)}`);
    console.log(`  com horário: ${comHorario}; com foto: ${comFoto}`);
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
