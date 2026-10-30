// Recaptura login, cadastro e detalhe do ponto com o sistema rodando (frontend em :5173, API em :3333).
// Uso (na raiz do projeto): NODE_PATH=e2e/node_modules node docs/rfc-imagens/rfc_recapturar_telas.cjs
// Usa o Microsoft Edge instalado, como os testes de ponta a ponta.
const { chromium } = require("playwright");
const path = require("path");
const SAIDA = process.argv[2] || path.join(__dirname, "rfc_telas");

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const base = "http://localhost:5173";

  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector("form", { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SAIDA, "login.png") });

  await page.goto(`${base}/registrar`, { waitUntil: "networkidle" });
  await page.waitForSelector("form", { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SAIDA, "registrar.png"), fullPage: true });

  await page.goto(`${base}/pontos/5`, { waitUntil: "networkidle" });
  await page.waitForSelector(".leaflet-tile-loaded", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SAIDA, "ponto.png"), fullPage: true });

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
