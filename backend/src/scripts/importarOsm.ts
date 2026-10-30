import "dotenv/config";
import { OrigemRegistro } from "@prisma/client";
import prisma from "../lib/prisma";
import { registrarAuditoria } from "../lib/auditoria";
import { lerDadosOsm } from "../lib/dadosOsm";
import { importarPontosOsm } from "../lib/importacaoOsm";

// Uso: npm run osm:importar [-- arquivo.json ...] [--remover-ficticios]
//
// Leva ao banco os pontos baixados com "npm run osm:baixar" (por padrão, todos os arquivos
// de prisma/dados/osm/). Pode ser repetido: o que já foi importado não é duplicado, e nos
// pontos existentes só é preenchido o que estiver vazio.
//
// --remover-ficticios apaga antes os pontos de exemplo que versões antigas do seed criavam
// ("Natureza Joinville #1"...), exceto os que estiverem em algum roteiro.

const CATEGORIAS_FICTICIAS = "Natureza|Cultura|Gastronomia|Hospedagem|Aventura|Compras|Religioso";
const CIDADES_FICTICIAS = "Joinville|Florianópolis|Blumenau";

// Os três pontos escritos à mão no seed antigo tinham nome real, mas horário e
// acessibilidade inventados.
const PONTOS_ESCRITOS_NO_SEED_ANTIGO = [
  { nome: "Mirante de Joinville", descricao: "Ponto turístico com vista panorâmica da cidade." },
  {
    nome: "Museu Nacional de Imigração e Colonização",
    descricao: "Espaço histórico e cultural dedicado à imigração em Joinville.",
  },
  { nome: "Parque Zoobotânico", descricao: "Área verde para lazer, caminhada e contato com a natureza." },
];

async function removerPontosFicticios() {
  const gerados = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM ponto_turistico
    WHERE nome ~ ${`^(${CATEGORIAS_FICTICIAS}) (${CIDADES_FICTICIAS}) #[0-9]+$`}
      AND descricao LIKE '%gerado para testes de busca%'
      AND id_osm IS NULL
  `;
  const escritos = await prisma.pontoTuristico.findMany({
    where: {
      cidade: "Joinville",
      idOsm: null,
      origem: OrigemRegistro.USUARIO,
      OR: PONTOS_ESCRITOS_NO_SEED_ANTIGO,
    },
    select: { id: true },
  });
  const ids = [...gerados, ...escritos].map((p) => p.id);

  const { count } = await prisma.pontoTuristico.deleteMany({
    where: { id: { in: ids }, itensRoteiro: { none: {} } },
  });

  console.log(`Pontos fictícios removidos: ${count}.`);

  if (count < ids.length) {
    console.log(`Mantidos ${ids.length - count} que estão em roteiros (remova-os dos roteiros e rode de novo).`);
  }

  return count;
}

async function main() {
  const argumentos = process.argv.slice(2);
  const removerFicticios = argumentos.includes("--remover-ficticios");
  const arquivos = argumentos.filter((a) => !a.startsWith("--"));

  const cidades = lerDadosOsm(arquivos);

  if (cidades.length === 0) {
    throw new Error('Nenhum arquivo de dados encontrado. Rode antes "npm run osm:baixar -- <cidade>".');
  }

  const removidos = removerFicticios ? await removerPontosFicticios() : 0;
  const pontos = cidades.flatMap((c) => c.pontos);
  const resumo = await importarPontosOsm(pontos);

  await registrarAuditoria({
    idUsuario: null,
    acao: "importar_osm",
    entidade: "ponto_turistico",
    detalhes: {
      cidades: cidades.map((c) => ({ cidade: c.cidade, uf: c.uf, baixadoEm: c.baixadoEm, pontos: c.pontos.length })),
      ...resumo,
      ficticiosRemovidos: removidos,
    },
  });

  for (const c of cidades) {
    console.log(`${c.cidade}/${c.uf}: ${c.pontos.length} pontos no arquivo (baixado em ${new Date(c.baixadoEm).toLocaleDateString("pt-BR")}).`);
  }

  console.log(
    `Criados: ${resumo.criados}. Complementados: ${resumo.complementados}. ` +
      `Vinculados a pontos já cadastrados: ${resumo.vinculados}. Sem mudança: ${resumo.semMudanca}. ` +
      `Ignorados (rejeitados pela moderação): ${resumo.ignorados}.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
