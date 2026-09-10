-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "interesses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "roteiro" ADD COLUMN "publico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "slug_publico" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "roteiro_slug_publico_key" ON "roteiro"("slug_publico");
