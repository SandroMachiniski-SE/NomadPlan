import { expect, test, type Page } from "@playwright/test";
import { cadastrar, CONTAS_E2E, entrar, entrarComo, SENHA_E2E, sair } from "../suporte/ajudantes";

async function buscarJoinville(page: Page) {
  await page.goto("/");
  await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /\d+ resultados?/ })).toBeVisible();
}

/** Clica num lugar vazio do mapa (perto do canto de baixo, longe dos pinos e do botão de busca). */
async function clicarLugarVazio(page: Page) {
  const mapa = page.locator(".leaflet-container").first();
  await expect(mapa).toBeVisible();
  const caixa = (await mapa.boundingBox())!;

  await mapa.click({ position: { x: caixa.width * 0.15, y: caixa.height * 0.8 } });
}

test.describe("lugar novo marcado no mapa da busca", () => {
  test("visitante marca um lugar no mapa, envia para revisão e a moderadora publica", async ({ page }) => {
    const nome = `Mirante Novo ${Date.now()}`;

    const email = await cadastrar(page);
    await buscarJoinville(page);
    await clicarLugarVazio(page);
    await page.getByRole("link", { name: "Cadastrar um lugar aqui" }).click();

    await expect(page).toHaveURL(/\/pontos\/novo\?latitude=-?\d+\.\d+&longitude=-?\d+\.\d+$/);
    await expect(page.getByLabel("Latitude")).not.toHaveValue("");
    await expect(page.getByLabel("Longitude")).not.toHaveValue("");
    await expect(page.getByLabel("Cidade *")).toHaveValue("Joinville");
    await expect(page.getByText("Posição marcada no mapa; confira antes de salvar.")).toBeVisible();

    await page.getByLabel("Nome *").fill(nome);
    await page.getByLabel("Categoria *").fill("Natureza");
    await page.getByLabel("Horário de funcionamento *").fill("Todos os dias, 24h");
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/pontos\/\d+\/editar$/);
    const id = page.url().match(/\/pontos\/(\d+)\/editar$/)![1];
    // Já salvo, a dica sobre a posição marcada no mapa sai da tela.
    await expect(page.getByText("Posição marcada no mapa; confira antes de salvar.")).toHaveCount(0);
    await page.getByRole("button", { name: "Enviar para publicação" }).click();
    await expect(page.getByRole("button", { name: "Enviar para publicação" })).toHaveCount(0);

    await sair(page);
    await entrarComo(page, "moderador");
    await page.goto("/moderacao");
    const item = page.locator("article", { hasText: nome });
    await item.getByRole("button", { name: "Aprovar" }).click();
    await expect(item).toHaveCount(0);

    await sair(page);
    await page.goto("/");
    await page.getByLabel("Buscar por nome ou descrição").fill(nome);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();

    // Quem cadastrou um lugar da comunidade não vê o pedido de selo (coisa de dono) e pode sugerir correções.
    await entrar(page, email);
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
    await page.goto(`/pontos/${id}`);
    await expect(page.getByRole("heading", { name: "Dados desatualizados?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Solicitar selo de verificação" })).toHaveCount(0);
  });

  test("todas as contas veem Meus pontos no menu", async ({ page }) => {
    await cadastrar(page);

    await expect(page.getByRole("link", { name: "Meus pontos" })).toBeVisible();
  });

  test("sem login o balão pede para entrar", async ({ page }) => {
    await buscarJoinville(page);
    await clicarLugarVazio(page);

    await expect(page.locator(".leaflet-popup", { hasText: "para cadastrar um lugar aqui" })).toBeVisible();
    await expect(page.locator(".leaflet-popup").getByRole("link", { name: "Entre" })).toHaveAttribute("href", "/login");
  });

  test("clicar num pino não abre o balão de cadastro", async ({ page }) => {
    await cadastrar(page);
    await buscarJoinville(page);

    // O pino (ou o grupo de pinos) abre o balão do lugar ou aproxima o mapa, nunca o de cadastro.
    await page.locator(".leaflet-marker-icon").first().click();
    await page.waitForTimeout(800);

    await expect(page.getByRole("link", { name: "Cadastrar um lugar aqui" })).toHaveCount(0);
  });

  test("posição inválida na URL deixa os campos vazios", async ({ page }) => {
    await cadastrar(page);

    await page.goto("/pontos/novo?latitude=abc&longitude=-48.8");

    await expect(page.getByLabel("Latitude")).toHaveValue("");
    await expect(page.getByLabel("Longitude")).toHaveValue("");
    await expect(page.getByText("Posição marcada no mapa; confira antes de salvar.")).toHaveCount(0);
  });

  test("coordenadas vazias na URL deixam os campos vazios", async ({ page }) => {
    await cadastrar(page);

    await page.goto("/pontos/novo?latitude=&longitude=");

    await expect(page.getByLabel("Latitude")).toHaveValue("");
    await expect(page.getByLabel("Longitude")).toHaveValue("");
    await expect(page.getByText("Posição marcada no mapa; confira antes de salvar.")).toHaveCount(0);
  });

  test("entrar pelo balão volta para o cadastro no ponto marcado", async ({ page }) => {
    await buscarJoinville(page);
    await clicarLugarVazio(page);
    await page.locator(".leaflet-popup").getByRole("link", { name: "Entre" }).click();

    await page.getByLabel("E-mail").fill(CONTAS_E2E.moderador.email);
    await page.getByLabel("Senha").fill(SENHA_E2E);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/pontos\/novo\?latitude=-?\d+\.\d+&longitude=-?\d+\.\d+$/);
    await expect(page.getByLabel("Latitude")).not.toHaveValue("");
  });

  test("o balão que abre perto da borda não conta como mexer no mapa", async ({ page }) => {
    await buscarJoinville(page);
    await expect(page.getByRole("button", { name: "Mova o mapa para buscar outra área" })).toBeVisible();
    const mapa = page.locator(".leaflet-container").first();
    const caixa = (await mapa.boundingBox())!;

    // Perto do topo, o balão só cabe se o mapa descer um pouco.
    await mapa.click({ position: { x: caixa.width * 0.9, y: 12 } });
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await page.waitForTimeout(800);

    await expect(page.getByRole("button", { name: "Mova o mapa para buscar outra área" })).toBeVisible();
  });

  test("fechar o balão de um lugar clicando no mapa não abre o de cadastro", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/");
    await page.getByLabel("Buscar por nome ou descrição").fill("Museu Nacional da Imigração E2E");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.locator(".leaflet-marker-icon").first().click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();

    await clicarLugarVazio(page);
    await page.waitForTimeout(600);
    await expect(page.getByRole("link", { name: "Cadastrar um lugar aqui" })).toHaveCount(0);

    // Com nada aberto, o clique seguinte num lugar vazio oferece o cadastro.
    await clicarLugarVazio(page);
    await expect(page.getByRole("link", { name: "Cadastrar um lugar aqui" })).toBeVisible();
  });

  test("duplo clique para aproximar não abre o balão de cadastro", async ({ page }) => {
    await cadastrar(page);
    await buscarJoinville(page);
    const mapa = page.locator(".leaflet-container").first();
    const caixa = (await mapa.boundingBox())!;

    await mapa.dblclick({ position: { x: caixa.width * 0.15, y: caixa.height * 0.8 } });
    await page.waitForTimeout(600);

    await expect(page.getByRole("link", { name: "Cadastrar um lugar aqui" })).toHaveCount(0);
  });
});
