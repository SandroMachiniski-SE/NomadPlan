import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { codigoTotp, passoDoTempo } from "../../backend/src/lib/totp";
import { cadastrar, emailUnico, entrar, SENHA_E2E, sair } from "../suporte/ajudantes";

test.describe("perfil", () => {
  test("salva nome, interesses, idioma e preferências de acessibilidade", async ({ page }) => {
    await cadastrar(page, { nome: "Nome Inicial" });
    await page.goto("/perfil");

    await page.getByLabel("Nome", { exact: true }).fill("Nome Atualizado");
    await page.getByLabel("Cidade base").fill("Joinville");
    await page.getByLabel("Idioma preferido").selectOption("en");
    await page.getByRole("button", { name: "Cultura" }).click();
    await page.getByRole("button", { name: "Mobilidade reduzida" }).click();
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page.getByText("Perfil atualizado com sucesso.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Nome Atualizado");
    await expect(page.getByLabel("Idioma preferido")).toHaveValue("en");
    await expect(page.getByRole("button", { name: "Cultura" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Mobilidade reduzida" })).toHaveAttribute("aria-pressed", "true");
  });

  test("recomendações usam os interesses e a cidade base do perfil", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/perfil");
    await page.getByLabel("Cidade base").fill("Joinville");
    await page.getByRole("button", { name: "Gastronomia" }).click();
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Perfil atualizado com sucesso.")).toBeVisible();

    await page.goto("/");

    const secao = page.getByRole("region", { name: "Recomendados para você" });
    await expect(secao.getByRole("heading", { name: "Restaurante Sabor Local E2E" })).toBeVisible();
    await expect(secao.getByText("Combina com seus interesses").first()).toBeVisible();
  });
});

test.describe("verificação em duas etapas", () => {
  test("ativa pelo perfil e passa a exigir o código no login", async ({ page }) => {
    const email = await cadastrar(page);
    await page.goto("/perfil");

    await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
    await expect(page.getByAltText("QR code para o aplicativo autenticador")).toBeVisible();

    const segredo = (await page.locator(".mfa-chave").textContent())!.trim();
    const passo = passoDoTempo(Date.now());

    await page.getByLabel("Código do aplicativo").fill(codigoTotp(segredo, passo));
    await page.getByRole("button", { name: "Confirmar e ativar" }).click();

    await expect(page.getByText("Verificação em duas etapas ativada.")).toBeVisible();
    await sair(page);

    // Login só com a senha pede o segundo fator.
    await entrar(page, email);
    await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();

    // O código já usado na ativação não vale de novo (proteção contra repetição).
    await page.getByLabel("Código do aplicativo").fill(codigoTotp(segredo, passo));
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("alert")).toContainText("inválido ou já utilizado");

    // Um código novo (próxima janela de 30 s) entra.
    await page.getByLabel("Código do aplicativo").fill(codigoTotp(segredo, passo + 1));
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("recusa ativar com código errado", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/perfil");

    await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
    await page.getByLabel("Código do aplicativo").fill("000000");
    await page.getByRole("button", { name: "Confirmar e ativar" }).click();

    await expect(page.getByRole("alert")).toContainText("Código inválido");
    await expect(page.getByText("Desativada")).toBeVisible();
  });
});

test.describe("privacidade (LGPD)", () => {
  test("baixa uma cópia dos próprios dados", async ({ page }) => {
    const email = await cadastrar(page, { nome: "Titular dos Dados" });
    await page.goto("/perfil");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar meus dados" }).click();
    const arquivo = await download;

    expect(arquivo.suggestedFilename()).toBe("meus-dados-nomadplan.json");

    const caminho = await arquivo.path();
    const conteudo = JSON.parse(await readFile(caminho, "utf-8"));

    expect(JSON.stringify(conteudo)).toContain(email);
    expect(JSON.stringify(conteudo)).not.toContain("senhaHash");
  });

  test("exclui a conta com a senha e não consegue mais entrar", async ({ page }) => {
    const email = await cadastrar(page);
    await page.goto("/perfil");

    await page.getByRole("button", { name: "Excluir conta" }).click();

    // Senha errada não exclui.
    await page.getByLabel("Confirme sua senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Excluir definitivamente" }).click();
    await expect(page.getByRole("alert")).toContainText("Senha incorreta");

    await page.getByLabel("Confirme sua senha").fill(SENHA_E2E);
    await page.getByRole("button", { name: "Excluir definitivamente" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);

    await entrar(page, email);
    await expect(page.getByRole("alert")).toContainText("E-mail ou senha inválidos");
  });

  test("conta antiga sem aceite vê o aviso e aceita a política", async ({ page, request }) => {
    const email = emailUnico("antiga");

    // Cria a conta pela API e apaga o consentimento direto no banco simulando uma conta
    // anterior à política: o aviso aparece para quem tem consentimentoEm vazio.
    const resposta = await request.post("http://localhost:3350/auth/registrar", {
      data: { nome: "Conta Antiga", email, senha: SENHA_E2E, aceitouPolitica: true },
    });
    expect(resposta.status()).toBe(201);

    execFileSync("npx", ["tsx", "src/scripts/limparConsentimentoE2e.ts", email], {
      cwd: "../backend",
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    await entrar(page, email);
    await expect(page.getByRole("region", { name: "Política de Privacidade" })).toBeVisible();

    await page.getByRole("button", { name: "Li e concordo" }).click();
    await expect(page.getByRole("region", { name: "Política de Privacidade" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("region", { name: "Política de Privacidade" })).toHaveCount(0);
  });
});
