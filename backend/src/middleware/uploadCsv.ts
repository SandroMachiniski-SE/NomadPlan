import multer from "multer";

// Importação de inventário (RF18): CSV ou GeoJSON, arquivo pequeno processado em memória
// e descartado — não precisa ser persistido em disco como as imagens de pontos.
export const uploadImportacao = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const nome = file.originalname.toLowerCase();
    const ehCsv = file.mimetype === "text/csv" || nome.endsWith(".csv");
    const ehGeoJson = nome.endsWith(".geojson") || nome.endsWith(".json") || file.mimetype === "application/geo+json";

    if (!ehCsv && !ehGeoJson) {
      callback(new Error("Envie um arquivo .csv ou .geojson."));
      return;
    }

    callback(null, true);
  },
}).single("arquivo");
