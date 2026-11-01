/**
 * O site do ponto vira um link na página. Um "javascript:..." (ou "data:...") gravado
 * ali executaria código no navegador de quem clicasse, então só endereços http e https
 * são aceitos. Vazio vale como "sem site"; "museu.com.br" (sem protocolo, como as
 * pessoas costumam digitar) vira "https://museu.com.br".
 */
export function normalizarUrlHttp(valor: string): string | null {
  const texto = valor.trim();

  if (texto === "") {
    return "";
  }

  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(texto)) {
    return normalizarUrlHttp(`https://${texto}`);
  }

  try {
    const url = new URL(texto);

    return url.protocol === "http:" || url.protocol === "https:" ? texto : null;
  } catch {
    return null;
  }
}

export function ehUrlHttp(valor: string): boolean {
  return normalizarUrlHttp(valor) !== null;
}

export const MENSAGEM_URL_HTTP = "Informe um endereço que comece com http:// ou https://.";
