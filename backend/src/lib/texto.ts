/** Tira o caractere dado do fim do texto, quantas vezes ele se repetir ("a//" → "a"). */
export function semFinais(texto: string, caractere: string): string {
  let fim = texto.length;

  while (fim > 0 && texto[fim - 1] === caractere) {
    fim -= 1;
  }

  return texto.slice(0, fim);
}
