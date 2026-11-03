# Preparo automático do destino e lugares novos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A viagem de carro prepara sozinha a cidade de destino sem pontos, e qualquer conta pode cadastrar (com moderação) um lugar novo marcado no mapa da busca.

**Architecture:** O gerador chama o preparo sob demanda que já existe (`prepararCidade`) para as etapas sem pontos e devolve o andamento; o front acompanha e oferece "Gerar de novo". O cadastro de pontos perde a restrição de papel e ganha um limite de 20 pendentes; o mapa da busca abre o formulário com a posição clicada.

**Tech Stack:** Express + TypeScript + Prisma (backend), React 19 + react-leaflet (front), node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-destino-e-lugares-novos-design.md`

## Global Constraints

- Português em textos, nomes e comentários, no estilo do código vizinho. Commits sem nenhuma menção ao Claude; push e PR só com o OK do usuário.
- Não commitar `cd`, `logo 01.png`, `logo 02.png`, as deleções de logos, `docs/Relatorio-de-andamento-NomadPlan.pdf`; `git add` com caminhos explícitos.
- Nenhum teste usa a internet (`mapasFalsos.ts` no backend; no E2E, `NOMINATIM_URL`, `OSRM_URL` e agora `OVERPASS_URL` inacessíveis).
- Limite de pendentes: **20** (`RASCUNHO` + `PENDENTE_VERIFICACAO`), sem limite para `MODERADOR` e `ADMIN`.
- Verificações: `cd backend && npm run typecheck && npm test`; `cd frontend && npm run lint && npm run build`; `cd backend && npm run e2e:preparar && cd ../e2e && npx playwright test; echo "PLAYWRIGHT_EXIT=$?"`.

## Review Focus

- **Destino com poucos pontos, mas não zero** (1 ou 2): ainda conta como sem pontos (`< PONTOS_PARA_CIDADE_PRONTA`) e dispara o preparo; a cidade não fica "pronta" para sempre com 2 pontos. Teste na Task 1.
- **Duas etapas sem pontos e só 2 preparos simultâneos**: a terceira cidade recebe `ocupado`, não erro 500. Teste na Task 1.
- **Clique em cima de um pino ou do botão "Buscar nesta área"** não abre o balão de cadastro (só lugar vazio). Conferência na Task 4 (E2E clica num pino e não vê o balão).
- **Coordenada da URL inválida ou fora do mapa** (`?latitude=abc`): o formulário ignora e fica com os campos vazios, sem erro. Teste na Task 4 (E2E).
- **Autor tenta usar o lugar ainda em revisão num roteiro**: continua recusado (só publicados), com a mensagem de hoje. Teste na Task 3.

---

### Task 1: Preparo automático dos destinos na geração (backend)

**Files:**
- Modify: `backend/src/lib/viagemDeCarro.ts` (`prepararDestinosSemPontos`), `backend/src/routes/roteiros.routes.ts` (handler `/gerar`)
- Test: `backend/src/testes/integracao/viagemDeCarro.itest.ts`

**Interfaces:**
- Consumes: `pontosDaCidade`, `prepararCidade`, `PONTOS_PARA_CIDADE_PRONTA` (`cidadesSobDemanda.ts`), `EntradaDaViagem.etapas`.
- Produces:
  ```ts
  export interface PreparoDoDestino { cidade: string; uf: string; estado: "preparando" | "pronta" | "ocupado" }
  export async function prepararDestinosSemPontos(etapas: Municipio[], idUsuario: number): Promise<PreparoDoDestino[]>;
  // resposta de /roteiros/gerar: viagemDeCarro.preparos: PreparoDoDestino[]
  ```

- [ ] **Step 1: Write the failing tests** (Overpass falso com `elementosOverpass` de `mapasFalsos.ts` perto da sede)

```ts
it("destino sem pontos: a geração dispara o preparo e troca o aviso", async () => {
  // Joinville → Itajaí (estrada de 90 km), Itajaí sem pontos
  assert.deepEqual(r.corpo.viagemDeCarro.preparos, [{ cidade: "Itajaí", uf: "SC", estado: "preparando" }]);
  assert.ok(r.corpo.avisos.includes("Ainda não há pontos em Itajaí: começamos a preparar a cidade. Gere de novo em alguns minutos para ver os dias de passeio."));
  assert.ok(!r.corpo.avisos.some((a: string) => a.startsWith("Ainda não há pontos cadastrados")));
  // GET /cidades/preparar?cidade=Itajaí&uf=SC chega a "pronta"
});
it("destino com só 2 pontos também dispara o preparo", );
it("destino com pontos não dispara nada: preparos vazio", );
it("com os preparos simultâneos ocupados, a cidade vem como ocupado e com o outro aviso", /* 3 etapas sem pontos: a 3ª vem "ocupado" */);
```

- [ ] **Step 2: Run** `npx tsx --test --test-concurrency=1 src/testes/integracao/viagemDeCarro.itest.ts` — Expected: os novos falham.
- [ ] **Step 3: Implement** — no handler, depois de `planejarViagemDeCarro`: `const preparos = await prepararDestinosSemPontos(entrada.etapas, req.usuario!.id)`; troca os avisos do gerador que começam com `Ainda não há pontos cadastrados` pelos textos da spec 4.1 (um por cidade); `viagemDeCarro.preparos = preparos`. `situacao: "pronta"` de `prepararCidade` vira `estado: "pronta"`.
- [ ] **Step 4: Run** `npm run typecheck && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: viagem de carro prepara sozinha a cidade de destino sem pontos"`.

### Task 2: Andamento do preparo e "Gerar de novo" (front)

**Files:**
- Modify: `frontend/src/types/viagem.ts` (`preparos`), `frontend/src/pages/GerarRoteiro.tsx`
- Create: `frontend/src/components/viagem/PreparoDoDestino.tsx`
- Modify: `backend/src/scripts/dadosViagemE2e.ts` (rota sintética Joinville → Itajaí de 95 km no cache e resumos do corredor), `e2e/playwright.config.ts` (`OVERPASS_URL: "http://127.0.0.1:9/api/interpreter"`), `e2e/testes/12-viagem-de-carro.spec.ts`

**Interfaces:**
- Consumes: `consultarPreparoDaCidade(cidade, uf)` (`services/cidades.ts`).
- Produces: `PreparoDoDestino.tsx` — props `{ cidade: string; uf: string; estadoInicial: "preparando" | "pronta" | "ocupado"; aoFicarPronta: () => void }`; consulta a cada 3 s enquanto `preparando` e para ao desmontar.

- [ ] **Step 1: Write the failing E2E test** — "viagem para cidade sem pontos avisa que começou a prepará-la": Joinville → Itajaí de carro mostra o aviso "Ainda não há pontos em Itajaí: começamos a preparar a cidade…" e o andamento ("Preparando Itajaí…" ou, com o Overpass inacessível do E2E, a mensagem de erro do preparo).
- [ ] **Step 2: Run** o E2E — Expected: FAIL.
- [ ] **Step 3: Implement** — cartão por preparo abaixo dos avisos; `pronta` → "{cidade} está pronta." + botão "Gerar de novo" (`gerar(escolhas, decisoes)`); erro → mensagem do preparo.
- [ ] **Step 4: Run** lint, build e o E2E inteiro — Expected: `PLAYWRIGHT_EXIT=0`.
- [ ] **Step 5: Commit** — `git commit -m "feat(front): andamento do preparo da cidade de destino na viagem de carro"`.

### Task 3: Qualquer conta cadastra pontos, com limite de pendentes (backend)

**Files:**
- Modify: `backend/src/routes/pontos.routes.ts` (`POST /`: sem `autorizar(...TIPOS_CADASTRADORES)`; limite)
- Test: `backend/src/testes/integracao/pontos.itest.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("visitante e morador cadastram pontos, que nascem rascunho", /* 201, status RASCUNHO — substitui o teste que esperava 403 */);
it("o 21º ponto esperando revisão dá 429", async () => {
  // 20 rascunhos/pendentes do mesmo visitante → o próximo POST /pontos: 429 e a mensagem da spec 5.1
});
it("moderador não tem limite de pendentes", );
it("ponto do autor ainda em revisão não entra no roteiro dele", /* POST /roteiros/:id/itens com o idPonto PENDENTE_VERIFICACAO → o mesmo erro de hoje (404) */);
```

- [ ] **Step 2: Run** — Expected: FAIL (o primeiro e o segundo).
- [ ] **Step 3: Implement** — contagem `prisma.pontoTuristico.count({ where: { idResponsavel, status: { in: [RASCUNHO, PENDENTE_VERIFICACAO] } } })` antes de criar, exceto `MODERADOR`/`ADMIN`; `TIPOS_CADASTRADORES` sai se não tiver outro uso.
- [ ] **Step 4: Run** `npm run typecheck && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: qualquer conta cadastra pontos, com moderacao e limite de 20 pendentes"`.

### Task 4: "Cadastrar um lugar aqui" no mapa da busca (front)

**Files:**
- Modify: `frontend/src/components/MapaPontos.tsx` (balão no clique, prop `autenticado`), `frontend/src/components/MapaCarregavel.tsx` (repassa o prop), `frontend/src/pages/Home.tsx`, `frontend/src/pages/PontoFormulario.tsx` (posição da URL + cidade pelo `cidadePerto`), `frontend/src/components/Layout.tsx` ("Meus pontos" para todos)
- Create: `e2e/testes/13-lugar-novo-no-mapa.spec.ts`
- Modify: `e2e/testes/03-cadastro-e-moderacao.spec.ts` se algum teste supõe que visitante não vê "Meus pontos"

- [ ] **Step 1: Write the failing E2E tests**

```ts
test("visitante marca um lugar no mapa da busca, envia para revisão e o moderador publica", async ({ page, browser }) => {
  // cadastrar(page); buscar Joinville; trocar para o mapa; clicar num ponto vazio do .leaflet-container
  // balão "Cadastrar um lugar aqui" → /pontos/novo?latitude=...&longitude=...
  // Latitude e Longitude preenchidas; Cidade "Joinville"; aviso "Posição marcada no mapa; confira antes de salvar."
  // nome "Mirante do Teste E2E", categoria; salvar; enviar para revisão
  // outra página: entrarComo moderador → /moderacao → aprovar → busca Joinville mostra "Mirante do Teste E2E"
});
test("sem login o balão pede para entrar", );
test("clicar num pino não abre o balão de cadastro", );
test("posição inválida na URL deixa os campos vazios", /* /pontos/novo?latitude=abc&longitude=-48 → Latitude vazia */);
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — `useMapEvents({ click })` só quando há `aoBuscarNestaArea`; `Popup` controlado na posição (6 casas); latitude/longitude da URL aceitas só se forem números em −90..90 e −180..180; cidade pelo `cidadePerto` quando vazia (ignora erro).
- [ ] **Step 4: Run** lint, build e o E2E inteiro — Expected: `PLAYWRIGHT_EXIT=0`.
- [ ] **Step 5: Commit** — `git commit -m "feat(front): cadastrar um lugar novo direto do mapa da busca"`.

### Task 5: Documentação e verificação final

**Files:** `docs/api.md` (`POST /pontos` para qualquer conta, `429` de pendentes, `viagemDeCarro.preparos`), `README.md` (linha de Contribuição da comunidade).

- [ ] **Step 1:** Atualizar os textos.
- [ ] **Step 2:** Verificação completa: `npm run typecheck`, `npm run test:cobertura` (≥ 60%), lint/build e E2E inteiro.
- [ ] **Step 3: Commit** — `git commit -m "docs: cadastro de lugares por qualquer conta e preparo automatico do destino"`.
- [ ] **Step 4:** Revisão final da branch e pedido de OK ao usuário para merge/push.
