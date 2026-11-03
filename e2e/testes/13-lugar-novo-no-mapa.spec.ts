import { expect, test, type Page } from "@playwright/test";
import { cadastrar, entrarComo, sair } from "../suporte/ajudantes";

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

    await cadastrar(page);
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
