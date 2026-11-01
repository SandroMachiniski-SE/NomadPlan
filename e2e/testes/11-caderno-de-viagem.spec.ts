import { expect, test } from "@playwright/test";
import { cadastrar } from "../suporte/ajudantes";

// Roteiro como um caderno de viagem: atividades livres, período do dia, onde dormir e
// viagem por mais de uma cidade.
const MUSEU = "Museu Nacional da Imigração E2E";
const MIRANTE = "Mirante do Vale E2E";

test.describe("caderno de viagem", () => {
  test("monta o dia com atividade livre, período, ponto e onde dormir", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/roteiros/novo");
    await page.getByLabel("Nome *").fill("Caderno de viagem");
    await page.getByRole("button", { name: "Criar roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);

    await page.getByRole("button", { name: "Atividade livre" }).click();
    await page.getByLabel("O que fazer *").fill("Rolê pelo centro histórico");
    await page.getByLabel(/Período/).selectOption("MANHA");
    await page.getByRole("button", { name: "Adicionar atividade" }).click();
    await expect(page.locator(".parada--atividade", { hasText: "Rolê pelo centro histórico" })).toContainText("Manhã");

    await page.getByRole("button", { name: "Ponto turístico", exact: true }).click();
    await page.getByLabel("Ponto turístico *").selectOption({ label: `${MUSEU} - Joinville` });
    await page.getByRole("button", { name: "Adicionar ponto" }).click();
    await expect(page.locator(".parada", { hasText: MUSEU })).toBeVisible();

    await page.getByRole("button", { name: "Onde dormir" }).click();
    await page.getByLabel("Onde vai dormir").fill("Acampamento na serra");
    await page.getByRole("button", { name: "Definir onde dormir" }).click();
    await expect(page.locator(".pernoite")).toContainText("Acampamento na serra");

    // A atividade sai pelo botão de remover, como as outras paradas.
    page.once("dialog", (dialogo) => dialogo.accept());
    await page.locator(".parada--atividade").getByRole("button", { name: "Remover" }).click();
    await expect(page.locator(".parada--atividade")).toHaveCount(0);
  });

  test("gera e salva um roteiro que passa por duas cidades", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/roteiros/gerar");

    await page.getByLabel("Cidade *").fill("Joinville");
    await page.getByRole("button", { name: "Adicionar outra cidade" }).click();
    await page.getByLabel("Depois, cidade 2").fill("Blumenau");
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    await expect(page.getByText(/Viagem de Joinville para Blumenau/)).toBeVisible();
    await expect(page.locator(".dia", { hasText: "Blumenau" })).toContainText(MIRANTE);

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
    await expect(page.locator(".roteiro-meta")).toContainText("Joinville → Blumenau");
    await expect(page.locator(".dia__viagem")).toContainText("Viagem de Joinville para Blumenau");
  });
});
