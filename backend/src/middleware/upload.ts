import fs from "fs";
import path from "path";
import { Request, Response, NextFunction, RequestHandler } from "express";
import multer from "multer";
import { RAIZ_UPLOADS } from "../lib/caminhos";
import { EXTENSAO_POR_TIPO, detectarTipoImagem, lerInicioDoArquivo, type TipoImagem } from "../lib/imagem";
import { removerArquivoLocal } from "../lib/arquivos";

// RNF03 / AF03: imagens de até 5 MB, em JPG, PNG ou WEBP. Cada falha tem um status e
// uma mensagem própria, para o frontend poder orientar o usuário.

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;

const MENSAGEM_TAMANHO = "A imagem excede 5 MB. Reduza o tamanho e tente novamente.";
const MENSAGEM_FORMATO = "Formato não suportado. Use JPG, PNG ou WEBP.";

class ErroDeFormato extends Error {}

function guardarEm(subpasta: string) {
  const pasta = path.join(RAIZ_UPLOADS, subpasta);

  return multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdirSync(pasta, { recursive: true });
      callback(null, pasta);
    },
    filename: (_req, file, callback) => {
      // A extensão vem do tipo aceito, nunca do nome enviado pelo cliente (um ".html"
      // com tipo "image/png" seria servido como página).
      const extensao = EXTENSAO_POR_TIPO[file.mimetype as TipoImagem] ?? "";
      callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extensao}`);
    },
  });
}

/**
 * Recebe um campo de imagem. Depois do upload confere o conteúdo real do arquivo; se não
 * for uma imagem de verdade, apaga o arquivo e responde 415. Em qualquer erro, nenhum
 * arquivo parcial fica no disco.
 */
export function receberImagem(campo: string, subpasta: string): RequestHandler {
  const upload = multer({
    storage: guardarEm(subpasta),
    limits: { fileSize: LIMITE_IMAGEM_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!(file.mimetype in EXTENSAO_POR_TIPO)) {
        callback(new ErroDeFormato(MENSAGEM_FORMATO));
        return;
      }

      callback(null, true);
    },
  }).single(campo);

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (erro: unknown) => {
      if (erro) {
        if (erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ erro: MENSAGEM_TAMANHO });
        }

        if (erro instanceof ErroDeFormato) {
          return res.status(415).json({ erro: MENSAGEM_FORMATO });
        }

        if (erro instanceof multer.MulterError) {
          return res.status(400).json({ erro: "Envio de arquivo inválido." });
        }

        return next(erro);
      }

      if (!req.file) {
        return next();
      }

      const arquivo = req.file;

      lerInicioDoArquivo(arquivo.path)
        .then(async (inicio) => {
          if (detectarTipoImagem(inicio) === null) {
            await removerArquivoLocal(arquivo.path);
            req.file = undefined;

            return res.status(415).json({ erro: MENSAGEM_FORMATO });
          }

          return next();
        })
        .catch(next);
    });
  };
}

/** Endereço público ("/uploads/<subpasta>/<arquivo>") de um arquivo recém-enviado. */
export function caminhoPublicoImagem(arquivo: Express.Multer.File, subpasta: string): string {
  return `/uploads/${subpasta}/${arquivo.filename}`;
}
