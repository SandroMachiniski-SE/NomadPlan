import fs from "fs";
import path from "path";
import multer from "multer";

const PASTA_UPLOADS = path.join(__dirname, "..", "..", "uploads", "pontos");

fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, PASTA_UPLOADS);
  },
  filename: (_req, file, callback) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    const nomeUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extensao}`;
    callback(null, nomeUnico);
  },
});

export const uploadImagemPonto = multer({
  storage,
  limits: {
    // RNF03: uploads de imagem limitados a 5 MB por arquivo.
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
      callback(new Error("Formato de imagem não suportado. Use JPG, PNG ou WEBP."));
      return;
    }

    callback(null, true);
  },
}).single("imagem");

export function caminhoPublicoImagem(nomeArquivo: string): string {
  return `/uploads/pontos/${nomeArquivo}`;
}
