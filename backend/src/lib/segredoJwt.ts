const TAMANHO_MINIMO_PRODUCAO = 32;
const PADRAO_SEGREDO_FRACO = /troque-por|change-me|senha|secret123/i;

/**
 * O JWT_SECRET assina os tokens de login e de redefinição de senha: quem o conhece
 * consegue forjar um token de qualquer conta, inclusive ADMIN. Em produção,
 * recusamos segredos curtos ou que ainda sejam o valor de exemplo do .env.example.
 * Em desenvolvimento qualquer valor não vazio é aceito.
 */
export function validarSegredoJwt(segredo: string | undefined, ambiente: string | undefined): string {
  if (!segredo) {
    throw new Error("A variável de ambiente JWT_SECRET é obrigatória.");
  }

  if (ambiente === "production") {
    if (segredo.length < TAMANHO_MINIMO_PRODUCAO || PADRAO_SEGREDO_FRACO.test(segredo)) {
      throw new Error(
        `JWT_SECRET fraco para produção: use um valor aleatório com pelo menos ${TAMANHO_MINIMO_PRODUCAO} caracteres ` +
          "(ex.: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\").",
      );
    }
  }

  return segredo;
}
