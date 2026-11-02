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

  test("as ações do ponto ficam logo abaixo do título e levam ao roteiro", async ({ page }) => {
    await cadastrar(page);
    await buscarCidade(page, "Joinville");
    await page.getByRole("link", { name: new RegExp(MUSEU) }).click();

    const acoes = page.getByRole("group", { name: "Ações do ponto" });

    await expect(acoes.getByRole("link", { name: "Como chegar" })).toBeVisible();
    await expect(acoes.getByRole("button", { name: "Salvar nos favoritos" })).toBeVisible();

    await acoes.getByRole("button", { name: "Adicionar a um roteiro" }).click();
    await expect(page.locator("#adicionar-ao-roteiro")).toBeInViewport();
  });

  test("a lista no mapa junta pinos próximos e mostra os lugares", async ({ page }) => {
    await buscarCidade(page, "Joinville");
    await page.getByRole("button", { name: "Mapa", exact: true }).click();

    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".marcador-pin, .marcador-grupo").first()).toBeVisible();
  });

  test("em tela larga a lista e o mapa ficam lado a lado e o cartão realça o pino", async ({ page }) => {
    await buscarCidade(page, "Joinville");

    const dividido = page.locator(".resultados-dividido");

    await expect(dividido.locator(".leaflet-container")).toBeVisible();
    await expect(dividido.locator(".ponto-card").first()).toBeVisible();
    await expect(dividido.getByRole("button", { name: /nesta área|Mova o mapa|Aproxime/ })).toBeVisible();

    await dividido.locator(".ponto-card").first().hover();
    await expect(page.locator(".marcador-pin--destaque, .marcador-grupo--destaque")).toHaveCount(1);
  });

  test("em tela estreita só a lista aparece, com o mapa em outra aba", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await buscarCidade(page, "Joinville");

    await expect(page.locator(".grid-cards .ponto-card").first()).toBeVisible();
    await expect(page.locator(".resultados-dividido")).toHaveCount(0);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
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

test.describe("explorar pelo mapa e escolher qualquer cidade", () => {
  test("o mapa livre começa afastado e só busca depois de aproximar da região", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Explorar pelo mapa" }).click();

    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aproxime o mapa para buscar" })).toBeDisabled();
  });

  test("o ícone de mapa no campo de destino abre o mapa, leva a página até ele e marca o botão", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Escolher o destino no mapa" }).click();

    await expect(page.locator(".leaflet-container")).toBeInViewport();
    await expect(page.getByRole("heading", { name: "Escolha onde você quer ir" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mapa aberto" })).toHaveAttribute("aria-pressed", "true");
  });

  test("o botão Explorar pelo mapa também rola até o mapa e vira Mapa aberto", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Explorar pelo mapa" }).click();

    await expect(page.locator(".leaflet-container")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Mapa aberto" })).toBeVisible();
  });

  test("a busca de cidade abre o painel e pede ao menos 2 letras", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Buscar outra cidade do Brasil" }).click();

    await expect(page.getByRole("heading", { name: "Qualquer cidade do Brasil" })).toBeVisible();
    await page.getByLabel("Nome da cidade").fill("a");
    await page.getByRole("button", { name: "Buscar cidade" }).click();

    await expect(page.getByText("Digite ao menos 2 letras do nome da cidade.")).toBeVisible();
  });

  test("sem resultados, a busca por cidade oferece procurar em todo o Brasil", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade Que Nao Existe");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page.getByRole("button", { name: /em todo o Brasil/ })).toBeVisible();
  });
});
