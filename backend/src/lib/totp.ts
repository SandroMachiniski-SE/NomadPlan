import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// TOTP (RFC 6238) para autenticação em dois fatores, compatível com Google
// Authenticator, Microsoft Authenticator, Authy etc.

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASSO_SEGUNDOS = 30;
const DIGITOS = 6;

export function codificarBase32(dados: Buffer): string {
  let bits = "";
  for (const byte of dados) bits += byte.toString(2).padStart(8, "0");

  let saida = "";
  for (let i = 0; i < bits.length; i += 5) {
    saida += ALFABETO_BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }

  return saida;
}

export function decodificarBase32(texto: string): Buffer {
  const limpo = texto.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();

  let bits = "";
  for (const caractere of limpo) {
    const indice = ALFABETO_BASE32.indexOf(caractere);
    if (indice === -1) throw new Error("Segredo base32 inválido.");
    bits += indice.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));

  return Buffer.from(bytes);
}

export function gerarSegredoTotp(): string {
  return codificarBase32(randomBytes(20));
}

export function passoDoTempo(tempoMs: number): number {
  return Math.floor(tempoMs / 1000 / PASSO_SEGUNDOS);
}

export function codigoTotp(segredoBase32: string, passo: number, digitos: number = DIGITOS): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));

  const hmac = createHmac("sha1", decodificarBase32(segredoBase32)).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[deslocamento] & 0x7f) << 24) |
    (hmac[deslocamento + 1] << 16) |
    (hmac[deslocamento + 2] << 8) |
    hmac[deslocamento + 3];

  return (binario % 10 ** digitos).toString().padStart(digitos, "0");
}

/**
 * Confere o código informado aceitando o passo atual e um vizinho de cada lado (relógios
 * levemente fora de sincronia). Devolve o passo que bateu (para impedir reuso do mesmo
 * código) ou null se nenhum bateu.
 */
export function verificarTotp(
  segredoBase32: string,
  codigo: string,
  tempoMs: number = Date.now(),
  janela: number = 1,
): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;

  const atual = passoDoTempo(tempoMs);
  const recebido = Buffer.from(codigo);

  for (let deslocamento = -janela; deslocamento <= janela; deslocamento += 1) {
    const esperado = Buffer.from(codigoTotp(segredoBase32, atual + deslocamento));

    if (esperado.length === recebido.length && timingSafeEqual(esperado, recebido)) {
      return atual + deslocamento;
    }
  }

  return null;
}

export function urlOtpauth(email: string, segredoBase32: string, emissor = "NomadPlan"): string {
  const rotulo = encodeURIComponent(`${emissor}:${email}`);

  return `otpauth://totp/${rotulo}?secret=${segredoBase32}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_SEGUNDOS}`;
}
