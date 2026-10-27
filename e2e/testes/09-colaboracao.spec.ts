import { expect, test, type Browser, type Page } from "@playwright/test";
import { cadastrar, emailUnico } from "../suporte/ajudantes";

const MUSEU = "Museu Nacional da Imigração E2E";
const PARQUE = "Parque da Cidade E2E";

async function novaPessoa(browser: Browser, nome: string, email?: string) {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  const enderecoEmail = await cadastrar(pagina, { nome, email });

  return { contexto, pagina, email: enderecoEmail };
}

async function criarRoteiro(page: Page, nome: string) {
  await page.goto("/roteiros/novo");
  await page.getByLabel("Nome *").fill(nome);
  await page.getByRole("button", { name: "Criar roteiro" }).click();
  await expect(page).toHaveURL(/\/roteiros\/\d+$/);
  const endereco = page.url();

  await page.getByLabel("Ponto turístico *").selectOption({ label: `${MUSEU} - Joinville` });
  await page.getByRole("button", { name: "Adicionar ponto" }).click();
  await expect(page.locator(".parada__card", { hasText: MUSEU })).toBeVisible();

  return endereco;
}

async function convidar(page: Page, email: string, papel: "Editor" | "Leitor") {
  const painel = page.getByRole("region", { name: "Quem participa" });
  await painel.getByLabel("E-mail para convidar").fill(email);
  await painel.getByLabel("Papel do convidado").selectOption({ label: papel });
  await painel.getByRole("button", { name: "Convidar" }).click();
  await expect(painel.getByText(/Convite enviado para/)).toBeVisible();
}

async function aceitarPrimeiroConvite(page: Page) {
  await page.goto("/roteiros");
  await page.getByRole("link", { name: /1 convite/ }).click();
  await expect(page).toHaveURL(/\/convites$/);
  await page.getByRole("button", { name: "Aceitar" }).click();
  await expect(page).toHaveURL(/\/roteiros\/\d+$/);
}

test.describe("roteiro colaborativo", () => {
  test("o dono convida um editor, que aceita, edita junto e não pode excluir nem compartilhar", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Dona Ana" });
    const endereco = await criarRoteiro(page, "Viagem em grupo");
    const edu = await novaPessoa(browser, "Edu Editor");

    await convidar(page, edu.email, "Editor");
    await expect(page.getByRole("region", { name: "Quem participa" }).getByText(/convite pendente/)).toBeVisible();

    await aceitarPrimeiroConvite(edu.pagina);
    await expect(edu.pagina.getByText(/De Dona Ana · você é editor/)).toBeVisible();
    await expect(edu.pagina.locator(".parada__card", { hasText: MUSEU })).toBeVisible();

    // Editor edita: adiciona uma parada e anota o custo.
    await edu.pagina.getByLabel("Ponto turístico *").selectOption({ label: `${PARQUE} - Joinville` });
    await edu.pagina.getByRole("button", { name: "Adicionar ponto" }).click();
    await expect(edu.pagina.locator(".parada__card", { hasText: PARQUE })).toBeVisible();

    // O dono vê a mudança e a lista de participantes.
    await page.goto(endereco);
    await expect(page.locator(".parada__card", { hasText: PARQUE })).toBeVisible();
    await expect(page.getByText("2 participantes")).toBeVisible();
    await expect(page.getByRole("region", { name: "Quem participa" }).getByText("Edu Editor")).toBeVisible();

    // O editor não tem como excluir, compartilhar nem convidar.
    await expect(edu.pagina.getByRole("button", { name: "Excluir" })).toHaveCount(0);
    await expect(edu.pagina.getByRole("button", { name: "Compartilhar" })).toHaveCount(0);
    await expect(edu.pagina.getByLabel("E-mail para convidar")).toHaveCount(0);
    await expect(edu.pagina.getByRole("button", { name: "Editar", exact: true })).toBeVisible();

    // O histórico mostra quem fez a alteração.
    await edu.pagina.getByRole("button", { name: "Ver histórico" }).click();
    await expect(edu.pagina.getByText(/por Edu Editor/)).toBeVisible();

    await edu.contexto.close();
  });

  test("o leitor só acompanha; quando o dono o promove, os controles aparecem", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Dona Bia" });
    const endereco = await criarRoteiro(page, "Roteiro para acompanhar");
    const lia = await novaPessoa(browser, "Lia Leitora");

    await convidar(page, lia.email, "Leitor");
    await aceitarPrimeiroConvite(lia.pagina);

    const p = lia.pagina;
    await expect(p.getByText(/você é leitor/)).toBeVisible();
    await expect(p.locator(".parada__card", { hasText: MUSEU })).toBeVisible();
    await expect(p.getByRole("button", { name: "Adicionar ponto" })).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Remover", exact: true })).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Observação e custo" })).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Otimizar todos os dias" })).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Salvar notas" })).toHaveCount(0);
    await expect(p.getByLabel("Novo item da checklist")).toHaveCount(0);

    // O dono promove a leitora a editora.
    await page.goto(endereco);
    await page.getByLabel("Papel de Lia Leitora").selectOption("EDITOR");
    await expect(page.getByLabel("Papel de Lia Leitora")).toHaveValue("EDITOR");

    await p.reload();
    await expect(p.getByText(/você é editor/)).toBeVisible();
    await expect(p.getByRole("button", { name: "Adicionar ponto" })).toBeVisible();

    await lia.contexto.close();
  });

  test("convite para quem ainda não tem conta espera até a pessoa se cadastrar com aquele e-mail", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Dona Cléo" });
    await criarRoteiro(page, "Convite antecipado");

    const email = emailUnico("novato");
    await convidar(page, email, "Editor");

    // A pessoa cria a conta depois, e o convite já a espera.
    const novato = await novaPessoa(browser, "Novato", email);
    await aceitarPrimeiroConvite(novato.pagina);
    await expect(novato.pagina.getByText(/De Dona Cléo/)).toBeVisible();

    await novato.contexto.close();
  });

  test("recusar um convite não dá acesso, e o dono pode cancelar convites pendentes", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Dona Dani" });
    const endereco = await criarRoteiro(page, "Convites recusados");
    const gui = await novaPessoa(browser, "Gui Convidado");

    await convidar(page, gui.email, "Leitor");

    await gui.pagina.goto("/convites");
    await expect(gui.pagina.getByText(/Dona Dani.* convidou você para acompanhar o roteiro/)).toBeVisible();
    await gui.pagina.getByRole("button", { name: "Recusar" }).click();
    await expect(gui.pagina.getByText("Nenhum convite pendente")).toBeVisible();

    await gui.pagina.goto(endereco);
    await expect(gui.pagina.getByText("Não foi possível carregar este roteiro.")).toBeVisible();

    // Um novo convite pode ser cancelado pelo dono antes de ser respondido.
    await page.reload();
    await convidar(page, gui.email, "Editor");
    const painel = page.getByRole("region", { name: "Quem participa" });
    await painel.locator("li", { hasText: gui.email }).getByRole("button", { name: "Cancelar" }).click();
    await expect(painel.getByText(/convite pendente/)).toHaveCount(0);

    await gui.pagina.goto("/convites");
    await expect(gui.pagina.getByText("Nenhum convite pendente")).toBeVisible();

    await gui.contexto.close();
  });

  test("o dono remove um participante e outro participante pode sair sozinho", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Dona Eli" });
    const endereco = await criarRoteiro(page, "Gestão de participantes");
    const [fabio, gabi] = [await novaPessoa(browser, "Fábio"), await novaPessoa(browser, "Gabi")];

    await convidar(page, fabio.email, "Editor");
    await aceitarPrimeiroConvite(fabio.pagina);
    await page.reload();
    await convidar(page, gabi.email, "Leitor");
    await aceitarPrimeiroConvite(gabi.pagina);

    // Gabi sai por conta própria.
    gabi.pagina.once("dialog", (dialogo) => dialogo.accept());
    await gabi.pagina.getByRole("button", { name: "Sair deste roteiro" }).click();
    await expect(gabi.pagina).toHaveURL(/\/roteiros$/);
    await expect(gabi.pagina.getByText("Gestão de participantes")).toHaveCount(0);

    // O dono remove o Fábio, que perde o acesso.
    await page.goto(endereco);
    page.once("dialog", (dialogo) => dialogo.accept());
    await page.getByRole("region", { name: "Quem participa" }).locator("li", { hasText: "Fábio" }).getByRole("button", { name: "Remover" }).click();
    await expect(page.getByRole("region", { name: "Quem participa" }).getByText("Fábio")).toHaveCount(0);

    await fabio.pagina.goto(endereco);
    await expect(fabio.pagina.getByText("Não foi possível carregar este roteiro.")).toBeVisible();

    await Promise.all([fabio.contexto.close(), gabi.contexto.close()]);
  });

  test("as alterações de um participante chegam aos outros sem recarregar a página", async ({ page, browser }) => {
    test.setTimeout(90_000);

    await cadastrar(page, { nome: "Dona Fê" });
    await criarRoteiro(page, "Atualização automática");
    const hugo = await novaPessoa(browser, "Hugo");

    await convidar(page, hugo.email, "Editor");
    await aceitarPrimeiroConvite(hugo.pagina);

    await hugo.pagina.getByLabel("Ponto turístico *").selectOption({ label: `${PARQUE} - Joinville` });
    await hugo.pagina.getByRole("button", { name: "Adicionar ponto" }).click();
    await expect(hugo.pagina.locator(".parada__card", { hasText: PARQUE })).toBeVisible();

    // A página da dona se atualiza sozinha (a cada ~15 s).
    await expect(page.locator(".parada__card", { hasText: PARQUE })).toBeVisible({ timeout: 40_000 });

    await hugo.contexto.close();
  });

  test("quem recebe o convite é avisado no sino de notificações", async ({ page, browser }) => {
    await cadastrar(page, { nome: "Dona Ivo" });
    await criarRoteiro(page, "Aviso no sino");
    const joana = await novaPessoa(browser, "Joana");

    await convidar(page, joana.email, "Editor");

    await joana.pagina.goto("/roteiros");
    await joana.pagina.getByRole("button", { name: /Notificações/ }).click();
    await expect(joana.pagina.getByText(/Dona Ivo convidou você para o roteiro "Aviso no sino"/)).toBeVisible();

    await joana.contexto.close();
  });
});
