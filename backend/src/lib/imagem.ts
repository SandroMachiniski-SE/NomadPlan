import fs from "fs";

// O tipo (MIME) que o navegador informa é só uma declaração do cliente; o que vale é o
// conteúdo do arquivo. Conferimos os primeiros bytes (assinatura) do formato.

export type TipoImagem = "image/jpeg" | "image/png" | "image/webp";

export const EXTENSAO_POR_TIPO: Record<TipoImagem, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function detectarTipoImagem(inicio: Buffer): TipoImagem | null {
  if (inicio.length >= 3 && inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff) {
    return "image/jpeg";
  }

  const assinaturaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (inicio.length >= 8 && assinaturaPng.every((byte, i) => inicio[i] === byte)) {
    return "image/png";
  }

  if (
    inicio.length >= 12 &&
    inicio.toString("ascii", 0, 4) === "RIFF" &&
    inicio.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export async function lerInicioDoArquivo(caminho: string, bytes = 16): Promise<Buffer> {
  const arquivo = await fs.promises.open(caminho, "r");

  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await arquivo.read(buffer, 0, bytes, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await arquivo.close();
  }
}
