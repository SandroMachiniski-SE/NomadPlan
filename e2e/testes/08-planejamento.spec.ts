import { expect, test, type Page } from "@playwright/test";
import { cadastrar } from "../suporte/ajudantes";

const MUSEU = "Museu Nacional da Imigração E2E";
const PARQUE = "Parque da Cidade E2E";

async function roteiroComParadas(page: Page, nome: string, paradas: string[]) {
  await page.goto("/roteiros/novo");
  await page.getByLabel("Nome *").fill(nome);
  await page.getByRole("button", { name: "Criar roteiro" }).click();
  await expect(page).toHaveURL(/\/roteiros\/\d+$/);

  for (const parada of paradas) {
    await page.getByLabel("Ponto turístico *").selectOption({ label: `${parada} - Joinville` });
    await page.getByRole("button", { name: "Adicionar ponto" }).click();
    await expect(page.locator(".parada__card", { hasText: parada })).toBeVisible();
  }
}

async function definirCusto(page: Page, parada: string, valor: string, observacao?: string) {
  const cartao = page.locator(".parada__card", { hasText: parada });
  await cartao.getByRole("button", { name: /Observação e custo|Editar detalhes/ }).click();
  await cartao.getByLabel(`Custo previsto de ${parada}`).fill(valor);
  if (observacao !== undefined) await cartao.getByLabel(/^Observação/).fill(observacao);
  await cartao.getByRole("button", { name: "Salvar", exact: true }).click();
}

test.describe("planejamento da viagem", () => {
  test("custo e observação por parada alimentam o orçamento por dia e total", async ({ page }) => {
    await cadastrar(page);
    await roteiroComParadas(page, "Viagem com orçamento", [MUSEU, PARQUE]);

    await definirCusto(page, MUSEU, "25,90", "Chegar cedo");
    const museu = page.locator(".parada__card", { hasText: MUSEU });
    await expect(museu.getByText(/R\$\s25,90/)).toBeVisible();
    await expect(museu.getByText("Chegar cedo")).toBeVisible();

    await definirCusto(page, PARQUE, "1.234,50");

    const painel = page.getByRole("region", { name: "Orçamento" });
    await expect(painel.getByTestId("orcamento-total")).toHaveText(/R\$\s1\.260,40/);
    await expect(painel.getByText(/Dia 1.*R\$\s1\.260,40/)).toBeVisible();
    await expect(page.locator(".dia__cabecalho").first()).toContainText(/R\$\s1\.260,40 previstos/);

    // Sem custos faltando, o aviso de paradas sem custo não aparece.
    await expect(painel.getByText(/sem custo/)).toHaveCount(0);
  });

  test("compara com o teto de gastos: sobra, estouro e remoção do teto", async ({ page }) => {
    await cadastrar(page);
    await roteiroComParadas(page, "Viagem com teto", [MUSEU]);
    await definirCusto(page, MUSEU, "25,90");

    const painel = page.getByRole("region", { name: "Orçamento" });

    await painel.getByLabel(/Teto de gastos/).fill("100");
    await painel.getByRole("button", { name: "Salvar teto" }).click();
    await expect(painel.getByText(/Ainda cabem R\$\s74,10 de R\$\s100,00/)).toBeVisible();
    await expect(painel.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "26");

    await painel.getByLabel(/Teto de gastos/).fill("20");
    await painel.getByRole("button", { name: "Salvar teto" }).click();
    await expect(painel.getByText(/Acima do teto em R\$\s5,90/)).toBeVisible();

    await painel.getByLabel(/Teto de gastos/).fill("");
    await painel.getByRole("button", { name: "Salvar teto" }).click();
    await expect(painel.getByRole("progressbar")).toHaveCount(0);
  });

  test("avisa quando há paradas sem custo e recusa valor inválido", async ({ page }) => {
    await cadastrar(page);
    await roteiroComParadas(page, "Viagem incompleta", [MUSEU, PARQUE]);
    await definirCusto(page, MUSEU, "10");

    await expect(page.getByRole("region", { name: "Orçamento" }).getByText(/1 parada ainda está sem custo/)).toBeVisible();

    const cartao = page.locator(".parada__card", { hasText: PARQUE });
    await cartao.getByRole("button", { name: "Observação e custo" }).click();
    await cartao.getByLabel(`Custo previsto de ${PARQUE}`).fill("abc");
    await cartao.getByRole("button", { name: "Salvar", exact: true }).click();

    await expect(cartao.getByRole("alert")).toContainText("Informe um valor válido");
  });

  test("checklist: adiciona, marca como feito, acompanha o progresso e remove", async ({ page }) => {
    await cadastrar(page);
    await roteiroComParadas(page, "Viagem com checklist", [MUSEU]);

    const lista = page.getByRole("region", { name: "Checklist" });

    for (const item of ["Passaporte", "Carregador"]) {
      await lista.getByLabel("Novo item da checklist").fill(item);
      await lista.getByRole("button", { name: "Adicionar" }).click();
      await expect(lista.getByText(item, { exact: true })).toBeVisible();
    }

    await expect(lista.getByText("0 de 2")).toBeVisible();

    await lista.getByRole("checkbox", { name: "Passaporte" }).check();
    await expect(lista.getByText("1 de 2")).toBeVisible();

    // O estado fica salvo ao recarregar.
    await page.reload();
    await expect(page.getByRole("region", { name: "Checklist" }).getByRole("checkbox", { name: "Passaporte" })).toBeChecked();

    await page.getByRole("region", { name: "Checklist" }).getByRole("button", { name: "Remover Carregador" }).click();
    await expect(page.getByRole("region", { name: "Checklist" }).getByText("Carregador")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Checklist" }).getByText("1 de 1")).toBeVisible();
  });

  test("notas ficam salvas e não aparecem na página pública", async ({ page, browser }) => {
    await cadastrar(page);
    await roteiroComParadas(page, "Viagem com notas", [MUSEU]);
    await page.locator(".parada__card", { hasText: MUSEU }).getByRole("button", { name: "Observação e custo" }).click();
    await page.locator(".parada__card", { hasText: MUSEU }).getByLabel(`Custo previsto de ${MUSEU}`).fill("33,33");
    await page.locator(".parada__card", { hasText: MUSEU }).getByRole("button", { name: "Salvar", exact: true }).click();

    const notas = page.getByRole("region", { name: "Notas" });
    await notas.getByLabel("Notas do roteiro").fill("Hotel: Rua das Flores, 123\nSenha do wifi: segredo123");
    await notas.getByRole("button", { name: "Salvar notas" }).click();
    await expect(notas.getByText("Notas salvas.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Notas" }).getByLabel("Notas do roteiro")).toHaveValue(/segredo123/);

    await page.getByRole("button", { name: "Compartilhar" }).click();
    const link = await page.locator(".roteiro-link a").getAttribute("href");

    const anonimo = await browser.newContext();
    const publica = await anonimo.newPage();
    await publica.goto(link!);

    await expect(publica.getByRole("heading", { name: MUSEU })).toBeVisible();
    await expect(publica.getByText("segredo123")).toHaveCount(0);
    await expect(publica.getByText(/33,33/)).toHaveCount(0);
    await expect(publica.getByText("Orçamento")).toHaveCount(0);
    await anonimo.close();
  });
});
