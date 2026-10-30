import { expect, test, type Page } from "@playwright/test";
import { entrarComo } from "../suporte/ajudantes";

// Pontos importados do OpenStreetMap: créditos exigidos pelas licenças e convite para a
// comunidade completar o que a base aberta não tem (aqui, o horário).
const PONTO = "Fortaleza do OpenStreetMap E2E";

async function abrirPonto(page: Page) {
  await page.goto("/");
  await page.getByLabel("Cidade", { exact: true }).fill("Florianópolis");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("heading", { name: PONTO }).click();
  await expect(page.getByRole("heading", { name: PONTO, level: 1 })).toBeVisible();
}

test.describe("Dados reais do OpenStreetMap", () => {
  test("mostra o crédito da foto e a fonte dos dados", async ({ page }) => {
    await abrirPonto(page);

    const credito = page.getByRole("link", { name: "Foto: Autora de Teste (CC BY-SA 4.0), via Wikimedia Commons" });

    await expect(credito).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:Teste.jpg");
    await expect(page.getByRole("link", { name: "OpenStreetMap", exact: true })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/node/999999001",
    );
    await expect(page.getByRole("link", { name: "ODbL" })).toBeVisible();
    await expect(page.getByText("Última importação em 27/10/2026")).toBeVisible();

    // Visitante sem login vê que falta o horário, mas não tem como sugerir.
    await expect(page.getByText("Não informado").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Conhece o horário? Informe aqui" })).toHaveCount(0);
  });

  test("convida quem está logado a informar o horário que falta", async ({ page }) => {
    await entrarComo(page, "negocio");
    await abrirPonto(page);

    await page.getByRole("button", { name: "Conhece o horário? Informe aqui" }).click();

    await expect(page.getByLabel("Campo")).toHaveValue("horarioFuncionamento");
    await page.getByLabel("Novo valor").fill("Ter-Dom 9h-17h");
    await page.getByRole("button", { name: "Enviar sugestão" }).click();

    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Conhece o horário? Informe aqui" })).toHaveCount(0);
  });
});
