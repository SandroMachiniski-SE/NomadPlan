-- Por que um item entrou na fila de moderação (AF05/RF15): conteúdo suspeito, foto
-- anexada, etc. O moderador vê o motivo e sabe o que conferir.
ALTER TABLE "sugestao_edicao" ADD COLUMN "motivo_retencao" TEXT;
ALTER TABLE "avaliacao" ADD COLUMN "motivo_retencao" TEXT;
