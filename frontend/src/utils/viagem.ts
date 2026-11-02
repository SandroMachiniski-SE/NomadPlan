import type { MunicipioEscolhido } from "../services/cidades";
import type { DiaDoRoteiroGerado, RespostaRecomendacao } from "../types/roteiro";
import type {
  DecisaoDaPerna,
  EscolhaDaNoite,
  NoiteSalva,
  PedidoDeViagem,
  PernaPlanejada,
  TrechoDeEstrada,
  TrechoPlanejado,
} from "../types/viagem";

/** O que a pessoa preenche na caixa "Vou de carro saindo de casa" (números como digitados). */
export interface OpcoesViagemDeCarro {
  ativa: boolean;
  origem: MunicipioEscolhido | null;
  kmPorDia: string;
  horasPorDia: string;
  comVolta: boolean;
  consumo: string;
  preco: string;
}

/** Número digitado com vírgula ou ponto; vazio ou inválido vira null. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");

  if (!limpo) return null;

  const valor = Number(limpo);

  return Number.isFinite(valor) ? valor : null;
}

/** O bloco `viagemDeCarro` do pedido ao gerador; undefined quando a caixa está desmarcada. */
export function pedidoDaViagem(
  opcoes: OpcoesViagemDeCarro,
  escolhas: EscolhaDaNoite[],
  decisoes: DecisaoDaPerna[],
): PedidoDeViagem | undefined {
  if (!opcoes.ativa) return undefined;

  const kmPorDia = lerNumero(opcoes.kmPorDia);
  const horasPorDia = lerNumero(opcoes.horasPorDia);
  const consumo = lerNumero(opcoes.consumo);
  const preco = lerNumero(opcoes.preco);

  return {
    ...(opcoes.origem ? { origem: opcoes.origem.codigoIbge } : {}),
    ...(kmPorDia !== null ? { kmPorDia } : {}),
    ...(horasPorDia !== null ? { horasPorDia } : {}),
    comVolta: opcoes.comVolta,
    ...(consumo !== null ? { consumoKmPorLitro: consumo } : {}),
    ...(preco !== null ? { precoLitroCentavos: Math.round(preco * 100) } : {}),
    escolhas,
    decisoes,
  };
}

export const chaveDaNoite = (perna: number, noite: number) => `${perna}-${noite}`;

export interface TrechoDoDia {
  perna: PernaPlanejada;
  trecho: TrechoPlanejado;
}

export interface DiaDaViagem {
  dia: number;
  /** ESTRADA: dia só de estrada; CIDADE: dia de passeio (pode começar ou terminar com estrada). */
  tipo: "ESTRADA" | "CIDADE";
  trechos: TrechoDoDia[];
  diaGerado: DiaDoRoteiroGerado | null;
}

/** Todos os dias da viagem, na ordem: os de estrada e os nas cidades. */
export function diasDaViagem(resposta: RespostaRecomendacao): DiaDaViagem[] {
  const trechos = (resposta.viagemDeCarro?.pernas ?? []).flatMap((perna) => perna.trechos.map((trecho) => ({ perna, trecho })));
  const ultimoDia = Math.max(0, ...resposta.dias.map((d) => d.dia), ...trechos.map((t) => t.trecho.dia));

  return Array.from({ length: ultimoDia }, (_, i) => {
    const dia = i + 1;
    const diaGerado = resposta.dias.find((d) => d.dia === dia) ?? null;

    return {
      dia,
      tipo: diaGerado ? ("CIDADE" as const) : ("ESTRADA" as const),
      trechos: trechos.filter((t) => t.trecho.dia === dia),
      diaGerado,
    };
  }).filter((d) => d.diaGerado || d.trechos.length > 0);
}

/** As noites de estrada como a pessoa as vê agora, com o hotel escolhido em cada uma. */
export function noitesParaSalvar(resposta: RespostaRecomendacao, hoteis: Map<string, string>): NoiteSalva[] {
  return (resposta.viagemDeCarro?.pernas ?? []).flatMap((perna) =>
    perna.trechos.flatMap((t) => {
      if (t.noite === null) return [];

      const idOsm = hoteis.get(chaveDaNoite(perna.perna, t.noite));

      return [{ perna: perna.perna, noite: t.noite, codigoIbge: t.pernoite?.codigoIbge ?? null, ...(idOsm ? { idOsm } : {}) }];
    }),
  );
}

/** Tempo de direção ("~6h10"), sem segundos. */
export function formatarDirecao(segundos: number): string {
  const minutos = Math.round(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  return horas === 0 ? `~${resto} min` : `~${horas}h${String(resto).padStart(2, "0")}`;
}

export const formatarKm = (metros: number) => `${Math.round(metros / 1000).toLocaleString("pt-BR")} km`;

/** A estrada de cada dia para o mapa do roteiro salvo, com o pernoite no fim das noites de estrada. */
export function estradasNoMapa(trechos: TrechoDeEstrada[] | undefined) {
  return (trechos ?? []).map((t) => ({ dia: t.dia, tracado: t.tracado, pernoite: t.noite !== null ? t.para : null }));
}

/** Último dia com trecho de estrada (um dia só de estrada pode não ter nenhuma parada). */
export const ultimoDiaDeEstrada = (trechos: TrechoDeEstrada[] | undefined) =>
  Math.max(1, ...(trechos ?? []).map((t) => t.dia));
