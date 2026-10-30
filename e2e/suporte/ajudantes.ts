import { expect, type Page } from "@playwright/test";
import { CONTAS_E2E, SENHA_E2E } from "../../backend/src/scripts/contasE2e";

export { CONTAS_E2E, SENHA_E2E };

let contador = 0;

/** E-mail único por teste, para não esbarrar em cadastros de execuções anteriores. */
export function emailUnico(prefixo = "pessoa"): string {
  contador += 1;
  return `${prefixo}.${Date.now()}.${contador}@e2e.test`;
}

export async function entrar(page: Page, email: string, senha: string = SENHA_E2E) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function entrarComo(page: Page, conta: keyof typeof CONTAS_E2E) {
  await entrar(page, CONTAS_E2E[conta].email);
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
}

export async function sair(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
}

/** Cadastra uma conta nova pela tela e deixa a pessoa logada. */
export async function cadastrar(
  page: Page,
  dados: { nome?: string; email?: string; senha?: string; tipo?: string } = {},
) {
  const email = dados.email ?? emailUnico();

  await page.goto("/registrar");
  await page.getByLabel("Nome").fill(dados.nome ?? "Pessoa de Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel(/^Senha/).fill(dados.senha ?? SENHA_E2E);

  if (dados.tipo) {
    await page.getByLabel("Como você vai usar o NomadPlan?").selectOption(dados.tipo);
  }

  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

  return email;
}
