-- Rotas de carro já consultadas no OSRM, uma por sentido (origem → destino). Guardam a distância,
-- o tempo, o traçado simplificado da estrada e o perfil de tempo (km e segundos acumulados a cada
-- 5 km). Valem 90 dias; uma vencida ainda é usada quando o OSRM não responde.
CREATE TABLE "rota_em_cache" (
    "id" SERIAL NOT NULL,
    "codigo_origem" INTEGER NOT NULL,
    "codigo_destino" INTEGER NOT NULL,
    "metros" INTEGER NOT NULL,
    "segundos" INTEGER NOT NULL,
    "tracado" geometry(LineString, 4326) NOT NULL,
    "perfil" JSONB NOT NULL,
    "buscada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rota_em_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rota_em_cache_codigo_origem_codigo_destino_key" ON "rota_em_cache" ("codigo_origem", "codigo_destino");

ALTER TABLE "rota_em_cache"
    ADD CONSTRAINT "rota_em_cache_codigo_origem_fkey" FOREIGN KEY ("codigo_origem")
    REFERENCES "municipio"("codigo_ibge") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "rota_em_cache_codigo_destino_fkey" FOREIGN KEY ("codigo_destino")
    REFERENCES "municipio"("codigo_ibge") ON DELETE CASCADE ON UPDATE CASCADE;
