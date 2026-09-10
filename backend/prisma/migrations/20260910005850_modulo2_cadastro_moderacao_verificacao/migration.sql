-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- AlterTable
ALTER TABLE "ponto_turistico" ADD COLUMN     "horario_funcionamento" TEXT,
ADD COLUMN     "imagem_url" TEXT,
ADD COLUMN     "motivo_rejeicao" TEXT,
ALTER COLUMN "status" SET DEFAULT 'RASCUNHO';

-- CreateTable
CREATE TABLE "sugestao_edicao" (
    "id" SERIAL NOT NULL,
    "id_ponto" INTEGER NOT NULL,
    "id_autor" INTEGER NOT NULL,
    "campos_propostos" JSONB NOT NULL,
    "mensagem" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "id_moderador" INTEGER,
    "motivo_rejeicao" TEXT,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_resolucao" TIMESTAMP(3),

    CONSTRAINT "sugestao_edicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacao_verificacao" (
    "id" SERIAL NOT NULL,
    "id_ponto" INTEGER NOT NULL,
    "id_solicitante" INTEGER NOT NULL,
    "comprovacao" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "id_moderador" INTEGER,
    "motivo_rejeicao" TEXT,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_resolucao" TIMESTAMP(3),

    CONSTRAINT "solicitacao_verificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sugestao_edicao_id_ponto_idx" ON "sugestao_edicao"("id_ponto");

-- CreateIndex
CREATE INDEX "sugestao_edicao_status_idx" ON "sugestao_edicao"("status");

-- CreateIndex
CREATE INDEX "solicitacao_verificacao_id_ponto_idx" ON "solicitacao_verificacao"("id_ponto");

-- CreateIndex
CREATE INDEX "solicitacao_verificacao_status_idx" ON "solicitacao_verificacao"("status");

-- AddForeignKey
ALTER TABLE "sugestao_edicao" ADD CONSTRAINT "sugestao_edicao_id_ponto_fkey" FOREIGN KEY ("id_ponto") REFERENCES "ponto_turistico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_edicao" ADD CONSTRAINT "sugestao_edicao_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_verificacao" ADD CONSTRAINT "solicitacao_verificacao_id_ponto_fkey" FOREIGN KEY ("id_ponto") REFERENCES "ponto_turistico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_verificacao" ADD CONSTRAINT "solicitacao_verificacao_id_solicitante_fkey" FOREIGN KEY ("id_solicitante") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
