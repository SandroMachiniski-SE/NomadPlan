import { expect, test, type Page } from "@playwright/test";
import { cadastrar, emailUnico, entrarComo, sair } from "../suporte/ajudantes";

// PNG 1x1 válido.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// Cada ponto ganha coordenadas a ~1 km dos anteriores: pontos a menos de 150 m um do outro
// são tratados como possíveis duplicados (RB05) e o cadastro pediria confirmação.
let deslocamento = 0;

async function preencherPonto(page: Page, nome: string, cidade = "Joinville", mesmoLugar = false) {
  if (!mesmoLugar) deslocamento += 1;

  await page.goto("/pontos/novo");
  await page.getByLabel("Nome *").fill(nome);
  await page.getByLabel("Categoria *").fill("Cultura");
  await page.getByLabel("Cidade *").fill(cidade);
  await page.getByLabel("Latitude").fill(String(-26.2 - deslocamento * 0.01));
  await page.getByLabel("Longitude").fill(String(-48.7 - deslocamento * 0.01));
  await page.getByLabel("Horário de funcionamento *").fill("Todos os dias, 24h");
}

test.describe("cadastro de pontos e moderação", () => {
  test("negócio cadastra o ponto, envia imagem e manda para publicação; moderadora aprova e ele aparece na busca", async ({ page }) => {
    const nome = `Casa de Cultura ${Date.now()}`;

    await entrarComo(page, "negocio");
    await preencherPonto(page, nome);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();

    await expect(page).toHaveURL(/\/pontos\/\d+\/editar$/);
    await expect(page.getByRole("heading", { name: "Editar ponto turístico" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Enviar imagem" }).click();
    await expect(page.locator("img.imagem-previa")).toBeVisible();

    await page.getByRole("button", { name: "Enviar para publicação" }).click();
    await expect(page.getByRole("button", { name: "Enviar para publicação" })).toHaveCount(0);

    // Enquanto está em análise, o público não vê o ponto.
    await sair(page);
    await page.goto("/");
    await page.getByLabel("Buscar por nome ou descrição").fill(nome);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByText("Nenhum ponto turístico encontrado")).toBeVisible();

    await entrarComo(page, "moderador");
    await page.goto("/moderacao");
    const item = page.locator("article", { hasText: nome });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Aprovar" }).click();
    await expect(item).toHaveCount(0);

    await sair(page);
    await page.goto("/");
    await page.getByLabel("Buscar por nome ou descrição").fill(nome);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();
  });

  test("o upload recusa arquivo que finge ser imagem, mostrando a mensagem do servidor", async ({ page }) => {
    await entrarComo(page, "negocio");
    await preencherPonto(page, `Ponto com upload ${Date.now()}`);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/editar$/);

    await page.locator('input[type="file"]').setInputFiles({
      name: "falsa.png",
      mimeType: "image/png",
      buffer: Buffer.from("isto é um texto, não uma imagem"),
    });
    await page.getByRole("button", { name: "Enviar imagem" }).click();

    await expect(page.getByRole("alert")).toContainText("Formato não suportado. Use JPG, PNG ou WEBP.");
  });

  test("o navegador avisa antes de enviar um formato que não é imagem", async ({ page }) => {
    await entrarComo(page, "negocio");
    await preencherPonto(page, `Ponto com pdf ${Date.now()}`);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/editar$/);

    await page.locator('input[type="file"]').setInputFiles({
      name: "documento.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });

    await expect(page.getByRole("alert")).toContainText("Formato não suportado");
    await expect(page.getByRole("button", { name: "Enviar imagem" })).toBeDisabled();
  });

  test("avisa de possível duplicado e permite cadastrar mesmo assim", async ({ page }) => {
    const nome = `Ponto repetido ${Date.now()}`;

    await entrarComo(page, "negocio");
    await preencherPonto(page, nome);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/editar$/);

    await preencherPonto(page, nome, "Joinville", true);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();

    await expect(page.getByText("Possíveis duplicados encontrados")).toBeVisible();

    await page.getByRole("button", { name: "Cadastrar mesmo assim" }).click();
    await expect(page).toHaveURL(/\/pontos\/\d+\/editar$/);
  });

  test("não envia para publicação sem horário de funcionamento", async ({ page }) => {
    page.on("dialog", (dialogo) => dialogo.dismiss());

    await entrarComo(page, "negocio");
    await page.goto("/pontos/novo");
    await page.getByLabel("Nome *").fill(`Sem horário ${Date.now()}`);
    await page.getByLabel("Categoria *").fill("Cultura");
    await page.getByLabel("Cidade *").fill("Joinville");
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/editar$/);

    const dialogo = page.waitForEvent("dialog");
    await page.getByRole("button", { name: "Enviar para publicação" }).click();

    expect((await dialogo).message()).toContain("horarioFuncionamento");
  });

  test("salvar a edição duas vezes seguidas não gera conflito de versão", async ({ page }) => {
    await entrarComo(page, "negocio");
    await preencherPonto(page, `Edição dupla ${Date.now()}`);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/editar$/);

    await page.getByLabel("Descrição").fill("Primeira versão do texto.");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Alterações salvas.")).toBeVisible();

    await page.getByLabel("Descrição").fill("Segunda versão do texto.");
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page.getByText("Alterações salvas.")).toBeVisible();
    await expect(page.getByText("foi alterado por outra pessoa")).toHaveCount(0);
  });

  test("moderadora rejeita um ponto com motivo e o responsável vê o motivo para corrigir", async ({ page }) => {
    const nome = `Ponto para rejeitar ${Date.now()}`;

    await entrarComo(page, "negocio");
    await preencherPonto(page, nome);
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page).toHaveURL(/\/editar$/);
    await page.getByRole("button", { name: "Enviar para publicação" }).click();
    await expect(page.getByRole("button", { name: "Enviar para publicação" })).toHaveCount(0);
    await sair(page);

    await entrarComo(page, "moderador");
    await page.goto("/moderacao");
    page.once("dialog", (dialogo) => dialogo.accept("Faltam fotos e descrição."));
    await page.locator("article", { hasText: nome }).getByRole("button", { name: "Rejeitar" }).click();
    await expect(page.locator("article", { hasText: nome })).toHaveCount(0);
    await sair(page);

    await entrarComo(page, "negocio");
    await page.goto("/pontos/meus");
    const cartao = page.locator("article", { hasText: nome });
    await expect(cartao).toContainText("Motivo da rejeição: Faltam fotos e descrição.");
    await expect(cartao.getByRole("link", { name: "Editar" })).toBeVisible();
  });

  test("avaliação com foto fica em análise até a moderadora aprovar", async ({ page }) => {
    const email = emailUnico("fotografa");
    await cadastrar(page, { nome: "Fotógrafa", email });

    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Blumenau");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("link", { name: /Mirante do Vale E2E/ }).click();

    await page.getByRole("radio", { name: "5 estrelas" }).click();
    await page.getByLabel(/Comentário/).fill("Vista incrível.");
    await page.locator('input[type="file"]').setInputFiles({ name: "vista.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Enviar avaliação" }).click();

    await expect(page.getByText(/passam por uma análise rápida/)).toBeVisible();
    await expect(page.getByText("Vista incrível.")).toHaveCount(0);
    await sair(page);

    await entrarComo(page, "moderador");
    await page.goto("/moderacao");
    const item = page.locator("article", { hasText: "Vista incrível." });
    await expect(item).toContainText("Contém foto (revisão obrigatória)");
    await expect(item.getByRole("img", { name: /Foto enviada por/ })).toBeVisible();
    await item.getByRole("button", { name: "Aprovar" }).click();
    await expect(item).toHaveCount(0);

    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Blumenau");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("link", { name: /Mirante do Vale E2E/ }).click();
    await expect(page.getByText("Vista incrível.")).toBeVisible();
    await expect(page.getByRole("img", { name: /Foto enviada por Fotógrafa/ })).toBeVisible();
  });

  test("sugestão de edição vai para a moderação e, aprovada, atualiza o ponto", async ({ page }) => {
    await cadastrar(page, { nome: "Colaboradora" });

    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("link", { name: /Restaurante Sabor Local E2E/ }).click();

    await page.getByRole("button", { name: "Sugerir edição" }).click();
    await page.getByLabel("Campo").selectOption("telefoneContato");
    await page.getByLabel("Novo valor").fill("(47) 3000-1234");
    await page.getByRole("button", { name: "Enviar sugestão" }).click();

    await expect(page.getByText(/Sugestão enviada para a moderação/)).toBeVisible();
    await sair(page);

    await entrarComo(page, "moderador");
    await page.goto("/moderacao");
    const item = page.locator("article", { hasText: "(47) 3000-1234" });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Aprovar" }).click();
    await expect(item).toHaveCount(0);

    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("link", { name: /Restaurante Sabor Local E2E/ }).click();
    await expect(page.getByText("(47) 3000-1234")).toBeVisible();
  });
});
