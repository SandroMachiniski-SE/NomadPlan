import { expect, test, type Page } from "@playwright/test";
import { cadastrar, emailUnico, SENHA_E2E } from "../suporte/ajudantes";

// Sede de Joinville/SC (IBGE 4209102): o GPS de mentira do navegador aponta para cá.
const EM_JOINVILLE = { latitude: -26.3045, longitude: -48.8487 };

/** Conta nova com casa em Joinville (escolhida pela busca do Perfil). */
async function cadastrarEmJoinville(page: Page) {
  await cadastrar(page);
  await page.goto("/perfil");
  await page.getByLabel("Onde você mora").fill("Joinville");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Joinville, SC" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Perfil atualizado com sucesso.")).toBeVisible();
}

async function gerarDeCarro(page: Page, cidade: string, dias: number, { comVolta = false } = {}) {
  await page.goto("/roteiros/gerar");
  await page.getByLabel("Cidade *").fill(cidade);
  await page.getByLabel("Dias", { exact: true }).fill(String(dias));
  await page.getByLabel("Vou de carro saindo de casa").check();
  if (comVolta) await page.getByLabel("Planejar a volta").check();
  await expect(page.getByRole("textbox", { name: "Saindo de" })).toHaveValue("Joinville, SC");
  await page.getByRole("button", { name: "Gerar roteiro" }).click();
}

const cabecalhoDoDia1 = (page: Page) => page.getByRole("heading", { name: /^Dia 1 · Estrada · Joinville\/SC →/ });

async function trocarACidadeDaNoite1(page: Page) {
  const antes = await cabecalhoDoDia1(page).textContent();

  await page.getByRole("button", { name: "Trocar cidade" }).first().click();
  await page.locator(".pernoite-estrada__alternativas button").first().click();
  await expect.poll(() => cabecalhoDoDia1(page).textContent()).not.toBe(antes);
}

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

  test("gera Joinville → Brasília de carro, troca o pernoite e salva com a estrada no roteiro", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Brasília", 4);

    await expect(cabecalhoDoDia1(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Dia 2 · Estrada/ })).toBeVisible();
    await expect(page.getByText("Rotas: OSRM · dados © colaboradores do OpenStreetMap")).toBeVisible();

    await trocarACidadeDaNoite1(page);

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
    await expect(page.locator(".dia__viagem--estrada", { hasText: /Joinville\/SC → .+ · \d[\d.]* km/ }).first()).toBeVisible();
    await expect(page.locator(".pernoite", { hasText: "hotel a definir" }).first()).toBeVisible();
  });

  test("trocar a cidade de uma noite limpa o hotel escolhido e o roteiro ainda salva", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Brasília", 2);

    const hotel = page.locator(".pernoite-estrada select").first();
    await hotel.selectOption({ index: 1 });
    await expect(hotel).not.toHaveValue("");

    await trocarACidadeDaNoite1(page);
    await expect(page.locator(".pernoite-estrada select").first()).toHaveValue("");

    // Com o hotel antigo ainda escolhido, o servidor recusaria (ele não é da cidade nova).
    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
  });

  test("decisão de chegada vem marcada em esticar", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Goiânia", 1);

    await expect(page.getByLabel(/^Esticar e chegar hoje/)).toBeChecked();
    await expect(page.getByLabel(/^Dormir no caminho e chegar amanhã/)).not.toBeChecked();
  });

  test("viagem com volta mostra a estrada de volta e chega em casa", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Brasília", 2, { comVolta: true });

    await expect(cabecalhoDoDia1(page)).toBeVisible();
    // Ida nos dias 1 a 3, Brasília nos dias 4 e 5, volta do 6 ao 8 terminando em casa.
    await expect(page.getByRole("heading", { name: /^Dia 6 · Estrada · Brasília\/DF →/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Dia 8 · Estrada · .+ → Joinville\/SC/ })).toBeVisible();

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
    await expect(page.locator(".dia__viagem--estrada", { hasText: /→ Joinville\/SC/ })).toBeVisible();
  });

  test("combustível: pede consumo e preço, estima a viagem e entra no orçamento do roteiro", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await page.goto("/perfil");
    await page.getByLabel("Consumo do meu carro (km/l)").fill("12");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Perfil atualizado com sucesso.")).toBeVisible();

    await page.goto("/roteiros/gerar");
    await page.getByLabel("Cidade *").fill("Brasília");
    await page.getByLabel("Vou de carro saindo de casa").check();
    await expect(page.getByLabel("Consumo do carro (km/l)")).toHaveValue("12");
    await expect(page.getByText("Informe o consumo e o preço do litro para estimar o combustível")).toBeVisible();

    await page.getByLabel("Preço do litro (R$)").fill("6,29");
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    await expect(page.getByText(/^Combustível estimado: 1\.501 km · ~[\d.,]+ l · ~R\$/)).toBeVisible();
    await expect(cabecalhoDoDia1(page)).toContainText(/ l · ~R\$/);

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
    await expect(page.locator("#titulo-orcamento").locator("..").getByText("Combustível")).toBeVisible();
  });
});
