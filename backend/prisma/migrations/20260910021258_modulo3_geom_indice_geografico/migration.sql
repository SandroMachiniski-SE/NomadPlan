-- CreateExtension
-- Necessário mesmo com a imagem postgis/postgis: ela só habilita a extensão no banco
-- padrão do container, não em bancos criados depois (ex.: o shadow database do Prisma).
CREATE EXTENSION IF NOT EXISTS postgis;

-- AlterTable
-- Coluna geográfica gerada automaticamente pelo Postgres a partir de latitude/longitude,
-- mantendo-a sempre em sincronia sem necessidade de trigger ou lógica na aplicação.
ALTER TABLE "ponto_turistico" ADD COLUMN "geom" geography(Point,4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
      ELSE NULL
    END
  ) STORED;

-- CreateIndex
CREATE INDEX "ponto_turistico_geom_idx" ON "ponto_turistico" USING GIST ("geom");
