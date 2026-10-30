import fs from "fs";
import path from "path";
import { RAIZ_UPLOADS } from "./caminhos";

/** Converte "/uploads/pontos/arquivo.png" no caminho real, só se ficar dentro da pasta de uploads. */
export function caminhoDoArquivoPublico(urlPublica: string): string | null {
  if (!urlPublica.startsWith("/uploads/")) {
    return null;
  }

  const relativo = urlPublica.slice("/uploads/".length);
  const absoluto = path.resolve(RAIZ_UPLOADS, relativo);
  const raiz = path.resolve(RAIZ_UPLOADS) + path.sep;

  return absoluto.startsWith(raiz) ? absoluto : null;
}

/** Apaga um arquivo enviado (melhor esforço: falhar em apagar nunca derruba a operação). */
export async function removerArquivoPublico(urlPublica: string | null | undefined): Promise<void> {
  if (!urlPublica) {
    return;
  }

  const caminho = caminhoDoArquivoPublico(urlPublica);

  if (!caminho) {
    return;
  }

  try {
    await fs.promises.unlink(caminho);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Não foi possível apagar o arquivo enviado:", error);
    }
  }
}

export async function removerArquivoLocal(caminho: string | null | undefined): Promise<void> {
  if (!caminho) {
    return;
  }

  try {
    await fs.promises.unlink(caminho);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Não foi possível apagar o arquivo temporário:", error);
    }
  }
}
