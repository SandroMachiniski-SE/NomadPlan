import { Prisma, PontoTuristico } from "@prisma/client";
import { registrarVersaoPonto } from "./versionamento";

/**
 * Aplica ao ponto os campos de uma sugestão aceita. Guarda antes o estado anterior no
 * histórico de versões (RF26/RB09) e sobe o número da versão, tudo na mesma transação
 * do chamador.
 */
export async function aplicarCamposAoPonto(
  tx: Prisma.TransactionClient,
  ponto: PontoTuristico,
  campos: Record<string, unknown>,
  motivoDaVersao: string,
  idAutorDaAcao: number | null,
): Promise<void> {
  await registrarVersaoPonto(ponto, motivoDaVersao, idAutorDaAcao, tx);

  await tx.pontoTuristico.update({
    where: { id: ponto.id },
    data: {
      ...(campos as Prisma.PontoTuristicoUpdateInput),
      versao: { increment: 1 },
    },
  });
}
