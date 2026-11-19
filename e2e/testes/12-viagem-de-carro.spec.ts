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

  test("decisão de chegada vem marcada em dormir no caminho, sem passar do limite", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Goiânia", 1);

    await expect(page.getByLabel(/^Dormir no caminho e chegar amanhã/)).toBeChecked();
    await expect(page.getByLabel(/^Esticar e chegar hoje/)).not.toBeChecked();
  });

  test("viagem com volta mostra a estrada de volta e chega em casa", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Brasília", 2, { comVolta: true });

    await expect(cabecalhoDoDia1(page)).toBeVisible();
    // Ida nos dias 1 a 3, Brasília nos dias 4 e 5, volta do 6 ao 9 terminando em casa: no fim da volta
    // sobra pouco mais que a faixa do alvo, e o padrão é dormir antes em vez de passar do limite.
    await expect(page.getByRole("heading", { name: /^Dia 6 · Estrada · Brasília\/DF →/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Dia 9 · Estrada · .+ → Joinville\/SC/ })).toBeVisible();

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

  test("preço com R$ e km com vírgula são entendidos", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await page.goto("/roteiros/gerar");
    await page.getByLabel("Cidade *").fill("Brasília");
    await page.getByLabel("Vou de carro saindo de casa").check();
    await page.getByLabel("Alvo por dia (km)").fill("500,4");
    await page.getByLabel("Consumo do carro (km/l)").fill("12");
    await page.getByLabel("Preço do litro (R$)").fill("R$ 6,29");
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    await expect(page.getByText(/^Combustível estimado: 1\.501 km · ~[\d.,]+ l · ~R\$/)).toBeVisible();
    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
  });

  test("horas, consumo e preço fora da faixa dizem o que corrigir", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await page.goto("/roteiros/gerar");
    await page.getByLabel("Cidade *").fill("Brasília");
    await page.getByLabel("Vou de carro saindo de casa").check();
    const gerar = page.getByRole("button", { name: "Gerar roteiro" });

    await page.getByLabel(/^No máximo \(horas ao volante\)/).fill("1");
    await gerar.click();
    await expect(page.getByText("O máximo de horas ao volante vai de 2 a 14.")).toBeVisible();

    await page.getByLabel(/^No máximo \(horas ao volante\)/).fill("");
    await page.getByLabel("Consumo do carro (km/l)").fill("doze");
    await gerar.click();
    await expect(page.getByText("O consumo do carro vai de 3 a 40 km/l.")).toBeVisible();

    await page.getByLabel("Consumo do carro (km/l)").fill("12");
    await page.getByLabel("Preço do litro (R$)").fill("62,90");
    await gerar.click();
    await expect(page.getByText("O preço do litro vai de R$ 1,00 a R$ 20,00.")).toBeVisible();
  });

  test("mudar a decisão de chegada não deixa um hotel que já não vale e o roteiro salva", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Goiânia", 1);
    const hotel = page.locator(".pernoite-estrada select").first();
    await hotel.selectOption({ index: 1 });

    await page.getByLabel(/^Esticar e chegar hoje/).click();
    await expect(page.getByLabel(/^Esticar e chegar hoje/)).toBeChecked();
    await expect(page.locator(".pernoite-estrada select").first()).toBeVisible();

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
  });

  test("viagem para cidade sem pontos avisa que começou a prepará-la e mostra o andamento", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Itajaí", 1);

    await expect(
      page.getByText("Ainda não há pontos em Itajaí: começamos a preparar a cidade. Gere de novo em alguns minutos"),
    ).toBeVisible();
    // No E2E o Overpass não responde: o preparo termina com a mensagem do servidor de mapas.
    await expect(page.locator(".preparo-destino", { hasText: "Itajaí" })).toContainText("servidor de mapas está ocupado");

    // Gerar de novo logo depois não baixa a cidade outra vez: o cartão e o aviso dizem que falhou.
    await page.getByRole("button", { name: "Gerar roteiro" }).click();
    await expect(page.getByText("Não foi possível preparar Itajaí agora; tente de novo em alguns minutos.")).toBeVisible();
    await expect(page.locator(".preparo-destino", { hasText: "Itajaí" })).toContainText("Não foi possível preparar Itajaí");
    await expect(page.locator(".preparo-destino", { hasText: "Preparando" })).toHaveCount(0);
  });

  test("sem viagem de carro, a cidade sem pontos também é preparada e o cartão mostra o andamento", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await page.goto("/roteiros/gerar");
    await page.getByLabel("Cidade *").fill("Itajaí");
    await page.getByLabel("Dias", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    // No E2E o servidor de mapas não responde: o cartão termina dizendo que não deu, sem a lista de cidades.
    await expect(page.locator(".preparo-destino", { hasText: "Itajaí" })).toBeVisible();
    await expect(page.getByText(/Ainda não há pontos cadastrados/)).toHaveCount(0);
  });

  test("preparo que o servidor esqueceu (reinício) para de consultar e oferece gerar de novo", async ({ page }) => {
    await cadastrarEmJoinville(page);
    // A geração disse "preparando" e depois o servidor reiniciou: o andamento passa a dar 404.
    await page.route("**/roteiros/gerar", async (rota) => {
      if (rota.request().method() !== "POST") return rota.continue();

      const resposta = await rota.fetch();
      const corpo = await resposta.json();
      corpo.preparos = [{ cidade: "Itajaí", uf: "SC", estado: "preparando", pontos: 0 }];
      corpo.viagemDeCarro.preparos = corpo.preparos;
      await rota.fulfill({ response: resposta, json: corpo });
    });
    await page.route(
      (url) => url.pathname.endsWith("/cidades/preparar"),
      (rota) => rota.fulfill({ status: 404, json: { erro: "Esta cidade não está sendo preparada." } }),
    );
    await gerarDeCarro(page, "Itajaí", 1);

    const cartao = page.locator(".preparo-destino", { hasText: "Itajaí" });
    await expect(cartao).toContainText("Perdemos o andamento do preparo de Itajaí");

    // Enquanto gera de novo, o botão do cartão fica desligado.
    await page.unroute("**/roteiros/gerar");
    await page.route("**/roteiros/gerar", async (rota) => {
      if (rota.request().method() === "POST") await new Promise((resolver) => setTimeout(resolver, 1500));
      await rota.continue();
    });
    await cartao.getByRole("button", { name: "Gerar de novo" }).click();
    await expect(cartao.getByRole("button", { name: "Gerar de novo" })).toBeDisabled();
  });
});

test.describe("no caminho: sugestões do gosto e o pernoite que a pessoa decide", () => {
  test("as sugestões no caminho seguem o gosto marcado e não entram na agenda", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await page.goto("/roteiros/gerar");
    await page.getByLabel("Cidade *").fill("Brasília");
    await page.getByLabel("Dias", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Natureza", exact: true }).click();
    await page.getByLabel("Vou de carro saindo de casa").check();
    await page.getByRole("button", { name: "Gerar roteiro" }).click();

    const sugestoes = page.getByRole("complementary", { name: "Sugestões no caminho do dia 1" });
    await expect(sugestoes.getByRole("link", { name: "Parque no caminho E2E" })).toBeVisible();
    await expect(sugestoes.getByRole("link", { name: "Museu no caminho E2E" })).toHaveCount(0);
    await expect(page.locator(".paradas").getByText("Parque no caminho E2E")).toHaveCount(0);

    // Em tela de celular nada passa da largura.
    await page.setViewportSize({ width: 390, height: 844 });
    await sugestoes.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("descartar a sugestão de pernoite mantém a viagem e o roteiro salvo marca o pernoite no caminho", async ({ page }) => {
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Brasília", 1);

    await page.getByRole("button", { name: "Descartar sugestão de pernoite" }).first().click();
    await expect(page.getByText(/Sugestão de pernoite descartada/)).toBeVisible();
    await expect(cabecalhoDoDia1(page)).toBeVisible();

    await page.getByRole("button", { name: "Salvar como meu roteiro" }).click();
    await expect(page).toHaveURL(/\/roteiros\/\d+$/);
    await expect(page.getByText("Pernoite a escolher no caminho (sugestão descartada)")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pernoite a escolher no caminho (sugestão descartada)")).toBeVisible();
  });

  test("seguir até a próxima hospedagem só com aceite: recusar mantém a viagem e aceitar pede a nova divisão", async ({ page }) => {
    // Nos dados do E2E sempre há hotel perto do alvo: a primeira resposta ganha a proposta de seguir até o destino.
    const pedidos: { escolhas?: { perna: number; noite: number; codigoIbge: number }[] }[] = [];
    await page.route("**/roteiros/gerar", async (rota) => {
      // A página /roteiros/gerar do site também casa com o padrão: só o POST da API é alterado.
      if (rota.request().method() !== "POST") return rota.continue();

      const viagem = (rota.request().postDataJSON() as { viagemDeCarro?: (typeof pedidos)[number] }).viagemDeCarro ?? {};
      pedidos.push(viagem);
      const resposta = await rota.fetch();
      const corpo = await resposta.json();

      if (!viagem.escolhas?.length) {
        const pernoite = corpo.viagemDeCarro.pernas[0].trechos[0].pernoite;
        pernoite.aDefinir = true;
        pernoite.proximaOpcao = { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", kmDoDia: 1501, excedenteKm: 1001, destino: true };
      }

      await rota.fulfill({ response: resposta, json: corpo });
    });
    await cadastrarEmJoinville(page);
    await gerarDeCarro(page, "Brasília", 1);

    const aceitar = page.getByRole("button", { name: "Aceitar seguir até Brasília" });
    await expect(aceitar).toBeVisible();
    await expect(page.getByText(/seriam 1\.501 km neste dia, 1\.001 km além do alvo/)).toBeVisible();

    await page.getByRole("button", { name: "Recusar e escolher no caminho" }).click();
    await expect(aceitar).toHaveCount(0);
    await expect(page.getByText(/Sugestão de pernoite descartada/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar como meu roteiro" })).toBeVisible();

    await page.getByRole("button", { name: "Rever a sugestão" }).click();
    const regerada = page.waitForResponse((r) => r.url().endsWith("/roteiros/gerar") && r.request().method() === "POST");
    await aceitar.click();
    await regerada;

    expect(pedidos.length).toBe(2);
    expect(pedidos[1].escolhas).toEqual([{ perna: 0, noite: 1, codigoIbge: 5300108 }]);
  });
});
