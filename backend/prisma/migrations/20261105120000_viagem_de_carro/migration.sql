-- Viagem de carro de um roteiro salvo: de onde sai, o alvo de km (e de horas) por dia, se tem
-- volta e os dados do carro para o combustível. Tudo nulo nos roteiros sem viagem de carro.
ALTER TABLE "roteiro"
    ADD COLUMN "viagem_origem" INTEGER,
    ADD COLUMN "km_por_dia" INTEGER,
    ADD COLUMN "horas_por_dia" DECIMAL(3,1),
    ADD COLUMN "viagem_volta" BOOLEAN,
    ADD COLUMN "consumo_km_por_litro" DECIMAL(4,1),
    ADD COLUMN "preco_litro_centavos" INTEGER;

ALTER TABLE "roteiro"
    ADD CONSTRAINT "roteiro_viagem_origem_fkey" FOREIGN KEY ("viagem_origem")
    REFERENCES "municipio"("codigo_ibge") ON DELETE SET NULL ON UPDATE CASCADE;

-- Um registro por trecho dirigido: cada dia só de estrada e cada trecho curto descontado de um
-- dia na cidade (no começo dele, ou no fim, na volta curta). É informativo e fica preso ao número
-- do dia. O traçado é uma lista [lat, lon] só para desenhar o mapa.
CREATE TABLE "trecho_estrada" (
    "id" SERIAL NOT NULL,
    "id_roteiro" INTEGER NOT NULL,
    "dia" INTEGER NOT NULL,
    "perna" INTEGER NOT NULL,
    "noite" INTEGER,
    "de_nome" TEXT NOT NULL,
    "para_nome" TEXT NOT NULL,
    "metros" INTEGER NOT NULL,
    "segundos" INTEGER NOT NULL,
    "ocupa_o_dia" BOOLEAN NOT NULL,
    "no_fim_do_dia" BOOLEAN NOT NULL DEFAULT false,
    "litros" DECIMAL(6,1),
    "custo_combustivel_centavos" INTEGER,
    "tracado" JSONB NOT NULL,

    CONSTRAINT "trecho_estrada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trecho_estrada_id_roteiro_dia_idx" ON "trecho_estrada" ("id_roteiro", "dia");

ALTER TABLE "trecho_estrada"
    ADD CONSTRAINT "trecho_estrada_id_roteiro_fkey" FOREIGN KEY ("id_roteiro")
    REFERENCES "roteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
