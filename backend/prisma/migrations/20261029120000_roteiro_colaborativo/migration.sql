-- Roteiro colaborativo: convidar pessoas por e-mail para editar ou só consultar um roteiro.
CREATE TYPE "PapelColaborador" AS ENUM ('EDITOR', 'LEITOR');

CREATE TABLE "colaborador_roteiro" (
    "id" SERIAL NOT NULL,
    "id_roteiro" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "papel" "PapelColaborador" NOT NULL,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colaborador_roteiro_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "convite_roteiro" (
    "id" SERIAL NOT NULL,
    "id_roteiro" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "papel" "PapelColaborador" NOT NULL,
    "id_convidante" INTEGER NOT NULL,
    "data_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convite_roteiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "colaborador_roteiro_id_roteiro_id_usuario_key" ON "colaborador_roteiro"("id_roteiro", "id_usuario");
CREATE INDEX "colaborador_roteiro_id_usuario_idx" ON "colaborador_roteiro"("id_usuario");
CREATE UNIQUE INDEX "convite_roteiro_id_roteiro_email_key" ON "convite_roteiro"("id_roteiro", "email");
CREATE INDEX "convite_roteiro_email_idx" ON "convite_roteiro"("email");

ALTER TABLE "colaborador_roteiro" ADD CONSTRAINT "colaborador_roteiro_id_roteiro_fkey"
    FOREIGN KEY ("id_roteiro") REFERENCES "roteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "colaborador_roteiro" ADD CONSTRAINT "colaborador_roteiro_id_usuario_fkey"
    FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "convite_roteiro" ADD CONSTRAINT "convite_roteiro_id_roteiro_fkey"
    FOREIGN KEY ("id_roteiro") REFERENCES "roteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "convite_roteiro" ADD CONSTRAINT "convite_roteiro_id_convidante_fkey"
    FOREIGN KEY ("id_convidante") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
