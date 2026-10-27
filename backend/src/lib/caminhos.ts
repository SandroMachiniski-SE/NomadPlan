import path from "path";

// Pasta onde ficam as imagens enviadas. Pode ser trocada por UPLOADS_DIR (os testes
// usam uma pasta temporária para não misturar arquivos de teste com os reais). O padrão
// é relativo à pasta de execução da API (backend/), e não ao arquivo compilado: assim
// "npm run dev" e "npm start" usam as mesmas imagens, e um novo build não as apaga.
export const RAIZ_UPLOADS = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
