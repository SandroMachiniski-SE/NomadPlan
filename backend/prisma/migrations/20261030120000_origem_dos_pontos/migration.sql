-- RNF19: de onde veio cada ponto (cadastro de um usuário, importação de arquivo ou API
-- externa) e, para os que vieram do OpenStreetMap, o vínculo com o elemento original e o
-- crédito da foto (as imagens do Wikimedia Commons exigem atribuição).
CREATE TYPE "OrigemRegistro" AS ENUM ('USUARIO', 'IMPORTACAO', 'API');

ALTER TABLE "ponto_turistico"
    ADD COLUMN "origem" "OrigemRegistro" NOT NULL DEFAULT 'USUARIO',
    ADD COLUMN "id_osm" TEXT,
    ADD COLUMN "sincronizado_em" TIMESTAMP(3),
    ADD COLUMN "imagem_credito" TEXT,
    ADD COLUMN "imagem_fonte" TEXT;

CREATE UNIQUE INDEX "ponto_turistico_id_osm_key" ON "ponto_turistico"("id_osm");
