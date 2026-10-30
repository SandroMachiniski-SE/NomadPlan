// Captura a tela de busca e o detalhe de um ponto com os dados reais do OpenStreetMap.
// Use um banco só com o seed (sem os pontos fictícios antigos), com a API e o frontend rodando.
// Uso (na raiz do projeto):
//   NODE_PATH=e2e/node_modules node docs/rfc-imagens/rfc_capturar_dados_reais.cjs [frontend] [api]
// Padrão: frontend em http://localhost:5181 e API em http://localhost:3341. Usa o Microsoft Edge.
const { chromium } = require("playwright");
const path = require("path");

const WEB = process.argv[2] || "http://localhost:5181";
const API = process.argv[3] || "http://localhost:3341";
const SAIDA = path.join(__dirname, "rfc_telas");
const CIDADE = "Joinville";
const PONTO = "Museu Nacional de Imigração e Colonização";

async function json(metodo, caminho, corpo, token) {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
}

// Pessoa de demonstração com interesses, para a tela inicial mostrar as recomendações.
async function sessaoDeDemonstracao() {
  const dados = { email: "maria.souza@demo.nomadplan.local", senha: "senha-demo-123" };
  let r = await json("POST", "/auth/login", dados);

  if (r.status !== 200) {
    r = await json("POST", "/auth/registrar", { ...dados, nome: "Maria Souza", aceitouPolitica: true });
  }
  if (!r.corpo?.token) throw new Error(`Não foi possível entrar: ${r.status} ${JSON.stringify(r.corpo)}`);

  await json("PUT", "/auth/me", { cidadeBase: CIDADE, interesses: ["Cultura", "Natureza"] }, r.corpo.token);
  return r.corpo.token;
}

async function esperarImagens(page) {
  // Os cartões usam loading="lazy": fora da tela, a imagem só carregaria com a rolagem.
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager")));
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 30000 });
}

(async () => {
  const token = await sessaoDeDemonstracao();
  const busca = await json("GET", `/pontos?cidade=${encodeURIComponent(CIDADE)}&busca=${encodeURIComponent(PONTO)}`);
  const ponto = busca.corpo?.dados?.find((p) => p.nome === PONTO);
  if (!ponto) throw new Error(`Ponto "${PONTO}" não encontrado: rode o seed neste banco.`);

  const browser = await chromium.launch({ channel: "msedge" });
  const opcoes = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
  // O cabeçalho fixo se repetiria no meio da captura de página inteira.
  const semCabecalhoFixo = () => {
    document.addEventListener("DOMContentLoaded", () => {
      const estilo = document.createElement("style");
      estilo.textContent = ".site-header{position:static!important}";
      document.head.appendChild(estilo);
    });
  };

  // Tela inicial logada, buscando a cidade.
  const logado = await browser.newContext(opcoes);
  await logado.addInitScript((t) => localStorage.setItem("nomadplan.token", t), token);
  await logado.addInitScript(semCabecalhoFixo);
  const page = await logado.newPage();
  await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Cidade", { exact: true }).fill(CIDADE);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("heading", { name: /\d+ resultados?/ }).waitFor({ timeout: 20000 });
  await page.getByRole("heading", { name: "Recomendados para você" }).waitFor({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await esperarImagens(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SAIDA, "busca.png"), fullPage: true });

  // Detalhe do ponto, como um visitante sem login.
  const anonimo = await browser.newContext(opcoes);
  await anonimo.addInitScript(semCabecalhoFixo);
  const detalhe = await anonimo.newPage();
  await detalhe.goto(`${WEB}/pontos/${ponto.id}`, { waitUntil: "networkidle" });
  await detalhe.getByRole("heading", { name: PONTO, level: 1 }).waitFor({ timeout: 20000 });
  await detalhe.waitForSelector(".leaflet-tile-loaded", { timeout: 30000 });
  await esperarImagens(detalhe);
  await detalhe.waitForTimeout(1500);
  await detalhe.screenshot({ path: path.join(SAIDA, "ponto.png"), fullPage: true });

  await browser.close();
  console.log("capturas gravadas em", SAIDA);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
