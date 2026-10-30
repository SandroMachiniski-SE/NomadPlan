-- O mesmo hotel pode ser a pernoite de várias noites; como parada (visita), cada ponto continua
-- aparecendo uma vez só no roteiro.
DROP INDEX "item_roteiro_id_roteiro_id_ponto_key";
CREATE UNIQUE INDEX "item_roteiro_id_roteiro_id_ponto_key" ON "item_roteiro"("id_roteiro", "id_ponto") WHERE NOT "pernoite";
