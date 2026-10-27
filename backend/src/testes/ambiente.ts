import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import { urlDoBancoDeTeste } from "./urlBanco";

/**
 * Deve ser o PRIMEIRO import de todo teste de integração: define o ambiente (banco de
 * teste, segredo, pasta de uploads) antes de qualquer módulo da aplicação ser carregado,
 * já que vários deles leem variáveis de ambiente na importação.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "segredo-de-teste-apenas-para-a-suite-de-integracao";
process.env.DATABASE_URL = urlDoBancoDeTeste();
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SMTP_HOST = "";

if (!process.env.TESTE_COM_RATE_LIMIT) {
  process.env.RATE_LIMIT_OFF = "1";
}

export const PASTA_UPLOADS_TESTE = fs.mkdtempSync(path.join(os.tmpdir(), "nomadplan-uploads-"));
process.env.UPLOADS_DIR = PASTA_UPLOADS_TESTE;
