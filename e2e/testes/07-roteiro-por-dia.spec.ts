import { expect, test, type Page } from "@playwright/test";
import { cadastrar } from "../suporte/ajudantes";

const MUSEU = "Museu Nacional da Imigração E2E";
const PARQUE = "Parque da Cidade E2E";
const RESTAURANTE = "Restaurante Sabor Local E2E";
const MIRANTE = "Mirante do Vale E2E";

// Roteiro sem cidade: a lista para adicionar traz pontos de qualquer cidade (rótulo "nome - cidade").
async function criarRoteiro(page: Page, nome: string, datas?: { inicio: string; fim: string }) {
  await page.goto("/roteiros/novo");
  await page.getByLabel("Nome *").fill(nome);
  if (datas) {
    await page.getByLabel("Data de início").fill(datas.inicio);
    await page.getByLabel("Data de fim").fill(datas.fim);
  }
  await page.getByRole("button", { name: "Criar roteiro" }).click();
  await expect(page).toHaveURL(/\/roteiros\/\d+$/);
}

async function adicionar(page: Page, nome: string, dia?: string) {
  const cidade = nome === MIRANTE ? "Blumenau" : "Joinville";
  await page.getByLabel("Ponto turístico *").selectOption({ label: `${nome} - ${cidade}` });

  // O seletor de dia só existe quando o roteiro tem mais de um dia.
  const seletorDeDia = page.getByLabel("Dia da nova parada");
  if (dia && (await seletorDeDia.count()) > 0) await seletorDeDia.selectOption(dia);
  await page.getByRole("button", { name: "Adicionar ponto" }).click();
  await expect(page.locator(".parada__card", { hasText: nome })).toBeVisible();
}

const nomesDoDia = (page: Page, titulo: RegExp) =>
  page.locator(".dia", { has: page.getByRole("heading", { name: titulo }) }).locator(".parada__card h3 a").allTextContents();

test.describe("roteiro por dia", () => {
  test("monta um roteiro de vários dias, com datas, e move paradas entre os dias", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Viagem de três dias", { inicio: "2026-11-04", fim: "2026-11-06" });

    // O período define os dias: 04/11/2026 é quarta-feira.
    await expect(page.getByRole("heading", { name: /^Dia 1 · qua/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Dia 3 · sex/i })).toBeVisible();

    await adicionar(page, MUSEU, "1");
    await adicionar(page, PARQUE, "1");
    await adicionar(page, RESTAURANTE, "2");

    expect(await nomesDoDia(page, /^Dia 1/)).toEqual([MUSEU, PARQUE]);
    expect(await nomesDoDia(page, /^Dia 2/)).toEqual([RESTAURANTE]);
    await expect(page.locator(".dia", { has: page.getByRole("heading", { name: /^Dia 3/ }) })).toContainText("Nenhuma parada neste dia");

    // Mover o parque para o dia 3 pelo seletor da própria parada.
    await page.getByLabel(`Dia de ${PARQUE}`).selectOption("3");
    await expect.poll(() => nomesDoDia(page, /^Dia 3/)).toEqual([PARQUE]);
    expect(await nomesDoDia(page, /^Dia 1/)).toEqual([MUSEU]);

    // Subir/descer só vale dentro do dia: o restaurante ao dia 1 vai para o fim, e então sobe.
    await page.getByLabel(`Dia de ${RESTAURANTE}`).selectOption("1");
    await expect.poll(() => nomesDoDia(page, /^Dia 1/)).toEqual([MUSEU, RESTAURANTE]);
    await page.locator(".parada", { hasText: RESTAURANTE }).getByRole("button", { name: "Mover para cima" }).click();
    await expect.poll(() => nomesDoDia(page, /^Dia 1/)).toEqual([RESTAURANTE, MUSEU]);

    // O resumo da página conta os dias.
    await expect(page.getByText(/3 paradas · 3 dias/)).toBeVisible();
  });

  test("mostra tempo e distância entre paradas do mesmo dia, sem trecho na primeira parada", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro com trechos");
    await adicionar(page, MUSEU);
    await adicionar(page, PARQUE);

    const trechos = page.locator(".parada__trecho");

    await expect(trechos).toHaveCount(1);
    await expect(trechos.first()).toContainText(/≈ \d+ min · [\d,]+ (m|km) desde a parada anterior/);
    await expect(page.locator(".dia__cabecalho").first()).toContainText("de deslocamento");
  });

  test("o mapa numera as paradas, liga o trajeto e filtra por dia", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro no mapa");
    await adicionar(page, MUSEU, "1");
    await page.getByRole("button", { name: "Adicionar dia" }).click();
    await adicionar(page, PARQUE, "2");
    await adicionar(page, RESTAURANTE, "2");

    await expect(page.getByRole("heading", { name: "Mapa do roteiro" })).toBeVisible();
    await expect(page.locator(".marcador-numerado")).toHaveCount(3);

    // Só o dia 2 tem duas paradas, então só ele ganha uma linha de trajeto.
    await expect(page.locator('path.leaflet-interactive[d*="L"]')).toHaveCount(1);

    await page.getByRole("group", { name: "Dia no mapa" }).getByRole("button", { name: "Dia 2" }).click();
    await expect(page.locator(".marcador-numerado")).toHaveCount(2);

    await page.getByRole("group", { name: "Dia no mapa" }).getByRole("button", { name: "Todos" }).click();
    await expect(page.locator(".marcador-numerado")).toHaveCount(3);
  });

  test("otimiza a ordem pelo trajeto e avisa quando já está na melhor", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro para otimizar");

    // Partida no museu, depois o mirante (em Blumenau), e só então os pontos próximos do museu.
    await adicionar(page, MUSEU);
    await adicionar(page, MIRANTE);
    await adicionar(page, PARQUE);
    await adicionar(page, RESTAURANTE);

    await page.locator(".dia__cabecalho").getByRole("button", { name: "Otimizar ordem" }).click();
    await expect(page.getByText(/Ordem otimizada: o percurso ficou .* mais curto/)).toBeVisible();

    const nomes = await nomesDoDia(page, /^Dia 1/);

    expect(nomes[0]).toBe(MUSEU);
    expect(nomes[3]).toBe(MIRANTE);
    expect(new Set(nomes)).toEqual(new Set([MUSEU, MIRANTE, PARQUE, RESTAURANTE]));

    await page.locator(".dia__cabecalho").getByRole("button", { name: "Otimizar ordem" }).click();
    await expect(page.getByText("As paradas já estão na ordem de menor percurso.")).toBeVisible();

    // A otimização aparece no histórico e pode ser desfeita.
    await page.getByRole("button", { name: "Ver histórico" }).click();
    await expect(page.getByText("Ordem otimizada pelo trajeto")).toBeVisible();

    page.once("dialog", (dialogo) => dialogo.accept());
    await page.locator(".versao", { hasText: "Ordem otimizada pelo trajeto" }).getByRole("button", { name: "Restaurar" }).click();
    await expect.poll(() => nomesDoDia(page, /^Dia 1/)).toEqual([MUSEU, MIRANTE, PARQUE, RESTAURANTE]);
  });

  test("a página pública mostra os dias, os trechos e o mapa numerado", async ({ page, browser }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro público por dia", { inicio: "2026-11-04", fim: "2026-11-05" });
    await adicionar(page, MUSEU, "1");
    await adicionar(page, PARQUE, "1");
    await adicionar(page, RESTAURANTE, "2");

    await page.getByRole("button", { name: "Compartilhar" }).click();
    const link = await page.locator(".roteiro-link a").getAttribute("href");

    const anonimo = await browser.newContext();
    const publica = await anonimo.newPage();
    await publica.goto(link!);

    await expect(publica.getByRole("heading", { name: /^Dia 1 · qua/i })).toBeVisible();
    await expect(publica.getByRole("heading", { name: /^Dia 2 · qui/i })).toBeVisible();
    await expect(publica.locator(".parada__trecho")).toHaveCount(1);
    await expect(publica.locator(".marcador-numerado")).toHaveCount(3);
    await anonimo.close();
  });

  test("edita as datas do roteiro e os dias passam a mostrar o dia da semana", async ({ page }) => {
    await cadastrar(page);
    await criarRoteiro(page, "Roteiro sem datas");
    await adicionar(page, MUSEU);

    await expect(page.getByRole("heading", { name: "Dia 1", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Data de início").fill("2026-12-25");
    await page.getByLabel("Data de fim").fill("2026-12-26");
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page.getByRole("heading", { name: /^Dia 1 · sex/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Dia 2 · sáb/i })).toBeVisible();
  });
});
