import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para dados sensíveis guardados no banco, como
 * o segredo do segundo fator (RNF10: dados sensíveis criptografados em repouso).
 *
 * A chave vem de CHAVE_CRIPTOGRAFIA. Sem ela, deriva-se do JWT_SECRET — prático em
 * desenvolvimento, mas em produção use uma chave própria: assim trocar o JWT_SECRET
 * (que só invalida sessões) não torna os segredos já gravados ilegíveis.
 */

function chave(): Buffer {
  // "||" (e não "??"): no .env, "CHAVE_CRIPTOGRAFIA=" em branco conta como não definida.
  const base = process.env.CHAVE_CRIPTOGRAFIA || process.env.JWT_SECRET || "";

  if (!base) {
    throw new Error("Defina CHAVE_CRIPTOGRAFIA (ou JWT_SECRET) para criptografar dados sensíveis.");
  }

  return createHash("sha256").update(`nomadplan:dados-sensiveis:${base}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const etiqueta = cifra.getAuthTag();

  return ["v1", iv.toString("base64url"), etiqueta.toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrar(valor: string): string {
  const [versao, iv, etiqueta, dados] = valor.split(".");

  if (versao !== "v1" || !iv || !etiqueta || !dados) {
    throw new Error("Formato de dado criptografado inválido.");
  }

  const decifra = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  decifra.setAuthTag(Buffer.from(etiqueta, "base64url"));

  return Buffer.concat([decifra.update(Buffer.from(dados, "base64url")), decifra.final()]).toString("utf8");
}
