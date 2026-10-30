-- Planejamento da viagem: anotações e teto de gastos no roteiro, custo previsto em cada
-- parada (em centavos, para não usar ponto flutuante com dinheiro) e uma lista de tarefas.
ALTER TABLE "roteiro" ADD COLUMN "notas" TEXT;
ALTER TABLE "roteiro" ADD COLUMN "orcamento_centavos" INTEGER;
ALTER TABLE "item_roteiro" ADD COLUMN "custo_centavos" INTEGER;

CREATE TABLE "item_checklist" (
    "id" SERIAL NOT NULL,
    "id_roteiro" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "feito" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_checklist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "item_checklist_id_roteiro_idx" ON "item_checklist"("id_roteiro");

ALTER TABLE "item_checklist" ADD CONSTRAINT "item_checklist_id_roteiro_fkey"
    FOREIGN KEY ("id_roteiro") REFERENCES "roteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
