import prisma from "../lib/prisma";
import { UFS } from "../lib/geocodificacao";
import { lerDestinos, prepararDestinos } from "../lib/destinos";

// Uso: npm run destinos:preparar -- [UFs...] [--min 30]
//   ex.: npm run destinos:preparar             (todos os destinos de prisma/dados/destinos.json)
//        npm run destinos:preparar -- RJ SP    (só os do Rio de Janeiro e de São Paulo)
//
// Prepara de antemão os destinos da lista (os da apresentação, as capitais e os principais destinos
// turísticos), um de cada vez, com o mesmo preparo de "Buscar outra cidade do Brasil". Pula quem já
// tem lugares (--min, padrão 30). Leva de minutos a horas, conforme o Overpass público: rode de
// madrugada. Pode ser interrompido e rodado de novo.

async function main() {
  const argumentos = process.argv.slice(2);
  const posicaoDoMinimo = argumentos.indexOf("--min");
  // O valor do --min não é UF (sem --min, nenhum argumento é pulado).
  const posicaoDoValor = posicaoDoMinimo >= 0 ? posicaoDoMinimo + 1 : -1;
  const minimoDePontos = posicaoDoMinimo >= 0 ? Number(argumentos[posicaoDoValor]) : undefined;
  const ufs = argumentos
    .filter((a, i) => !a.startsWith("--") && i !== posicaoDoValor)
    .map((a) => a.toUpperCase());
  const invalidas = ufs.filter((uf) => !(UFS as readonly string[]).includes(uf));

  if (invalidas.length > 0) throw new Error(`UF inválida: ${invalidas.join(", ")}.`);
  if (minimoDePontos !== undefined && (!Number.isInteger(minimoDePontos) || minimoDePontos < 1)) {
    throw new Error("O --min é um número inteiro de lugares (1 ou mais).");
  }

  const destinos = lerDestinos().filter((d) => ufs.length === 0 || ufs.includes(d.uf));
  const inicio = Date.now();

  console.log(`Preparando ${destinos.length} destinos...`);

  const resultado = await prepararDestinos(destinos, {
    minimoDePontos,
    aoAvancar: (mensagem) => console.log(`[${Math.round((Date.now() - inicio) / 60_000)} min] ${mensagem}`),
  });

  console.log(
    `Pronto: ${resultado.preparados} preparados, ${resultado.pulados} já tinham lugares` +
      (resultado.falhas.length > 0
        ? `; falharam: ${resultado.falhas.join(", ")} (rode de novo mais tarde para tentar só esses).`
        : "."),
  );
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
