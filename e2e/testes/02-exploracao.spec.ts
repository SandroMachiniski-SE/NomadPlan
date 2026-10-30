import { expect, test, type Page } from "@playwright/test";
import { cadastrar } from "../suporte/ajudantes";

const MUSEU = "Museu Nacional da Imigração E2E";
const PARQUE = "Parque da Cidade E2E";
const RESTAURANTE = "Restaurante Sabor Local E2E";
const MIRANTE = "Mirante do Vale E2E";

async function buscarCidade(page: Page, cidade: string) {
  await page.goto("/");
  await page.getByLabel("Cidade", { exact: true }).fill(cidade);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /\d+ resultados?/ })).toBeVisible();
}

test.describe("explorar pontos turísticos", () => {
  test("busca por cidade e mostra só os pontos de lá", async ({ page }) => {
    await buscarCidade(page, "Joinville");

    await expect(page.getByRole("heading", { name: MUSEU })).toBeVisible();
    await expect(page.getByRole("heading", { name: PARQUE })).toBeVisible();
    await expect(page.getByRole("heading", { name: RESTAURANTE })).toBeVisible();
    await expect(page.getByRole("heading", { name: MIRANTE })).toHaveCount(0);
  });

  test("filtra pela categoria escolhida nos botões do topo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Gastronomia" }).click();

    await expect(page.getByRole("heading", { name: RESTAURANTE })).toBeVisible();
    await expect(page.getByRole("heading", { name: PARQUE })).toHaveCount(0);
  });

  test("busca por palavra do nome ou da descrição", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Buscar por nome ou descrição").fill("trilhas");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page.getByRole("heading", { name: PARQUE })).toBeVisible();
    await expect(page.getByRole("heading", { name: MUSEU })).toHaveCount(0);
  });

  test("mostra aviso de nenhum resultado", async ({ page }) => {
    await buscarCidade(page, "Cidade Que Nao Existe");

    await expect(page.getByText("Nenhum ponto turístico encontrado")).toBeVisible();
  });

  test("detalhes do ponto trazem informações, mapa e selo de verificado", async ({ page }) => {
    await buscarCidade(page, "Joinville");
    await page.getByRole("link", { name: new RegExp(MUSEU) }).click();

    await expect(page.getByRole("heading", { name: MUSEU, level: 1 })).toBeVisible();
    await expect(page.getByText("Local verificado")).toBeVisible();
    await expect(page.getByText("Rampa e elevador")).toBeVisible();
    await expect(page.getByRole("link", { name: "Como chegar" })).toBeVisible();
  });

  test("visitante sem login não vê o botão de favoritar nem o de avaliar", async ({ page }) => {
    await buscarCidade(page, "Joinville");

    await expect(page.getByRole("button", { name: "Salvar nos favoritos" })).toHaveCount(0);

    await page.getByRole("link", { name: new RegExp(PARQUE) }).click();
    await expect(page.getByRole("heading", { name: "Deixe sua avaliação" })).toHaveCount(0);
  });

  test("salva nos favoritos, vê na lista e remove", async ({ page }) => {
    await cadastrar(page);
    await buscarCidade(page, "Blumenau");

    await page.getByRole("button", { name: "Salvar nos favoritos" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();

    await page.getByRole("link", { name: "Favoritos" }).first().click();
    await expect(page.getByRole("heading", { name: MIRANTE })).toBeVisible();

    await page.getByRole("button", { name: "Remover dos favoritos" }).click();
    await expect(page.getByText("Você ainda não salvou nenhum lugar")).toBeVisible();
  });

  test("os favoritos continuam salvos depois de recarregar a página", async ({ page }) => {
    await cadastrar(page);
    await buscarCidade(page, "Blumenau");
    await page.getByRole("button", { name: "Salvar nos favoritos" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();

    await page.reload();
    await page.getByLabel("Cidade", { exact: true }).fill("Blumenau");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();
  });

  test("avalia um ponto, a nota aparece e o filtro de nota mínima passa a considerá-la", async ({ page }) => {
    await cadastrar(page);
    await buscarCidade(page, "Joinville");
    await page.getByRole("link", { name: new RegExp(PARQUE) }).click();

    await page.getByRole("radio", { name: "4 estrelas" }).click();
    await page.getByLabel(/Comentário/).fill("Lugar ótimo para caminhar.");
    await page.getByRole("button", { name: "Enviar avaliação" }).click();

    await expect(page.getByText("Sua avaliação foi publicada")).toBeVisible();
    await expect(page.getByText("Lugar ótimo para caminhar.")).toBeVisible();
    await expect(page.getByText("1 avaliação")).toBeVisible();

    await buscarCidade(page, "Joinville");
    await page.getByText("Mais filtros").click();
    await page.getByLabel("Nota mínima").selectOption("4");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page.getByRole("heading", { name: PARQUE })).toBeVisible();
    await expect(page.getByRole("heading", { name: MUSEU })).toHaveCount(0);
  });

  test("a mesma pessoa não consegue avaliar o ponto duas vezes", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(RESTAURANTE) }).click();

    await page.getByRole("button", { name: "Enviar avaliação" }).click();
    await expect(page.getByText("Sua avaliação foi publicada")).toBeVisible();

    // O formulário some após o envio: recarregar a página e tentar de novo deve ser recusado.
    await page.reload();
    await page.getByRole("button", { name: "Enviar avaliação" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Você já avaliou este ponto." })).toBeVisible();
  });

  test("filtra por ordenação por nome", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
    await page.getByText("Mais filtros").click();
    await page.getByLabel("Ordenar por").selectOption("nome");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page.getByRole("heading", { name: /\d+ resultados?/ })).toBeVisible();
    await expect(page.locator(".grid-cards .ponto-card__titulo").first()).toBeVisible();

    const titulos = await page.locator(".grid-cards .ponto-card__titulo").allTextContents();
    const ordenados = [...titulos].sort((a, b) => a.localeCompare(b, "pt-BR"));

    expect(titulos.length).toBeGreaterThanOrEqual(3);
    expect(titulos).toEqual(ordenados);
  });
});
