-- Outras fontes além do OpenStreetMap. O Overture Maps (licença aberta) completa telefone e site
-- e traz hospedagens; o Google Places só pode ser consultado na hora: dele guardamos apenas o
-- identificador do lugar (place_id), que os termos do Google permitem guardar, e quando ele foi
-- procurado, para não repetir a busca de um lugar que o Google não conhece.
ALTER TABLE "ponto_turistico"
    ADD COLUMN "id_overture" TEXT,
    ADD COLUMN "id_google" TEXT,
    ADD COLUMN "google_buscado_em" TIMESTAMP(3);

CREATE UNIQUE INDEX "ponto_turistico_id_overture_key" ON "ponto_turistico"("id_overture");
