-- População estimada de cada município (IBGE). Na viagem de carro, é o porte da cidade de pernoite
-- enquanto os hotéis dela ainda não foram contados no OpenStreetMap.
ALTER TABLE "municipio" ADD COLUMN "populacao" INTEGER;
