-- Redefinir a senha incrementa a versão e derruba as sessões emitidas antes.
ALTER TABLE "usuario" ADD COLUMN "versao_sessao" INTEGER NOT NULL DEFAULT 0;
