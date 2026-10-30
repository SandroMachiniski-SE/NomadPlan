import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { cadastrar, emailUnico, entrar, entrarComo, SENHA_E2E } from "../suporte/ajudantes";

const API = "http://localhost:3350";

async function criarContaPelaApi(request: APIRequestContext, nome: string) {
  const email = emailUnico("conta");
  const resposta = await request.post(`${API}/auth/registrar`, {
    data: { nome, email, senha: SENHA_E2E, aceitouPolitica: true },
  });

  expect(resposta.status()).toBe(201);

  return email;
}

test.describe("painel administrativo", () => {
  test("mostra métricas, usuários ativos e o uso diário", async ({ page }) => {
    await cadastrar(page);
    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).fill("Joinville");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("heading", { name: /\d+ resultados?/ })).toBeVisible();
    await page.getByRole("button", { name: "Sair" }).click();

    await entrarComo(page, "admin");
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
    await expect(page.getByText("Ativos nos últimos 7 dias")).toBeVisible();
    await expect(page.getByText("Pontos publicados")).toBeVisible();

    // O gráfico de uso conta as buscas e cadastros feitos acima.
    const buscas = page.locator(".uso__linha", { hasText: "Buscas" });
    await expect(buscas.locator(".uso__total")).not.toHaveText("0");
    await expect(page.locator(".uso__linha", { hasText: "Cadastros" }).locator(".uso__total")).not.toHaveText("0");

    await page.getByRole("button", { name: "7 dias" }).click();
    await expect(page.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
  });

  test("exporta o uso diário em CSV", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto("/admin");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    const arquivo = await download;

    expect(arquivo.suggestedFilename()).toMatch(/^uso-nomadplan-\d+d\.csv$/);

    const csv = await readFile((await arquivo.path())!, "utf-8");
    expect(csv.split("\n")[0]).toBe("dia,busca,roteiro_gerado,roteiro_criado,cadastro,login,avaliacao,ponto_cadastrado,ponto_salvo");
  });

  test("altera o papel de uma conta e o novo acesso vale na hora", async ({ page, request, browser }) => {
    const email = await criarContaPelaApi(request, "Futura Moderadora");

    const contexto = await browser.newContext();
    const paginaDela = await contexto.newPage();
    await entrar(paginaDela, email);
    await expect(paginaDela.getByRole("link", { name: "Moderação" })).toHaveCount(0);

    await entrarComo(page, "admin");
    await page.goto("/admin");
    await page.getByLabel("Papel de Futura Moderadora").selectOption("MODERADOR");
    await expect(page.getByLabel("Papel de Futura Moderadora")).toHaveValue("MODERADOR");

    await paginaDela.goto("/moderacao");
    await expect(paginaDela.getByRole("heading", { name: "Moderação", level: 1 })).toBeVisible();

    await contexto.close();
  });

  test("desativar uma conta derruba a sessão dela; reativar devolve o acesso", async ({ page, request, browser }) => {
    const email = await criarContaPelaApi(request, "Conta Temporária");

    const contexto = await browser.newContext();
    const paginaDela = await contexto.newPage();
    await entrar(paginaDela, email);
    await expect(paginaDela.getByRole("button", { name: "Sair" })).toBeVisible();

    await entrarComo(page, "admin");
    await page.goto("/admin");

    const linha = page.locator("tr", { hasText: "Conta Temporária" });
    page.once("dialog", (dialogo) => dialogo.accept());
    await linha.getByRole("button", { name: "Desativar" }).click();
    await expect(linha.getByText("Desativada", { exact: true })).toBeVisible();

    // Na próxima ação, a pessoa é levada ao login com o aviso de sessão expirada.
    await paginaDela.goto("/roteiros");
    await expect(paginaDela).toHaveURL(/\/login$/);
    await expect(paginaDela.getByText("Sua sessão expirou")).toBeVisible();

    // E não consegue entrar de novo enquanto estiver desativada.
    await entrar(paginaDela, email);
    await expect(paginaDela.getByRole("alert")).toContainText("desativada");

    await linha.getByRole("button", { name: "Reativar" }).click();
    await expect(linha.getByText("Ativa", { exact: true })).toBeVisible();

    await entrar(paginaDela, email);
    await expect(paginaDela.getByRole("button", { name: "Sair" })).toBeVisible();

    await contexto.close();
  });

  test("o administrador não tem controles sobre a própria conta", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto("/admin");

    const propria = page.locator("tr", { hasText: "admin@e2e.test" });
    await expect(propria.getByLabel("Papel de Admin E2E")).toBeDisabled();
    await expect(propria.getByRole("button", { name: "Desativar" })).toHaveCount(0);
  });

  test("o log de auditoria registra as ações administrativas", async ({ page, request }) => {
    await criarContaPelaApi(request, "Alvo da Auditoria");

    await entrarComo(page, "admin");
    await page.goto("/admin");
    await page.getByLabel("Papel de Alvo da Auditoria").selectOption("GESTOR");
    await expect(page.getByLabel("Papel de Alvo da Auditoria")).toHaveValue("GESTOR");

    await expect(page.locator("section", { hasText: "Log de auditoria" }).getByText("alterar_papel").first()).toBeVisible();
  });
});

test.describe("importação e exportação de pontos", () => {
  test("importa um GeoJSON e um CSV, relatando as linhas com erro", async ({ page }) => {
    const sufixo = Date.now();

    await entrarComo(page, "admin");
    await page.goto("/pontos/ferramentas");

    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-48.9, -26.5] },
          properties: { nome: `Importado GeoJSON ${sufixo}`, categoria: "Natureza", cidade: "Jaraguá do Sul", horarioFuncionamento: "Todos os dias, 24h" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-48.95, -26.55] },
          properties: { categoria: "Natureza", cidade: "Jaraguá do Sul" },
        },
      ],
    };

    await page.locator('input[type="file"]').setInputFiles({
      name: "pontos.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify(geojson)),
    });
    await page.getByRole("button", { name: "Importar", exact: true }).click();

    await expect(page.getByText("1 de 2 linhas importadas com sucesso.")).toBeVisible();
    await expect(page.getByText(/Linha 2:/)).toBeVisible();

    const csv = [
      "nome,categoria,cidade,latitude,longitude,horarioFuncionamento",
      `Importado CSV ${sufixo},Cultura,Jaraguá do Sul,-26.6,-49.0,Seg-Sex 9h-18h`,
    ].join("\n");

    await page.locator('input[type="file"]').setInputFiles({
      name: "pontos.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Importar", exact: true }).click();

    await expect(page.getByText("1 de 1 linhas importadas com sucesso.")).toBeVisible();

    // Os pontos entram como rascunho, na lista do responsável.
    await page.goto("/pontos/meus");
    await expect(page.getByRole("heading", { name: `Importado GeoJSON ${sufixo}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Importado CSV ${sufixo}` })).toBeVisible();
  });

  test("baixa os modelos de importação e exporta o inventário", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto("/pontos/ferramentas");

    const modeloCsv = page.waitForEvent("download");
    await page.getByRole("button", { name: "Modelo CSV" }).click();
    expect((await modeloCsv).suggestedFilename()).toBe("modelo-importacao.csv");

    const modeloGeojson = page.waitForEvent("download");
    await page.getByRole("button", { name: "Modelo GeoJSON" }).click();
    expect((await modeloGeojson).suggestedFilename()).toBe("modelo-importacao.geojson");

    const exportacao = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar GeoJSON" }).click();
    const arquivo = await exportacao;
    const conteudo = JSON.parse(await readFile((await arquivo.path())!, "utf-8"));

    expect(conteudo.type).toBe("FeatureCollection");
    expect(conteudo.features.length).toBeGreaterThanOrEqual(4);
  });

  test("recusa arquivo acima de 2 MB antes de enviar", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto("/pontos/ferramentas");

    await page.locator('input[type="file"]').setInputFiles({
      name: "grande.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 10, "a"),
    });

    await expect(page.getByRole("alert")).toContainText("excede 2 MB");
    await expect(page.getByRole("button", { name: "Importar", exact: true })).toBeDisabled();
  });
});
