// Captura as telas da busca com mapa, do roteiro por dia/várias cidades e da viagem de carro.
// Precisa da API e do frontend rodando, de um banco com o seed (morador@nomadplan.local) e da conta de
// demonstração Maria Souza (criada por rfc_capturar_dados_reais.cjs), com os municípios do IBGE e a rota
// Joinville ↔ Brasília já no banco (cd backend && npm run viagem:preparar -- "Joinville/SC" "Brasília/DF").
// Uso (na raiz do projeto):
//   NODE_PATH=e2e/node_modules node docs/rfc-imagens/rfc_capturar_novidades.cjs [frontend] [api]
// Padrão: frontend em http://localhost:5180 e API em http://localhost:3350. Usa o Microsoft Edge.
// Depois da captura, roteiro-dias.png foi recortado até 2450 px de altura (só o topo do roteiro) e viagem-carro.png
// começa no título "Roteiro sugerido" e termina antes do rodapé; as demais ficam como saem.
const { chromium } = require("playwright");
const path = require("path");

const WEB = process.argv[2] || "http://localhost:5180";
const API = process.argv[3] || "http://localhost:3350";
const SAIDA = path.join(__dirname, "rfc_telas");

async function json(metodo, caminho, corpo, token) {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
}

async function entrar(email, senha) {
  const r = await json("POST", "/auth/login", { email, senha });
  if (!r.corpo?.token) throw new Error(`Não foi possível entrar como ${email}: ${r.status}`);
  return r.corpo.token;
}

async function esperarImagens(page) {
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager")));
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 30000 });
}

async function esperarMapa(page) {
  await page.waitForSelector(".leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const opcoes = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
  const semCabecalhoFixo = () => {
    document.addEventListener("DOMContentLoaded", () => {
      const estilo = document.createElement("style");
      estilo.textContent = ".site-header{position:static!important}";
      document.head.appendChild(estilo);
    });
  };
  const comSessao = async (token) => {
    const ctx = await browser.newContext(opcoes);
    if (token) await ctx.addInitScript((t) => localStorage.setItem("nomadplan.token", t), token);
    await ctx.addInitScript(semCabecalhoFixo);
    return ctx;
  };

  // 1. Busca com lista e mapa lado a lado (tela larga), como visitante.
  const anonimo = await comSessao();
  const busca = await anonimo.newPage();
  await busca.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await busca.getByLabel("Cidade", { exact: true }).fill("Joinville");
  await busca.getByRole("button", { name: "Buscar", exact: true }).click();
  await busca.locator(".resultados-dividido .leaflet-container").waitFor({ timeout: 30000 });
  await esperarMapa(busca);
  await esperarImagens(busca);
  await busca.locator(".resultados-dividido").scrollIntoViewIfNeeded();
  await busca.locator(".resultados-dividido .ponto-card").first().hover();
  await busca.waitForTimeout(600);
  await busca.screenshot({ path: path.join(SAIDA, "busca-mapa.png") });
  await anonimo.close();

  // 2. Roteiro de exemplo de 10 dias por várias cidades, com a navegação por dia.
  const tokenMorador = await entrar("morador@nomadplan.local", "senha-temporaria");
  const lista = await json("GET", "/roteiros", null, tokenMorador);
  const roteiros = lista.corpo?.dados ?? lista.corpo ?? [];
  const exemplo = roteiros.find((r) => /10 dias|regi[aã]o/i.test(r.nome)) ?? roteiros[0];
  if (!exemplo) throw new Error("O usuário morador@ não tem roteiro de exemplo: rode npm run roteiro:exemplo.");
  const morador = await comSessao(tokenMorador);
  const roteiro = await morador.newPage();
  await roteiro.goto(`${WEB}/roteiros/${exemplo.id}`, { waitUntil: "networkidle" });
  await roteiro.locator(".dias-nav").waitFor({ timeout: 20000 });
  await esperarMapa(roteiro);
  await esperarImagens(roteiro);
  await roteiro.screenshot({ path: path.join(SAIDA, "roteiro-dias.png"), fullPage: true });
  await morador.close();

  // 3. Perfil com a cidade de casa e o consumo do carro; 4. Gerar roteiro de carro e o resultado.
  const tokenMaria = await entrar("maria.souza@demo.nomadplan.local", "senha-demo-123");
  const maria = await comSessao(tokenMaria);
  const page = await maria.newPage();

  await page.goto(`${WEB}/perfil`, { waitUntil: "networkidle" });
  await page.getByLabel("Onde você mora").fill("Joinville");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Joinville, SC" }).click();
  await page.getByLabel("Consumo do meu carro (km/l)").fill("11,5");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByText("Perfil atualizado com sucesso.").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SAIDA, "perfil-casa.png"), fullPage: true });

  await page.goto(`${WEB}/roteiros/gerar`, { waitUntil: "networkidle" });
  await page.getByLabel("Cidade *").fill("Brasília");
  await page.getByLabel("Dias", { exact: true }).fill("4");
  await page.getByLabel("Vou de carro saindo de casa").check();
  await page.getByLabel("Planejar a volta").check();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SAIDA, "gerar-carro.png"), fullPage: true });

  await page.getByRole("button", { name: "Gerar roteiro" }).click();
  await page.getByRole("heading", { name: /^Dia 1 · Estrada · Joinville\/SC →/ }).waitFor({ timeout: 90000 });
  await esperarMapa(page);
  await esperarImagens(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SAIDA, "viagem-carro.png"), fullPage: true });

  await browser.close();
  console.log("capturas gravadas em", SAIDA);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
