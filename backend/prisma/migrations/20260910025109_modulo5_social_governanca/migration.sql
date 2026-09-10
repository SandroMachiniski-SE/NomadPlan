-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "reputacao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ponto_turistico" ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "avaliacao" (
    "id" SERIAL NOT NULL,
    "id_ponto" INTEGER NOT NULL,
    "id_autor" INTEGER NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "foto_url" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "motivo_rejeicao" TEXT,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versao_ponto" (
    "id" SERIAL NOT NULL,
    "id_ponto" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "id_autor" INTEGER,
    "motivo" TEXT NOT NULL,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versao_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "id_entidade" INTEGER,
    "detalhes" JSONB,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avaliacao_id_ponto_idx" ON "avaliacao"("id_ponto");

-- CreateIndex
CREATE INDEX "avaliacao_status_idx" ON "avaliacao"("status");

-- CreateIndex
CREATE INDEX "versao_ponto_id_ponto_idx" ON "versao_ponto"("id_ponto");

-- CreateIndex
CREATE INDEX "notificacao_id_usuario_idx" ON "notificacao"("id_usuario");

-- CreateIndex
CREATE INDEX "log_auditoria_entidade_id_entidade_idx" ON "log_auditoria"("entidade", "id_entidade");

-- CreateIndex
CREATE INDEX "log_auditoria_data_criacao_idx" ON "log_auditoria"("data_criacao");

-- AddForeignKey
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_id_ponto_fkey" FOREIGN KEY ("id_ponto") REFERENCES "ponto_turistico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versao_ponto" ADD CONSTRAINT "versao_ponto_id_ponto_fkey" FOREIGN KEY ("id_ponto") REFERENCES "ponto_turistico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
