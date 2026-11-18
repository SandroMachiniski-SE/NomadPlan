import fs from "fs";
import path from "path";
import { baixarEImportarCidade, pontosDaCidade } from "./cidadesSobDemanda";
import { procurarMunicipio } from "./municipios";

// Destinos preparados de antemão (os da apresentação, as capitais e os principais destinos
// turísticos): quem escolhe um deles encontra os lugares prontos, sem depender do Overpass público
// naquele momento. A lista fica em prisma/dados/destinos.json; "npm run destinos:preparar" prepara.

export const ARQUIVO_DESTINOS = path.resolve(process.cwd(), "prisma", "dados", "destinos.json");

// Abaixo disso a cidade só tem o que a comunidade cadastrou: vale baixar do OpenStreetMap.
const MINIMO_DE_PONTOS = 30;
const TENTATIVAS = 3;
// O Overpass público recusa (429) ou cai (502/504) quando está cheio: espera antes de tentar de novo.
const PAUSA_DEPOIS_DE_FALHA_MS = 60_000;
const PAUSA_ENTRE_CIDADES_MS = 5_000;

export interface Destino {
  cidade: string;
  uf: string;
}

export function lerDestinos(arquivo = ARQUIVO_DESTINOS): Destino[] {
  return (JSON.parse(fs.readFileSync(arquivo, "utf8")) as { destinos: Destino[] }).destinos;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Prepara os destinos um de cada vez, na ordem da lista. Pula os que já têm lugares; um que falha é
 * tentado de novo depois de uma pausa e, sem sucesso, fica para a próxima vez (é só rodar de novo).
 */
export async function prepararDestinos(
  destinos: Destino[],
  opcoes: {
    minimoDePontos?: number;
    pausaDepoisDeFalhaMs?: number;
    pausaEntreCidadesMs?: number;
    aoAvancar?: (mensagem: string) => void;
  } = {},
): Promise<{ preparados: number; pulados: number; falhas: string[] }> {
  const minimo = opcoes.minimoDePontos ?? MINIMO_DE_PONTOS;
  const pausaDepoisDeFalha = opcoes.pausaDepoisDeFalhaMs ?? PAUSA_DEPOIS_DE_FALHA_MS;
  const pausaEntreCidades = opcoes.pausaEntreCidadesMs ?? PAUSA_ENTRE_CIDADES_MS;
  const avisar = opcoes.aoAvancar ?? (() => undefined);
  const resultado = { preparados: 0, pulados: 0, falhas: [] as string[] };

  for (const [indice, destino] of destinos.entries()) {
    const nome = `${destino.cidade}/${destino.uf}`;
    const posicao = `${indice + 1} de ${destinos.length}`;
    const [municipio] = await procurarMunicipio(nome);

    if (!municipio) {
      resultado.falhas.push(nome);
      avisar(`${posicao} ${nome}: não está entre os municípios do IBGE no banco.`);
      continue;
    }

    const existentes = await pontosDaCidade(municipio.cidade, municipio.latitude, municipio.longitude);

    if (existentes >= minimo) {
      resultado.pulados += 1;
      avisar(`${posicao} ${nome}: já tem ${existentes} lugares.`);
      continue;
    }

    let preparado = false;

    for (let tentativa = 1; tentativa <= TENTATIVAS && !preparado; tentativa += 1) {
      const inicio = Date.now();

      try {
        const importada = await baixarEImportarCidade(municipio.cidade, municipio.uf);

        if (!importada) {
          avisar(`${posicao} ${nome}: o OpenStreetMap não tem lugares cadastrados.`);
          break;
        }

        preparado = true;
        avisar(`${posicao} ${nome}: ${importada.pontosNoArquivo} lugares em ${Math.round((Date.now() - inicio) / 1000)} s.`);
      } catch (erro) {
        avisar(`${posicao} ${nome}: falhou na tentativa ${tentativa} (${erro instanceof Error ? erro.message : erro}).`);

        if (tentativa < TENTATIVAS) await esperar(pausaDepoisDeFalha);
      }
    }

    if (preparado) resultado.preparados += 1;
    else resultado.falhas.push(nome);

    if (pausaEntreCidades > 0 && indice < destinos.length - 1) await esperar(pausaEntreCidades);
  }

  return resultado;
}
