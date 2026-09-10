-- No-op intencional.
-- O Prisma não modela colunas "GENERATED ALWAYS AS ... STORED", então ele detecta
-- a coluna "geom" (criada à mão na migration anterior) como divergente do schema e
-- tentaria remover o índice GiST e uma suposta "default" nesta migração automática.
-- Isso está incorreto: mantemos o índice e a coluna gerada como estão.
SELECT 1;
