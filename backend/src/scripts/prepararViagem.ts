import "dotenv/config";
import prisma from "../lib/prisma";
import { procurarMunicipio, type Municipio } from "../lib/municipios";
import { KM_POR_DIA_PADRAO, planejarViagemDeCarro } from "../lib/viagemDeCarro";

// Uso: npm run viagem:preparar -- "Joinville/SC" "Brasília/DF" [--km 500]
//
// Deixa uma viagem de carro pronta no banco antes de uma apresentação: busca as rotas de ida e de
// volta no OSRM e os resumos (hospedagens e atrações) das cidades das faixas de pernoite no
// Overpass, esperando bem mais que a tela (os servidores públicos às vezes levam quase um minuto).
// Depois disso a geração usa só o cache: rotas valem 90 dias e resumos, 30.

const TEMPO_LIMITE_DOS_RESUMOS_MS = 175_000;

function lerArgumentos(argv: string[]) {
  const cidades: string[] = [];
  let km = KM_POR_DIA_PADRAO;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--km") {
      km = Number(argv[i + 1]);
      i += 1;
    } else {
      cidades.push(argv[i]);
    }
  }

  if (cidades.length !== 2 || !Number.isFinite(km) || km < 150 || km > 1000) {
    throw new Error('Uso: npm run viagem:preparar -- "Joinville/SC" "Brasília/DF" [--km 500]');
  }

  return { origem: cidades[0], destino: cidades[1], km };
}

async function municipio(texto: string): Promise<Municipio> {
  const achados = await procurarMunicipio(texto);

  if (achados.length !== 1) {
    throw new Error(
      achados.length === 0 ? `Não encontrei o município ${texto}.` : `Mais de um município ${texto}: informe a UF ("Cidade/UF").`,
    );
  }

  return achados[0];
}

async function main() {
  const argumentos = lerArgumentos(process.argv.slice(2));
  const origem = await municipio(argumentos.origem);
  const destino = await municipio(argumentos.destino);
  const inicio = Date.now();

  console.log(`${origem.cidade}/${origem.uf} → ${destino.cidade}/${destino.uf}, ida e volta, ${argumentos.km} km por dia...`);

  const plano = await planejarViagemDeCarro(
    {
      origem,
      etapas: [{ ...destino, dias: 1 }],
      kmPorDia: argumentos.km,
      horasPorDia: null,
      comVolta: true,
      horasDisponiveis: 6,
      consumoKmPorLitro: null,
      precoLitroCentavos: null,
      escolhas: [],
      decisoes: [],
    },
    { tempoLimiteDosResumosMs: TEMPO_LIMITE_DOS_RESUMOS_MS },
  );

  for (const perna of plano.pernas) {
    console.log(`  ${perna.de.cidade} → ${perna.para.cidade}: ${Math.round(perna.metros / 1000)} km`);

    for (const t of perna.trechos.filter((x) => x.noite !== null)) {
      const p = t.pernoite!;
      const contagem = p.totalHospedagens === null ? "sem contagem" : `${p.totalHospedagens} hospedagens, ${p.totalAtracoes} atrações`;

      console.log(`    noite ${t.noite}: ${p.cidade}${p.uf ? `/${p.uf}` : ""} (km ${Math.round(p.km)}; ${contagem}; ${t.alternativas.length} alternativas)`);
    }
  }

  for (const aviso of plano.avisos) console.log(`  aviso: ${aviso}`);
  console.log(`Pronto em ${Math.round((Date.now() - inicio) / 1000)} s.`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
