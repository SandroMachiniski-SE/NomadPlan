import { expect, test } from "@playwright/test";
import { cadastrar, CONTAS_E2E, emailUnico, entrar, entrarComo, sair, SENHA_E2E } from "../suporte/ajudantes";

test.describe("cadastro, login e sessão", () => {
  test("cria a conta com aceite da política, sai e entra de novo", async ({ page }) => {
    const email = await cadastrar(page, { nome: "Maria Souza" });

    await expect(page).toHaveURL(/\/roteiros$/);
    await expect(page.getByText("Maria Souza")).toBeVisible();

    await sair(page);
    await entrar(page, email);

    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("não deixa criar a conta sem aceitar a Política de Privacidade", async ({ page }) => {
    await page.goto("/registrar");
    await page.getByLabel("Nome").fill("Sem Aceite");
    await page.getByLabel("E-mail").fill(emailUnico("semaceite"));
    await page.getByLabel(/^Senha/).fill(SENHA_E2E);

    // O navegador barra o envio porque a caixa é obrigatória.
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/registrar$/);
    await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);
  });

  test("avisa quando o e-mail já está cadastrado", async ({ page }) => {
    await page.goto("/registrar");
    await page.getByLabel("Nome").fill("Repetida");
    await page.getByLabel("E-mail").fill(CONTAS_E2E.admin.email);
    await page.getByLabel(/^Senha/).fill(SENHA_E2E);
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByRole("alert")).toContainText("Já existe uma conta");
  });

  test("mostra erro com senha errada e não revela se o e-mail existe", async ({ page }) => {
    await entrar(page, CONTAS_E2E.negocio.email, "senha-errada-123");

    await expect(page.getByRole("alert")).toContainText("E-mail ou senha inválidos");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("área restrita leva ao login e volta para onde a pessoa queria ir", async ({ page }) => {
    await page.goto("/roteiros/gerar");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("E-mail").fill(CONTAS_E2E.negocio.email);
    await page.getByLabel("Senha").fill(SENHA_E2E);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/roteiros\/gerar$/);
  });

  test("perfis sem permissão não acessam moderação nem administração", async ({ page }) => {
    await entrarComo(page, "negocio");

    await page.goto("/moderacao");
    await expect(page.getByText("Você não tem permissão para acessar esta página.")).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByText("Você não tem permissão para acessar esta página.")).toBeVisible();
  });

  test("a política de privacidade é pública", async ({ page }) => {
    await page.goto("/privacidade");

    await expect(page.getByRole("heading", { name: "Política de Privacidade", level: 1 })).toBeVisible();
    await expect(page.getByText("Seus direitos")).toBeVisible();
  });

  test("recuperação de senha responde sem revelar quais e-mails existem", async ({ page }) => {
    await page.goto("/esqueci-senha");
    await page.getByLabel("E-mail").fill("ninguem@e2e.test");
    await page.getByRole("button", { name: /Enviar/ }).click();

    await expect(page.getByText(/Se houver uma conta/)).toBeVisible();
  });
});
