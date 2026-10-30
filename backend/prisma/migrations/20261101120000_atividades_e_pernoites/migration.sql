-- Roteiro como um caderno de viagem: além dos pontos cadastrados, atividades livres ("Rolê pelo
-- centro", "Dia livre", "Volta do acampamento"), o período do dia de cada parada e onde se dorme
-- em cada noite (um hotel do banco ou um texto, como "Acampamento na serra").
CREATE TYPE "PeriodoDoDia" AS ENUM ('MANHA', 'TARDE', 'NOITE', 'DIA_INTEIRO');

ALTER TABLE "item_roteiro"
    ALTER COLUMN "id_ponto" DROP NOT NULL,
    ADD COLUMN "titulo" TEXT,
    ADD COLUMN "periodo" "PeriodoDoDia",
    ADD COLUMN "pernoite" BOOLEAN NOT NULL DEFAULT false;

-- Toda parada é um ponto cadastrado ou tem um título.
ALTER TABLE "item_roteiro" ADD CONSTRAINT "item_roteiro_ponto_ou_titulo" CHECK ("id_ponto" IS NOT NULL OR "titulo" IS NOT NULL);

-- Uma única pernoite por dia do roteiro.
CREATE UNIQUE INDEX "item_roteiro_uma_pernoite_por_dia" ON "item_roteiro"("id_roteiro", "dia") WHERE "pernoite";
