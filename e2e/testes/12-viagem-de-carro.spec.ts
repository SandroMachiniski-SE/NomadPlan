import { expect, test } from "@playwright/test";
import { emailUnico, SENHA_E2E } from "../suporte/ajudantes";

// Sede de Joinville/SC (IBGE 4209102): o GPS de mentira do navegador aponta para cá.
const EM_JOINVILLE = { latitude: -26.3045, longitude: -48.8487 };

test.describe("viagem de carro", () => {
  test("cadastro guarda onde a pessoa mora pelo GPS e o Perfil guarda o consumo do carro", async ({ browser }) => {
    const contexto = await browser.newContext({ permissions: ["geolocation"], geolocation: EM_JOINVILLE });
    const page = await contexto.newPage();

    await page.goto("/registrar");
    await page.getByLabel("Nome").fill("Pessoa da Estrada");
    await page.getByLabel("E-mail").fill(emailUnico("estrada"));
    await page.getByLabel(/^Senha/).fill(SENHA_E2E);
    await page.getByRole("button", { name: "Usar minha localização" }).click();
    await expect(page.getByLabel("Onde você mora (opcional)")).toHaveValue("Joinville, SC");
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    await page.goto("/perfil");
    await expect(page.getByLabel("Onde você mora")).toHaveValue("Joinville, SC");
    await page.getByLabel("Consumo do meu carro (km/l)").fill("11,5");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Perfil atualizado com sucesso.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Consumo do meu carro (km/l)")).toHaveValue("11,5");
    await expect(page.getByLabel("Onde você mora")).toHaveValue("Joinville, SC");

    await contexto.close();
  });

  test("a busca escolhe a cidade de casa no Perfil", async ({ page }) => {
    await page.goto("/registrar");
    await page.getByLabel("Nome").fill("Pessoa da Busca");
    await page.getByLabel("E-mail").fill(emailUnico("busca"));
    await page.getByLabel(/^Senha/).fill(SENHA_E2E);
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    await page.goto("/perfil");
    await page.getByLabel("Onde você mora").fill("Brasília");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("button", { name: "Brasília, DF" }).click();
    await expect(page.getByLabel("Onde você mora")).toHaveValue("Brasília, DF");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Perfil atualizado com sucesso.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Onde você mora")).toHaveValue("Brasília, DF");
  });
});
