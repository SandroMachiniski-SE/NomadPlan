import { expect, test, type Page } from "@playwright/test";
import { cadastrar } from "../suporte/ajudantes";

const MUSEU = "Museu Nacional da Imigração E2E";
const PARQUE = "Parque da Cidade E2E";

async function criarRoteiro(page: Page, nome: string, cidade = "Joinville") {
  await page.goto("/roteiros/novo");
  await page.getByLabel("Nome *").fill(nome);
  await page.getByLabel("Cidade").fill(cidade);
  await page.getByRole("button", { name: "Criar roteiro" }).click();
  await expect(page).toHaveURL(/\/roteiros\/\d+$/);
}

async function adicionarPonto(page: Page, nomeDoPonto: string, observacao?: string) {
  await page.getByLabel("Ponto turístico *").selectOption({ label: `${nomeDoPonto} - Joinville` });
  if (observacao) await page.getByLabel(/Observação/).fill(observacao);
  await page.getByRole("button", { name: "Adicionar ponto" }).click();
  await expect(page.locator(".parada__card", { hasText: nomeDoPonto })).toBeVisible();
}

test.describe("roteiros", () => {
  test("cria um roteiro, adiciona paradas, reordena e remove", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Fim de semana em Joinville");

    await expect(page.getByRole("heading", { name: "Fim de semana em Joinville", level: 1 })).toBeVisible();
    await expect(page.getByText("Este roteiro ainda não tem pontos")).toBeVisible();

    await adicionarPonto(page, MUSEU, "Chegar cedo");
    await adicionarPonto(page, PARQUE);

    const nomes = () => page.locator(".parada__card h3").allTextContents();
    expect(await nomes()).toEqual([MUSEU, PARQUE]);
    await expect(page.getByText("Chegar cedo")).toBeVisible();

    // Mover o parque para cima inverte a ordem.
    await page.locator(".parada", { hasText: PARQUE }).getByRole("button", { name: "Mover para cima" }).click();
    await expect.poll(nomes).toEqual([PARQUE, MUSEU]);

    // O mesmo ponto não entra duas vezes.
    await page.getByLabel("Ponto turístico *").selectOption({ label: `${MUSEU} - Joinville` });
    await page.getByRole("button", { name: "Adicionar ponto" }).click();
    await expect(page.getByRole("alert")).toContainText(/já/i);

    page.once("dialog", (dialogo) => dialogo.accept());
    await page.locator(".parada", { hasText: PARQUE }).getByRole("button", { name: "Remover" }).click();
    await expect.poll(nomes).toEqual([MUSEU]);
  });

  test("compartilha por link público que qualquer pessoa abre, e deixa de compartilhar", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Autora do Roteiro" });
    await criarRoteiro(page, "Roteiro para compartilhar");
    await adicionarPonto(page, MUSEU);

    await page.getByRole("button", { name: "Compartilhar" }).click();
    const link = await page.locator(".roteiro-link a").getAttribute("href");
    expect(link).toMatch(/\/roteiros\/publico\/[\w-]+$/);

    const anonimo = await browser.newContext();
    const paginaAnonima = await anonimo.newPage();
    await paginaAnonima.goto(link!);
    await expect(paginaAnonima.getByRole("heading", { name: "Roteiro para compartilhar", level: 1 })).toBeVisible();
    await expect(paginaAnonima.getByText("por Autora do Roteiro")).toBeVisible();
    await expect(paginaAnonima.getByRole("heading", { name: MUSEU })).toBeVisible();

    await page.getByRole("button", { name: "Parar de compartilhar" }).click();
    await expect(page.locator(".roteiro-link")).toHaveCount(0);

    await paginaAnonima.reload();
    await expect(paginaAnonima.getByRole("alert")).toContainText("não está mais público");
    await anonimo.close();
  });

  test("cada pessoa só enxerga os próprios roteiros", async ({ page, browser }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro reservado");
    const endereco = page.url();

    const outra = await browser.newContext();
    const paginaOutra = await outra.newPage();
    await cadastrar(paginaOutra);
    await paginaOutra.goto(endereco);

    await expect(paginaOutra.getByText("Não foi possível carregar este roteiro.")).toBeVisible();
    await outra.close();
  });

  test("edita nome e cidade do roteiro", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Nome antigo");

    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome *").fill("Nome novo");
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page.getByRole("heading", { name: "Nome novo", level: 1 })).toBeVisible();
  });

  test("histórico de versões registra as mudanças e permite restaurar", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro com histórico");
    await adicionarPonto(page, MUSEU);
    await adicionarPonto(page, PARQUE);

    page.once("dialog", (dialogo) => dialogo.accept());
    await page.locator(".parada", { hasText: PARQUE }).getByRole("button", { name: "Remover" }).click();
    await expect(page.locator(".parada__card", { hasText: PARQUE })).toHaveCount(0);

    await page.getByRole("button", { name: "Ver histórico" }).click();
    await expect(page.getByText("Parada removida")).toBeVisible();
    await expect(page.getByText("Parada adicionada").first()).toBeVisible();

    // A versão guardada antes da remoção tinha as duas paradas.
    page.once("dialog", (dialogo) => dialogo.accept());
    await page.locator(".versao", { hasText: "Parada removida" }).getByRole("button", { name: "Restaurar" }).click();

    await expect(page.locator(".parada__card", { hasText: PARQUE })).toBeVisible();
    await expect(page.locator(".parada__card", { hasText: MUSEU })).toBeVisible();
  });

  test("exclui o roteiro", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro descartável");

    page.once("dialog", (dialogo) => dialogo.accept());
    await page.getByRole("button", { name: "Excluir" }).click();

    await expect(page).toHaveURL(/\/roteiros$/);
    await expect(page.getByText("Roteiro descartável")).toHaveCount(0);
  });

  test("adiciona um ponto ao roteiro direto da página do ponto", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro de destino");

    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(PARQUE) }).click();

    await page.getByLabel("Roteiro", { exact: true }).selectOption({ label: "Roteiro de destino" });
    await page.getByRole("button", { name: "Adicionar ao roteiro" }).click();
    await expect(page.getByText("Ponto adicionado ao roteiro.")).toBeVisible();
  });
});

test.describe("roteiro sugerido", () => {
  test("gera um roteiro com horários e salva com todas as paradas", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/roteiros/gerar");

    await page.getByLabel("Cidade *").fill("Joinville");
    await page.getByLabel("Tempo disponível (horas)").fill("8");
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    await expect(page.getByRole("heading", { name: "Roteiro sugerido", exact: true })).toBeVisible();

    const paradas = page.locator(".paradas .parada");
    await expect(paradas.first()).toBeVisible();
    expect(await paradas.count()).toBeGreaterThanOrEqual(2);

    // Cada parada mostra a janela de horário estimada (ex.: 09:00 – 10:30).
    await expect(page.locator(".parada__horario").first()).toContainText(/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/);

    const nomes = await page.locator(".paradas .parada h3").allTextContents();

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
    await expect(page.getByRole("heading", { name: "Roteiro em Joinville", level: 1 })).toBeVisible();

    expect(await page.locator(".parada__card h3").allTextContents()).toEqual(nomes);
  });

  test("início definido pelo usuário muda os horários do roteiro", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/roteiros/gerar");

    await page.getByLabel("Cidade *").fill("Joinville");

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const data = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;
    await page.getByLabel(/Início do passeio/).fill(`${data}T10:00`);

    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    await expect(page.locator(".parada__horario").first()).toContainText("10:00");
  });

  test("cidade sem pontos explica que nada foi encontrado", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/roteiros/gerar");

    await page.getByLabel("Cidade *").fill("Cidade Inexistente");
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    await expect(page.getByRole("alert")).toContainText(/Nenhum ponto/);
  });
});
