-- Municípios do Brasil (IBGE): código, nome, UF e coordenadas da sede. Servem para saber onde
-- a pessoa mora, achar as cidades de pernoite ao longo da estrada e guardar, em cache, o resumo
-- de hospedagens e atrações de cada uma (Overpass).
CREATE TABLE "municipio" (
    "codigo_ibge" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_normalizado" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "resumo_osm" JSONB,
    "resumo_em" TIMESTAMP(3),

    CONSTRAINT "municipio_pkey" PRIMARY KEY ("codigo_ibge")
);

-- Mesma ideia de ponto_turistico.geom: coluna gerada, sempre em sincronia com lat/long.
ALTER TABLE "municipio" ADD COLUMN "geom" geography(Point,4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED;

CREATE INDEX "municipio_geom_idx" ON "municipio" USING GIST ("geom");

-- Não é único: a busca por nome e UF pode achar mais de um e pede para escolher.
CREATE INDEX "municipio_nome_normalizado_uf_idx" ON "municipio" ("nome_normalizado", "uf");

-- Onde a pessoa mora e o consumo do carro dela (para estimar o combustível).
ALTER TABLE "usuario"
    ADD COLUMN "codigo_municipio_base" INTEGER,
    ADD COLUMN "consumo_km_por_litro" DECIMAL(4,1),
    ADD CONSTRAINT "usuario_consumo_km_por_litro_check" CHECK ("consumo_km_por_litro" BETWEEN 3 AND 40);

ALTER TABLE "usuario"
    ADD CONSTRAINT "usuario_codigo_municipio_base_fkey" FOREIGN KEY ("codigo_municipio_base")
    REFERENCES "municipio"("codigo_ibge") ON DELETE SET NULL ON UPDATE CASCADE;
