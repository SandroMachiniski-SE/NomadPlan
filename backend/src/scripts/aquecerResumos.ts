import prisma from "../lib/prisma";
import { UFS } from "../lib/geocodificacao";
import { aquecerResumos } from "../lib/resumoOsm";

// Uso: npm run viagem:aquecer -- [UFs...] [--lote 8]
//   ex.: npm run viagem:aquecer -- SC PR RS SP RJ MG ES
//
// Busca de antemão, no Overpass, os hotéis e atrações das cidades das UFs (padrão: Sul e Sudeste),
// para a viagem de carro já sugerir pernoites com hotéis na primeira geração. Leva horas (o servidor
// público é lento e limita os pedidos): rode de madrugada. Pode ser interrompido e rodado de novo; o
// que já tem resumo válido (30 dias) é pulado.

const PADRAO = ["SC", "PR", "RS", "SP", "RJ", "MG", "ES"];

async function main() {
  const argumentos = process.argv.slice(2);
  const posicaoDoLote = argumentos.indexOf("--lote");
  const lote = posicaoDoLote >= 0 ? Number(argumentos[posicaoDoLote + 1]) : undefined;
  const ufs = argumentos
    .filter((a, i) => !a.startsWith("--") && i !== posicaoDoLote + 1)
    .map((a) => a.toUpperCase());
  const escolhidas = ufs.length > 0 ? ufs : PADRAO;
  const invalidas = escolhidas.filter((uf) => !(UFS as readonly string[]).includes(uf));

  if (invalidas.length > 0) throw new Error(`UF inválida: ${invalidas.join(", ")}.`);
  if (lote !== undefined && (!Number.isInteger(lote) || lote < 1 || lote > 20)) throw new Error("O lote vai de 1 a 20.");

  const inicio = Date.now();
  console.log(`Aquecendo os resumos de ${escolhidas.join(", ")}...`);

  const resultado = await aquecerResumos(escolhidas, {
    lote,
    aoAvancar: (mensagem) => console.log(`[${Math.round((Date.now() - inicio) / 60_000)} min] ${mensagem}`),
  });

  console.log(
    `Pronto: ${resultado.comResumo} de ${resultado.cidades} cidades com resumo` +
      (resultado.falhas > 0 ? `; ${resultado.falhas} falharam (rode de novo mais tarde para tentar só essas).` : "."),
  );
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
