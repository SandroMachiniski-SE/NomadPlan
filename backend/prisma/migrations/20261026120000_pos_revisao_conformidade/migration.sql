-- Usuario: consentimento (LGPD), preferências do perfil (RF03), anonimização
-- (RNF13/AF10) e autenticação em dois fatores (RF21).
ALTER TABLE "usuario" ADD COLUMN "consentimento_em" TIMESTAMP(3);
ALTER TABLE "usuario" ADD COLUMN "idioma" TEXT NOT NULL DEFAULT 'pt-BR';
ALTER TABLE "usuario" ADD COLUMN "preferencias_acessibilidade" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "usuario" ADD COLUMN "removido_em" TIMESTAMP(3);
ALTER TABLE "usuario" ADD COLUMN "mfa_segredo" TEXT;
ALTER TABLE "usuario" ADD COLUMN "mfa_ativo" BOOLEAN NOT NULL DEFAULT false;

-- Avaliação: no máximo uma por usuário e ponto, garantido pelo banco (antes só era
-- checado no código, o que deixava passar duas requisições simultâneas).
CREATE UNIQUE INDEX "avaliacao_id_ponto_id_autor_key" ON "avaliacao"("id_ponto", "id_autor");
CREATE INDEX "avaliacao_id_autor_idx" ON "avaliacao"("id_autor");

-- Pontos salvos pelo usuário (RF10).
CREATE TABLE "ponto_salvo" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_ponto" INTEGER NOT NULL,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ponto_salvo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ponto_salvo_id_usuario_idx" ON "ponto_salvo"("id_usuario");
CREATE UNIQUE INDEX "ponto_salvo_id_usuario_id_ponto_key" ON "ponto_salvo"("id_usuario", "id_ponto");

ALTER TABLE "ponto_salvo" ADD CONSTRAINT "ponto_salvo_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ponto_salvo" ADD CONSTRAINT "ponto_salvo_id_ponto_fkey" FOREIGN KEY ("id_ponto") REFERENCES "ponto_turistico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Histórico de versões de roteiros (RF26).
CREATE TABLE "versao_roteiro" (
    "id" SERIAL NOT NULL,
    "id_roteiro" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "id_autor" INTEGER,
    "motivo" TEXT NOT NULL,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versao_roteiro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "versao_roteiro_id_roteiro_idx" ON "versao_roteiro"("id_roteiro");

ALTER TABLE "versao_roteiro" ADD CONSTRAINT "versao_roteiro_id_roteiro_fkey" FOREIGN KEY ("id_roteiro") REFERENCES "roteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Métricas de uso agregadas por dia (RF28, RNF26).
CREATE TABLE "metrica_diaria" (
    "dia" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "metrica_diaria_pkey" PRIMARY KEY ("dia", "tipo")
);

-- Consulta do histórico de ações de um usuário (exportação de dados pessoais).
CREATE INDEX "log_auditoria_id_usuario_idx" ON "log_auditoria"("id_usuario");
