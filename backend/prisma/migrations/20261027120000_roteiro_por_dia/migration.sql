-- Roteiro por dia: cada parada passa a pertencer a um dia (1, 2, 3...). Os roteiros
-- existentes ficam inteiros no dia 1, o que preserva a ordem atual.
ALTER TABLE "item_roteiro" ADD COLUMN "dia" INTEGER NOT NULL DEFAULT 1;
