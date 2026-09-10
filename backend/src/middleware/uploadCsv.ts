import multer from "multer";

// Importação de inventário (RF18): arquivo pequeno, processado em memória e
// descartado — não precisa ser persistido em disco como as imagens de pontos.
export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "text/csv" && !file.originalname.toLowerCase().endsWith(".csv")) {
      callback(new Error("Envie um arquivo .csv."));
      return;
    }
    callback(null, true);
  },
}).single("arquivo");
