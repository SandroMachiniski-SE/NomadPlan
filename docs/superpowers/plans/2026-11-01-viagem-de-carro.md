# Viagem de carro com pernoites sugeridos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Planejar viagens de carro saindo da cidade de casa, divididas em dias por km (e horas) com pernoites sugeridos, combustível estimado e integração ao roteiro existente.

**Architecture:** Municípios do IBGE no PostGIS; rota pelo OSRM com cache e perfil de tempo; cidades candidatas por corredor em SQL; resumos de hospedagens/atrações pelo Overpass com cache; divisão em dias como função pura; um orquestrador monta as pernas e entrega ao gerador atual (`gerarRoteiroSugerido`) as etapas com o número do 1º dia e o tempo real de chegada. Front em React com componentes novos em `components/viagem/`.

**Tech Stack:** Express + TypeScript + Prisma 6 + PostgreSQL/PostGIS (backend), React 19 + Vite + react-leaflet (front), node:test + tsx (unidade e integração), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-11-01-viagem-de-carro-design.md` — leia junto; os números de seção (ex.: "spec 6.4") apontam para ela.

## Global Constraints

- Textos de tela, mensagens de erro, nomes de funções/variáveis e comentários em português, no estilo do código vizinho.
- Commits sem nenhuma menção ao Claude (sem `Co-Authored-By`, sem "Generated with"). Push e PR só com o OK do usuário.
- Nunca commitar: `cd`, `logo 01.png`, `logo 02.png`, as deleções de `Logo.png`/`Image Logo.png`, `docs/Relatorio-de-andamento-NomadPlan.pdf`. Use `git add` com caminhos explícitos.
- Migrations SQL escritas à mão em `backend/prisma/migrations/<timestamp>_<nome>/migration.sql`, aplicadas com `npx prisma migrate deploy` (nunca `migrate dev`). Use timestamp maior que a última pasta existente. Depois de aplicar, rode `npx prisma generate` (erro EPERM de DLL com o backend rodando é esperado; o cliente JS é regenerado mesmo assim). Aplique também no banco de desenvolvimento `nomadplan` (o `.env` do backend já aponta para ele).
- Não matar processos nas portas 3333/5173 (são do usuário).
- Nenhum teste usa a internet: OSRM, Overpass e Nominatim passam por `backend/src/testes/mapasFalsos.ts`; o E2E usa só o cache no banco.
- Chamadas externas: User-Agent `AGENTE` (`backend/src/lib/baixarCidade.ts`), no máximo 1 consulta/s por serviço, tempo limite (OSRM 15 s; Overpass `[timeout:25]` e 30 s no fetch).
- `OSRM_URL` padrão `https://router.project-osrm.org`.
- Constantes da spec 6.1, com estes valores: `KM_POR_DIA_PADRAO = 500` (150–1000), horas 2–14, `FAIXA_KM = 50`, `FAIXA_ALARGADA_KM = 100`, `FRACAO_DIA_CURTO = 0.3`, `CORREDOR_KM = 20`, `RAIO_DA_CIDADE_KM = 8`, `MAX_ALTERNATIVAS = 3`, `HORAS_MINIMAS_DE_PASSEIO_NA_CHEGADA = 2`, `PERFIL_A_CADA_KM = 5`, `MAX_DIAS_DA_VIAGEM = 21`, consumo 3–40 km/l, preço 100–2000 centavos, pesos 0,40/0,35/0,25, validade do resumo 30 dias, da rota 90 dias.
- Verificações: backend `npm run typecheck`, `npm run test:unit`, `npm run test:integracao` (Docker aberto, container `nomadplan-postgres`), cobertura `npm run test:cobertura` ≥ 60%; front `npm run lint` e `npm run build`; E2E `cd e2e && npx playwright test; echo "PLAYWRIGHT_EXIT=$?"` (o código de saída é o que vale).
- Créditos na tela do resultado e na documentação: "Rotas: OSRM · dados © colaboradores do OpenStreetMap".

## Review Focus

- **GPS fora do Brasil** (pessoa viajando no exterior): `POST /cidades/perto` com a sede mais próxima a mais de 50 km responde 404 "Não encontramos um município do Brasil perto de você." em vez de sugerir uma cidade de fronteira. Teste na Task 2.
- **Casa igual à 1ª cidade** (Joinville → Joinville): sem chamada ao OSRM, sem dias de estrada, sem erro; a viagem segue só com os dias na cidade. Teste na Task 10.
- **Etapa sem município correspondente ou ambígua com a viagem de carro** ("Bom Jesus" sem UF, ou "Cidade Inexistente"): 400 "Informe a UF de Bom Jesus." / "Não encontrei o município Cidade Inexistente." Teste na Task 10.
- **Resumo vencido e Overpass fora do ar**: usa o resumo vencido (como a rota vencida), em vez de cair para "sem resumo". Teste na Task 7.
- **Trocar a cidade de uma noite com hotel escolhido**: o hotel daquela noite e das noites seguintes da mesma perna volta para "Hotel a definir" (o `idOsm` antigo não pertence à cidade nova e o salvamento daria 400). Teste na Task 14 (E2E).

---

## Parte 1 — Municípios e dados da pessoa (PR 1)

Antes da Task 1: `git switch feat/viagem-de-carro && git switch -c feat/viagem-de-carro-parte1`.

### Task 1: Tabela `municipio`, carga do IBGE e consultas

**Files:**
- Create: `backend/prisma/migrations/20261103120000_municipios/migration.sql`
- Modify: `backend/prisma/schema.prisma` (model `Municipio`; `Usuario.codigoMunicipioBase`, `Usuario.consumoKmPorLitro`)
- Create: `backend/src/lib/municipios.ts`, `backend/src/lib/municipios.test.ts`
- Create: `backend/src/scripts/baixarMunicipios.ts`, `backend/src/scripts/importarMunicipios.ts`
- Create: `backend/prisma/dados/municipios.json` (gerado pelo script)
- Modify: `backend/package.json` (scripts `municipios:baixar`, `municipios:importar`), `backend/prisma/seed.ts` (carrega antes dos pontos)
- Modify: `backend/src/testes/suporte.ts` (`criarMunicipio`)
- Create: `backend/src/testes/integracao/municipios.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Municipio { codigoIbge: number; cidade: string; uf: string; latitude: number; longitude: number }
  export const ARQUIVO_MUNICIPIOS: string; // prisma/dados/municipios.json
  export function converterMunicipiosDoIbge(
    municipios: { codigo_ibge: number; nome: string; latitude: number; longitude: number; codigo_uf: number }[],
    estados: { codigo_uf: number; uf: string }[],
  ): Municipio[];
  export function separarUf(texto: string): { nome: string; uf: string | null }; // "Brasília, DF" | "Brasília/DF" | "Brasília - DF"
  export function lerMunicipios(arquivo?: string): Municipio[];
  export async function importarMunicipios(lista: Municipio[]): Promise<number>;
  export async function municipioPorCodigo(codigoIbge: number): Promise<Municipio | null>;
  export async function procurarMunicipio(texto: string): Promise<Municipio[]>; // nome exato normalizado (+UF)
  export async function buscarMunicipiosPorNome(texto: string, limite?: number): Promise<Municipio[]>; // começa com, limite 10
  export async function municipioMaisProximo(latitude: number, longitude: number): Promise<(Municipio & { distanciaKm: number }) | null>;
  // suporte.ts
  export async function criarMunicipio(dados: Municipio): Promise<Municipio>;
  ```

- [ ] **Step 1: Write the failing unit tests** in `municipios.test.ts`

```ts
describe("converterMunicipiosDoIbge", () => {
  it("troca o código da UF pela sigla e mantém nome com acento", () => {
    const [m] = converterMunicipiosDoIbge(
      [{ codigo_ibge: 5300108, nome: "Brasília", latitude: -15.7795, longitude: -47.9297, codigo_uf: 53 }],
      [{ codigo_uf: 53, uf: "DF" }],
    );
    assert.deepEqual(m, { codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.7795, longitude: -47.9297 });
  });
  it("descarta município de UF desconhecida", () => { /* codigo_uf 99 → lista vazia */ });
});
describe("separarUf", () => {
  for (const texto of ["Brasília, DF", "Brasília/DF", "Brasília - df", " Brasília ,DF "]) {
    it(`separa "${texto}"`, () => assert.deepEqual(separarUf(texto), { nome: "Brasília", uf: "DF" }));
  }
  it("sem UF", () => assert.deepEqual(separarUf("Joinville"), { nome: "Joinville", uf: null }));
  it("sigla que não é UF fica no nome", () => assert.deepEqual(separarUf("Santa Cruz, XX"), { nome: "Santa Cruz, XX", uf: null }));
});
```

- [ ] **Step 2: Run** `cd backend && npx tsx --test src/lib/municipios.test.ts` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: Write the migration**

`municipio` conforme spec 5.1 (`geom geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude),4326)::geography) STORED`, índice GIST em `geom`, índice comum em `(nome_normalizado, uf)`); em `usuario`: `codigo_municipio_base integer REFERENCES municipio(codigo_ibge) ON DELETE SET NULL` e `consumo_km_por_litro numeric(4,1) CHECK (consumo_km_por_litro BETWEEN 3 AND 40)`. No Prisma, `geom` não é modelado (igual a `ponto_turistico`); `resumoOsm Json?`, `resumoEm DateTime?`; `consumoKmPorLitro Decimal? @db.Decimal(4,1)`.

- [ ] **Step 4: Implement `municipios.ts`, `criarMunicipio` e os scripts**

`importarMunicipios` faz `INSERT … ON CONFLICT (codigo_ibge) DO UPDATE` em lotes de 500 com `$executeRaw`, gravando `nome_normalizado = normalizarCidade(cidade)` (`lib/cidades.ts`). `procurarMunicipio` usa `separarUf` e compara `nome_normalizado`. `municipioMaisProximo` usa `ORDER BY geom <-> ST_MakePoint(lon, lat)::geography LIMIT 1` e `ST_Distance`. `baixarMunicipios.ts` baixa `https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json` e `…/json/estados.json` com `buscarJson`, converte, ordena por código e grava `ARQUIVO_MUNICIPIOS`; aborta se o total não for 5.570. Antes de rodar, confira no repositório que a licença é MIT e os nomes dos campos; anote a fonte no topo do script. `importarMunicipios.ts` lê o arquivo e importa. No `seed.ts`, importe os municípios antes dos pontos.

- [ ] **Step 5: Run the unit tests** — Expected: PASS.

- [ ] **Step 6: Write the failing integration tests** in `municipios.itest.ts`

```ts
it("importa de novo sem duplicar e atualiza o nome", /* importar 2x → count 2; nome alterado na 2ª */);
it("procura pelo nome sem acento e com UF", async () => {
  await criarMunicipio({ codigoIbge: 5300108, cidade: "Brasília", uf: "DF", latitude: -15.78, longitude: -47.93 });
  assert.equal((await procurarMunicipio("brasilia/df"))[0].codigoIbge, 5300108);
  assert.equal((await procurarMunicipio("Brasilia")).length, 1);
});
it("homônimos de UFs diferentes voltam os dois sem UF e um com UF", /* Bom Jesus RS e Bom Jesus PI */);
it("acha a sede mais próxima de uma coordenada", /* ponto a ~3 km de Joinville → 4209102, distanciaKm entre 2 e 4 */);
```

- [ ] **Step 7: Apply the migration** (`cd backend && npx prisma migrate deploy && npx prisma generate`), **run** `npm run municipios:baixar`, `npm run municipios:importar` (banco `nomadplan`) and `npm run test:integracao` — Expected: PASS; `SELECT count(*) FROM municipio` = 5570.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/migrations/20261103120000_municipios backend/prisma/schema.prisma backend/prisma/dados/municipios.json backend/prisma/seed.ts backend/package.json backend/src/lib/municipios.ts backend/src/lib/municipios.test.ts backend/src/scripts/baixarMunicipios.ts backend/src/scripts/importarMunicipios.ts backend/src/testes/suporte.ts backend/src/testes/integracao/municipios.itest.ts
git commit -m "feat: municipios do IBGE no banco, com busca por nome e pela coordenada"
```

### Task 2: Código IBGE na busca de cidades e `POST /cidades/perto`

**Files:**
- Modify: `backend/src/routes/cidades.routes.ts`
- Test: `backend/src/testes/integracao/municipios.itest.ts` (novo `describe("rotas de cidades")`)

**Interfaces:**
- Consumes: `procurarMunicipio`, `buscarMunicipiosPorNome`, `municipioMaisProximo` (Task 1).
- Produces: `GET /cidades/buscar` → cada item ganha `codigoIbge: number | null`; `POST /cidades/perto` corpo `{ latitude, longitude }` → `{ codigoIbge, cidade, uf, latitude, longitude }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("a busca devolve o código IBGE do município", /* Nominatim falso com Joinville/SC + criarMunicipio(4209102) → dados[0].codigoIbge === 4209102 */);
it("sem Nominatim, procura na tabela de municípios", /* nominatim status 503 → semServidorDeMapas true e Campinas/SP aparece com codigoIbge, uf e coordenadas */);
it("POST /cidades/perto devolve o município mais próximo", /* { latitude: -26.31, longitude: -48.84 } → 200, codigoIbge 4209102 */);
it("POST /cidades/perto fora do Brasil responde 404", async () => {
  const r = await api("POST", "/cidades/perto", { corpo: { latitude: 48.85, longitude: 2.35 } });
  assert.equal(r.status, 404);
  assert.equal(r.corpo.erro, "Não encontramos um município do Brasil perto de você.");
});
it("POST /cidades/perto valida as coordenadas", /* latitude 120 → 400 */);
```

- [ ] **Step 2: Run** `npm run test:integracao` — Expected: os 5 novos falham.

- [ ] **Step 3: Implement**

Na busca: depois do Nominatim, para cada resultado `procurarMunicipio(\`${cidade}/${uf}\`)` dá o `codigoIbge`; no `catch` do Nominatim, além das cidades com pontos, inclui `buscarMunicipiosPorNome(texto)` (com `disponivel`/`pontos` calculados como hoje e sem repetir nomes). `POST /cidades/perto`: Zod `{ latitude: -90..90, longitude: -180..180 }`, limite `limiteBuscaCidade`, sede mais próxima a mais de 50 km → 404 com a mensagem acima. Não registra as coordenadas em `console` nem em auditoria.

- [ ] **Step 4: Run** `npm run test:integracao` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: codigo IBGE na busca de cidades e cidade mais proxima pelo GPS"` (adicione só os dois arquivos).

### Task 3: Município de casa e consumo do carro na conta

**Files:**
- Modify: `backend/src/routes/auth.routes.ts` (`registrarSchema`, `atualizarPerfilSchema`, seleção do perfil linha ~92, `GET /me`)
- Modify: `backend/src/lib/privacidade.ts` (`anonimizarUsuario`, `exportarDadosDoUsuario`)
- Test: `backend/src/testes/integracao/auth.itest.ts`

**Interfaces:**
- Consumes: `municipioPorCodigo` (Task 1).
- Produces: `POST /auth/registrar` aceita `codigoMunicipioBase?: number`; `PUT /auth/me` aceita `codigoMunicipioBase?: number | null` e `consumoKmPorLitro?: number | null`; `GET /auth/me`, a resposta do login/registro e `/auth/me/dados` devolvem `municipioBase: { codigoIbge, cidade, uf } | null` e `consumoKmPorLitro: number | null` (número, não string do Decimal).

- [ ] **Step 1: Write the failing tests**

```ts
it("o cadastro grava o município de casa e preenche a cidade base", /* registrar com 4209102 → me.municipioBase {4209102, "Joinville", "SC"}, me.cidadeBase "Joinville" */);
it("código de município inexistente no cadastro dá 400", /* 1234567 → 400 "Município não encontrado." */);
it("o perfil troca e limpa o município e o consumo", /* PUT {codigoMunicipioBase: 5300108, consumoKmPorLitro: 11.5} → me mostra Brasília e 11.5; PUT {codigoMunicipioBase: null, consumoKmPorLitro: null} → nulos */);
it("consumo fora de 3 a 40 km/l dá 400", /* 2.5 e 41 */);
it("exportação traz e anonimização apaga o município e o consumo", /* /auth/me/dados e DELETE /auth/me */);
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — ao gravar `codigoMunicipioBase`, busca o município (400 se não existir) e grava `cidadeBase = municipio.cidade`; `null` limpa os dois. A anonimização zera `codigoMunicipioBase` e `consumoKmPorLitro`.
- [ ] **Step 4: Run** `npm run test:integracao` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: municipio de casa e consumo do carro no perfil"`.

### Task 4: `CampoMinhaCidade` no cadastro e no Perfil

**Files:**
- Create: `frontend/src/components/CampoMinhaCidade.tsx`
- Modify: `frontend/src/services/cidades.ts` (`codigoIbge` em `CidadeDaBusca`; `cidadePerto`)
- Modify: `frontend/src/types/usuario.ts`, `frontend/src/context/auth-context.ts` (e o provider que implementa `registrar`/`atualizarPerfil`)
- Modify: `frontend/src/pages/Registrar.tsx`, `frontend/src/pages/Perfil.tsx`
- Create: `e2e/testes/12-viagem-de-carro.spec.ts`
- Modify: `backend/src/scripts/prepararE2e.ts` (importa no `nomadplan_e2e` os municípios de `ARQUIVO_MUNICIPIOS` depois de limpar as tabelas)

**Interfaces:**
- Consumes: rotas das Tasks 2 e 3.
- Produces:
  ```ts
  // services/cidades.ts
  export interface MunicipioEscolhido { codigoIbge: number; cidade: string; uf: string }
  export async function cidadePerto(latitude: number, longitude: number): Promise<MunicipioEscolhido & { latitude: number; longitude: number }>;
  // components/CampoMinhaCidade.tsx
  interface CampoMinhaCidadeProps { valor: MunicipioEscolhido | null; aoMudar: (m: MunicipioEscolhido | null) => void; rotulo?: string }
  // types/usuario.ts — Usuario ganha municipioBase: MunicipioEscolhido | null; consumoKmPorLitro: number | null
  ```

- [ ] **Step 1: Write the failing E2E test** in `12-viagem-de-carro.spec.ts`

```ts
test("cadastro guarda onde a pessoa mora pelo GPS e o Perfil guarda o consumo do carro", async ({ browser }) => {
  const contexto = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: -26.3045, longitude: -48.8487 } });
  const page = await contexto.newPage();
  // cadastrar(...) de suporte/ajudantes.ts não preenche a cidade: preencher o formulário aqui
  await page.goto("/registrar");
  // ...nome, e-mail, senha, consentimento...
  await page.getByRole("button", { name: "Usar minha localização" }).click();
  await expect(page.getByLabel("Onde você mora (opcional)")).toHaveValue("Joinville, SC");
  // enviar → Perfil mostra Joinville, SC; preencher "Consumo do meu carro (km/l)" com 11,5; salvar; recarregar; valor 11,5
  await contexto.close();
});
```

- [ ] **Step 2: Run** `cd e2e && npx playwright test testes/12-viagem-de-carro.spec.ts; echo "PLAYWRIGHT_EXIT=$?"` — Expected: FAIL, `PLAYWRIGHT_EXIT=1`.

- [ ] **Step 3: Implement**

`CampoMinhaCidade`: input de texto com rótulo "Onde você mora (opcional)" (prop `rotulo` muda o texto), botão "Buscar" que chama `buscarCidadesDoBrasil` e lista só resultados com `codigoIbge` como botões "Cidade, UF"; botão "Usar minha localização" (`navigator.geolocation.getCurrentPosition`, coordenadas arredondadas a 2 casas, `cidadePerto`); botão "Limpar"; texto "Usamos só para saber a sua cidade; não guardamos o ponto exato."; erros: sem permissão → "Não foi possível obter sua localização. Verifique a permissão do navegador.", 404 → mensagem do servidor. Valor exibido: "Cidade, UF". No Registrar e no Perfil, o campo de texto `cidadeBase` dá lugar ao componente e o envio passa `codigoMunicipioBase`; quem só tem `cidadeBase` antigo vê o texto antigo como dica. No Perfil, campo "Consumo do meu carro (km/l)" (aceita vírgula; vazio = `null`).

- [ ] **Step 4: Run** `cd frontend && npm run lint && npm run build`, `cd ../backend && npm run e2e:preparar`, depois o E2E do Step 2 e a suíte E2E inteira — Expected: lint/build sem erros; `PLAYWRIGHT_EXIT=0`.

- [ ] **Step 5: Commit** — `git commit -m "feat(front): onde voce mora no cadastro e no perfil, com GPS, e consumo do carro"`.

- [ ] **Step 6: Fechar a Parte 1** — rode `npm run typecheck` e `npm run test:cobertura` no backend (≥ 60%). Mostre ao usuário o resumo e peça OK para push + PR contra `feat/fontes-de-dados-e-multicidade`. A Parte 2 começa desta branch: `git switch -c feat/viagem-de-carro-parte2`.

---

## Parte 2 — Rota e divisão em dias (PR 2)

### Task 5: Rota do OSRM com perfil de tempo e cache

**Files:**
- Create: `backend/prisma/migrations/20261104120000_rotas_em_cache/migration.sql` (spec 5.3)
- Modify: `backend/prisma/schema.prisma` (model `RotaEmCache`, sem modelar `tracado`)
- Create: `backend/src/lib/rotas.ts`, `backend/src/lib/rotas.test.ts`
- Modify: `backend/src/testes/mapasFalsos.ts` (serviço `"osrm"` e o construtor `rotaOsrm`)
- Create: `backend/src/testes/integracao/rotas.itest.ts`
- Modify: `backend/.env.example` (`OSRM_URL`)

**Interfaces:**
- Consumes: `Municipio`, `AGENTE`.
- Produces:
  ```ts
  export type PerfilDaRota = [km: number, segundos: number][];
  export interface Rota { id: number; metros: number; segundos: number; perfil: PerfilDaRota; vencida: boolean }
  export class ErroRota extends Error {}
  export class SemEstrada extends Error {}
  export function montarPerfil(distancias: number[], duracoes: number[], aCadaKm?: number): PerfilDaRota; // começa em [0,0] e termina no total
  export function segundosAte(perfil: PerfilDaRota, km: number): number;       // interpolação linear; km > total → total
  export function kmApos(perfil: PerfilDaRota, kmInicial: number, segundos: number): number; // limitado ao total
  export function lerRespostaOsrm(corpo: unknown): { metros: number; segundos: number; coordenadas: [number, number][]; distancias: number[]; duracoes: number[] };
  export async function gravarRotaEmCache(origem: number, destino: number, dados: ReturnType<typeof lerRespostaOsrm>, agora?: Date): Promise<number>;
  export async function buscarRota(origem: Municipio, destino: Municipio, agora?: Date): Promise<Rota>;
  // mapasFalsos.ts
  osrm?: (url: string) => RespostaDeMapa;            // em MapasFalsos; detecta url que contém "/route/v1/driving/"
  export function rotaOsrm(coordenadas: [lon: number, lat: number][], kmPorHora?: number): unknown; // resposta Ok com annotation.distance/duration (padrão 80 km/h)
  ```

- [ ] **Step 1: Write the failing unit tests** in `rotas.test.ts`

```ts
it("montarPerfil acumula de 5 em 5 km e fecha no total", () => {
  const perfil = montarPerfil(Array(12).fill(1000), Array(12).fill(45)); // 12 km a 80 km/h
  assert.deepEqual(perfil, [[0, 0], [5, 225], [10, 450], [12, 540]]);
});
it("segundosAte interpola", () => assert.equal(segundosAte([[0, 0], [10, 600]], 2.5), 150));
it("kmApos converte horas em km a partir de um ponto", () => assert.equal(kmApos([[0, 0], [100, 3600], [200, 10800]], 50, 3600), 125));
it("kmApos não passa do fim", () => assert.equal(kmApos([[0, 0], [100, 3600]], 90, 7200), 100));
it("lerRespostaOsrm lê metros, segundos, coordenadas e anotações", /* corpo de rotaOsrm */);
it("NoRoute vira SemEstrada", () => assert.throws(() => lerRespostaOsrm({ code: "NoRoute" }), SemEstrada));
it("resposta sem rota vira ErroRota", () => assert.throws(() => lerRespostaOsrm({ code: "Ok", routes: [] }), ErroRota));
```

- [ ] **Step 2: Run** `npx tsx --test src/lib/rotas.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement the pure functions** (`montarPerfil` soma metros/segundos e emite um par a cada `aCadaKm`, mais o par final).
- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Write the failing integration tests** in `rotas.itest.ts`

```ts
it("busca no OSRM uma vez e depois usa o cache", /* 2 chamadas a buscarRota → mapas.chamadas com servico "osrm" === 1; vencida false */);
it("rota com mais de 90 dias é buscada de novo", /* buscada_em -91 dias → nova chamada */);
it("OSRM fora do ar usa a rota vencida", /* status 503 com cache de 100 dias → vencida true, sem erro */);
it("OSRM fora do ar sem cache dá ErroRota", /* rejects ErroRota */);
it("URL usa OSRM_URL, lon,lat e pede as anotações", /* chamada.url contém "/route/v1/driving/-48.85,-26.3;-47.93,-15.78" e "annotations=distance,duration" */);
```

- [ ] **Step 6: Implement `buscarRota` e `gravarRotaEmCache`**: cache por `(codigo_origem, codigo_destino)` com `INSERT … ON CONFLICT DO UPDATE`, `tracado = ST_Simplify(ST_GeomFromGeoJSON($1), 0.005)`, `perfil = montarPerfil(...)`; fila própria de 1 consulta/s (mesmo padrão de `geocodificacao.ts`); `AbortSignal.timeout(15_000)`.
- [ ] **Step 7: Apply the migration, run** `npm run test:integracao` — Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat: rota de carro pelo OSRM com perfil de tempo e cache no banco"`.

### Task 6: Cidades ao longo da estrada (corredor no PostGIS)

**Files:**
- Create: `backend/src/lib/corredor.ts`
- Test: `backend/src/testes/integracao/rotas.itest.ts` (`describe("corredor")`)

**Interfaces:**
- Consumes: `Rota.id` (Task 5).
- Produces:
  ```ts
  export interface CidadeNaRota { codigoIbge: number; cidade: string; uf: string; latitude: number; longitude: number; km: number; fracao: number; desvioKm: number }
  export async function candidatosDaRota(idRota: number, excluir: number[]): Promise<CidadeNaRota[]>; // ordenado por km
  export async function tracadoEntre(idRota: number, fracaoInicio: number, fracaoFim: number): Promise<[lat: number, lon: number][]>; // ≤ 400 pontos
  ```

- [ ] **Step 1: Write the failing tests** — rota sintética no meridiano −48 de lat −26 a −12,5 (~1.501 km), gravada com `gravarRotaEmCache`; municípios com o helper local `noKm(km, desvioKm)` = `{ latitude: -26 + km / 111.2, longitude: -48 + desvioKm / 111.2 }`:

```ts
it("pega só as cidades a até 20 km da estrada, com o km de cada uma", async () => {
  // A no km 500 a 5 km; B no km 1000 a 15 km; C no km 700 a 30 km
  const lista = await candidatosDaRota(idRota, []);
  assert.deepEqual(lista.map((c) => c.cidade), ["A", "B"]);
  assert.ok(Math.abs(lista[0].km - 500) < 3 && Math.abs(lista[0].desvioKm - 5) < 0.5);
});
it("deixa de fora as pontas da perna", /* excluir [codigoDeA] */);
it("tracadoEntre devolve [lat, lon] do pedaço e no máximo 400 pontos", /* fracao 0..0.5 → primeiro ≈ [-26, -48], último ≈ lat -19.25 */);
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** com o SQL da spec 6.3 (`km` geodésico escalado por `metros / ST_Length(tracado::geography)`); `tracadoEntre` usa `ST_LineSubstring` + `ST_AsGeoJSON` e, se passar de 400 pontos, pega 1 a cada `ceil(n/400)` mantendo o último.
- [ ] **Step 4: Run** `npm run test:integracao` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: cidades ao longo da estrada com o km de cada uma"`.

### Task 7: Resumo de hospedagens e atrações pelo Overpass

**Files:**
- Create: `backend/src/lib/resumoOsm.ts`, `backend/src/lib/resumoOsm.test.ts`
- Test: `backend/src/testes/integracao/rotas.itest.ts` (`describe("resumos")`)

**Interfaces:**
- Consumes: `ElementoOsm` (`osm.ts`), `buscarJson`/`AGENTE`, `CidadeNaRota`.
- Produces:
  ```ts
  export interface HospedagemDoResumo { idOsm: string; nome: string; tipo: string; latitude: number; longitude: number; tags: Record<string, string> }
  export interface ResumoOsm { hospedagens: HospedagemDoResumo[]; atracoes: { idOsm: string; nome: string }[]; totalHospedagens: number; totalAtracoes: number }
  export function consultaDoResumo(cidades: { latitude: number; longitude: number }[]): string;
  export function distribuirElementos(elementos: ElementoOsm[], cidades: { codigoIbge: number; latitude: number; longitude: number }[], raioKm?: number): Map<number, ResumoOsm>;
  export async function resumirCidades(codigos: number[], agora?: Date): Promise<Map<number, ResumoOsm | null>>; // null = sem resumo possível
  ```

- [ ] **Step 1: Write the failing unit tests**

```ts
it("cada elemento conta só para a cidade mais próxima dentro de 8 km", /* hotel a 2 km de A e 6 km de B → só A; museu a 12 km de todas → ninguém */);
it("separa hospedagens das atrações e ignora elementos sem nome", /* tourism=hotel, tourism=museum, historic=monument sem name */);
it("guarda no máximo 40 hospedagens, as mais completas primeiro, e conta todas", /* 45 hotéis, 3 com phone → total 45, lista 40, os 3 primeiros têm phone */);
it("guarda no máximo 10 atrações", );
it("a consulta tem um around:8000 por cidade, timeout 25 e out center tags", );
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** `consultaDoResumo` e `distribuirElementos` (tags e tipos da spec 6.5; `idOsm` = `${type}/${id}`; posição = `lat/lon` ou `center`). **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Write the failing integration tests**

```ts
it("busca só as cidades sem resumo válido e grava resumo_osm/resumo_em", /* A com resumo de 10 dias, B sem → consulta Overpass contém só B */);
it("resumo vencido e Overpass fora do ar: usa o vencido", async () => {
  // A com resumo_em de 40 dias; Overpass responde 504
  const mapa = await resumirCidades([codigoDeA]);
  assert.equal(mapa.get(codigoDeA)!.totalHospedagens, 3);
});
it("sem resumo e Overpass fora do ar: devolve null", );
```

- [ ] **Step 6: Implement `resumirCidades`** (uma consulta para todas as cidades pedidas sem resumo válido; `AbortSignal.timeout(30_000)`; falha → vencido se houver, senão `null`).
- [ ] **Step 7: Run** `npm run test:integracao` — Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat: resumo de hospedagens e atracoes das cidades no caminho"`.

### Task 8: Divisão de uma perna em dias (função pura)

**Files:**
- Create: `backend/src/lib/divisaoEmDias.ts`, `backend/src/lib/divisaoEmDias.test.ts`

**Interfaces:**
- Consumes: `CidadeNaRota`, `ResumoOsm`, `PerfilDaRota`, `kmApos`.
- Produces:
  ```ts
  export const FAIXA_KM = 50, FAIXA_ALARGADA_KM = 100, FRACAO_DIA_CURTO = 0.3, MAX_ALTERNATIVAS = 3;
  export interface CandidatoDePernoite extends CidadeNaRota { resumo: ResumoOsm | null | undefined } // undefined = ainda não buscado
  export interface PernoiteEscolhido { cidade: CandidatoDePernoite | null; km: number; fracao: number; aDefinir: boolean; alternativas: CandidatoDePernoite[] }
  export interface DivisaoDaPerna {
    noites: PernoiteEscolhido[];
    kmFinal: number;                                   // do último pernoite (ou 0) até o fim
    decisao: { esticar: boolean; kmEsticando: number; kmNoDiaSeguinte: number } | null;
    avisos: string[];
    semResumo: number[];                               // códigos nas faixas avaliadas com resumo undefined
  }
  export function notaDoCandidato(c: CandidatoDePernoite, kmAlvo: number, largura: number): number;
  export function dividirEmDias(entrada: {
    totalKm: number; alvoKm: number; horasPorDia: number | null; perfil: PerfilDaRota;
    candidatos: CandidatoDePernoite[]; escolhas: Map<number, number>; esticar?: boolean;
  }): DivisaoDaPerna;
  ```

- [ ] **Step 1: Write the failing tests** (helper `cidade(codigo, km, hospedagens, atracoes, desvioKm = 2)` com `fracao = km / totalKm`):

```ts
it("1.507 km com alvo 500: 2 noites e chegada com ~507 km", () => {
  const d = dividirEmDias({ totalKm: 1507, alvoKm: 500, horasPorDia: null, perfil: P, candidatos: [cidade(1, 498, 10, 3), cidade(2, 1001, 8, 2)], escolhas: new Map() });
  assert.deepEqual(d.noites.map((n) => n.cidade!.codigoIbge), [1, 2]);
  assert.equal(Math.round(d.kmFinal), 506);
  assert.equal(d.decisao, null);
});
it("1.120 km: decisão com esticar marcado e chegada de ~620 km", /* noites [~500]; decisao {esticar:true, kmEsticando≈620, kmNoDiaSeguinte≈120}; kmFinal≈620 */);
it("1.120 km com esticar=false: 2 noites e chegada de ~120 km", );
it("540 km: nenhuma noite", );
it("cidade exatamente em 450 e em 550 entra na faixa", );
it("faixa sem hospedagem alarga para ±100 e avisa", /* só cidade com hospedagem no km 590 → escolhida; aviso contém "entre 450 e 550 km" */);
it("nada na faixa alargada: pernoite a definir na cidade mais perto do alvo", /* cidade sem hospedagem no km 505 → aDefinir true, cidade 505 */);
it("sem cidade nenhuma: pernoite a definir no km do alvo, sem cidade", /* cidade null, km 500, aDefinir true */);
it("a escolha da noite 1 muda a faixa da noite 2 e a escolha que saiu dela é descartada com aviso", );
it("escolha com código que não é candidato é ignorada com aviso", );
it("ordena pela nota: proximidade 0,40, hospedagens 0,35, atrações 0,25 em escala logarítmica", /* km 500 com 1 hotel perde para km 520 com 20 hotéis e 10 atrações */);
it("empate na nota: menor desvio, depois menor km", );
it("sem resumo (null): nota só de proximidade, ninguém é descartado, aviso", /* aviso "não foi possível contar os hotéis agora" */);
it("resumo undefined nas faixas avaliadas vai para semResumo", );
it("limite de 7 h por dia encurta o alvo pelo perfil", /* perfil a 70 km/h → noite 1 perto do km 490 */);
it("até 3 alternativas, sem repetir a escolhida", );
```

- [ ] **Step 2: Run** `npx tsx --test src/lib/divisaoEmDias.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** seguindo o pseudocódigo e as fórmulas da spec 6.4 (`alvoDoDia = min(alvoKm, kmApos(perfil, pos, horas×3600) − pos)`; dia curto = `FRACAO_DIA_CURTO × alvoDoDia`; `kmNoDiaSeguinte = restante − alvoDoDia`). Avisos exatos: "Nenhuma cidade com hospedagem entre {a} e {b} km; a mais próxima é {cidade}, no km {km}.", "Não há cidade com hospedagem perto do km {km}; o pernoite ficou a definir.", "A cidade escolhida para a noite {n} não está mais na faixa e foi trocada.", "Não foi possível contar os hotéis agora; as cidades estão só pela distância." (km arredondado, sem casas).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: divisao de uma perna da viagem em dias com pernoites"`.

### Task 9: O gerador aceita etapas com 1º dia e chegada reais

**Files:**
- Modify: `backend/src/lib/recomendacao.ts` (`EtapaDoRoteiro`, laço de `gerarRoteiroSugerido`)
- Test: `backend/src/testes/integracao/roteirosMulticidade.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EtapaDoRoteiro {
    cidade: string; dias: number;
    primeiroDia?: number;                                           // número do 1º dia da etapa no roteiro
    chegada?: { de: string; metros: number; minutos: number } | null; // presente = substitui a estimativa em linha reta (null = sem desconto)
    minutosNoFimDoUltimoDia?: number;                               // volta curta descontada do último dia
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("etapa com primeiroDia pula os números dos dias de estrada", /* etapas [{Joinville, 2, primeiroDia: 4}] → dias [4, 5] e pontos com dia 4 ou 5 */);
it("chegada real é descontada do 1º dia no lugar da linha reta", /* chegada {de:"Joinville/SC", metros:180000, minutos:135} → dias[0].viagem igual, horas do dia 1 reduzidas */);
it("chegada null não desconta nada mesmo trocando de cidade", );
it("minutosNoFimDoUltimoDia reduz as horas do último dia", /* 6 h de passeio, 240 min → último dia com no máximo 2 h de visitas */);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** (sem esses campos, o comportamento atual não muda). **Step 4: Run** `npm run test:integracao` — Expected: PASS (incluindo os testes antigos do multicidade).
- [ ] **Step 5: Commit** — `git commit -m "feat: gerador de roteiro aceita dias e chegadas da viagem de carro"`.

### Task 10: `planejarViagemDeCarro` (perna de ida) e `viagemDeCarro` em `POST /roteiros/gerar`

**Files:**
- Create: `backend/src/lib/viagemDeCarro.ts`, `backend/src/lib/viagemDeCarro.test.ts`
- Modify: `backend/src/routes/roteiros.routes.ts` (`gerarRoteiroSchema`, handler `/gerar`)
- Create: `backend/src/testes/integracao/viagemDeCarro.itest.ts`

**Interfaces:**
- Consumes: Tasks 1, 5–9.
- Produces (tipos da resposta = spec 7.3, com `metros`/`segundos`):
  ```ts
  export class ErroDaViagem extends Error {} // vira 400 com a mensagem
  export interface EscolhaDaNoite { perna: number; noite: number; codigoIbge: number }
  export interface DecisaoDaPerna { perna: number; esticar: boolean }
  export interface EntradaDaViagem {
    origem: Municipio; etapas: (Municipio & { dias: number })[]; kmPorDia: number; horasPorDia: number | null;
    comVolta: boolean; horasDisponiveis: number; consumoKmPorLitro: number | null; precoLitroCentavos: number | null;
    escolhas: EscolhaDaNoite[]; decisoes: DecisaoDaPerna[];
  }
  export interface TrechoParaAgenda { km: number; segundos: number; noite: number | null } // o último de cada perna tem noite null
  export interface TrechoNaAgenda extends TrechoParaAgenda { dia: number; ocupaODia: boolean; noFimDoDia: boolean }
  export function montarAgenda(
    pernas: { trechos: TrechoParaAgenda[]; terminaEmCasa: boolean }[],
    diasDasEtapas: number[], horasDisponiveis: number,
  ): { trechos: TrechoNaAgenda[][]; etapas: { primeiroDia: number; chegada: TrechoNaAgenda | null; minutosNoFimDoUltimoDia: number }[]; totalDeDias: number };
  export interface PlanoDaViagem {
    pernas: PernaPlanejada[];             // PernaPlanejada, TrechoPlanejado, CidadeDePernoite como na spec 7.3
    etapasDoGerador: EtapaDoRoteiro[];
    totalDeDias: number;
    combustivel: { litros: number; custoCentavos: number } | null; // null até a Task 17
    avisos: string[];
  }
  export async function resolverEntradaDaViagem(dados: PedidoDeViagem, etapas: { cidade: string; codigoIbge?: number; dias: number }[], idUsuario: number, horasDisponiveis: number): Promise<EntradaDaViagem>;
  export async function planejarViagemDeCarro(entrada: EntradaDaViagem): Promise<PlanoDaViagem>;
  ```
  `PedidoDeViagem` = o bloco `viagemDeCarro` da spec 7.3 já validado pelo Zod.

- [ ] **Step 1: Write the failing unit tests for `montarAgenda`** (6 h de passeio)

```ts
it("perna longa: noites viram dias de estrada e a chegada longa também", () => {
  const r = montarAgenda([{ trechos: [t(500, 22000, 1), t(500, 22000, 2), t(507, 22200, null)], terminaEmCasa: false }], [4], 6);
  assert.deepEqual(r.trechos[0].map((x) => [x.dia, x.ocupaODia]), [[1, true], [2, true], [3, true]]);
  assert.equal(r.etapas[0].primeiroDia, 4);
  assert.equal(r.etapas[0].chegada, null);
  assert.equal(r.totalDeDias, 7);
});
it("chegada que deixa 2 h de passeio é descontada do 1º dia da etapa", /* t(180, 8100, null) → dia 1, ocupaODia false; etapa primeiroDia 1, chegada = esse trecho */);
it("exatamente 2 h de sobra conta como descontada", /* 4 h de direção com 6 h de passeio */);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement `montarAgenda`** para pernas que terminam em etapa (a volta entra na Task 15). **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Write the failing integration tests** in `viagemDeCarro.itest.ts` (municípios Joinville 4209102 e Brasília 5300108 + candidatos sintéticos; OSRM falso com `rotaOsrm`; Overpass falso com hotéis/atrações perto dos candidatos; pontos publicados em Brasília com `criarPonto`)

```ts
it("Joinville → Brasília 4 dias, alvo 500: 2 noites, dia 3 de estrada e Brasília do dia 4 ao 7", async () => {
  const r = await api("POST", "/roteiros/gerar", { token, corpo: { etapas: [{ cidade: "Brasília, DF", dias: 4 }], viagemDeCarro: {} } });
  assert.equal(r.status, 200);
  const [ida] = r.corpo.viagemDeCarro.pernas;
  assert.deepEqual(ida.trechos.map((t: any) => [t.dia, t.noite, t.ocupaODia]), [[1, 1, true], [2, 2, true], [3, null, true]]);
  assert.deepEqual([...new Set(r.corpo.pontos.map((p: any) => p.dia))].sort(), [4, 5, 6, 7]);
  assert.ok(ida.trechos[0].pernoite.totalHospedagens > 0 && ida.trechos[0].alternativas.length <= 3);
});
it("a origem padrão é o município de casa; sem casa e sem origem dá 400 'Informe de onde você sai.'", );
it("casa igual à 1ª cidade: nenhum dia de estrada e nenhuma chamada ao OSRM", async () => {
  // usuário com casa Joinville, etapa Joinville 2 dias
  assert.equal(r.corpo.viagemDeCarro.pernas.length, 0);
  assert.equal(mapas.chamadas.filter((c) => c.servico === "osrm").length, 0);
  assert.deepEqual(r.corpo.dias.map((d: any) => d.dia), [1, 2]);
});
it("etapa ambígua sem UF dá 400 'Informe a UF de Bom Jesus.'", );
it("etapa sem município dá 400 'Não encontrei o município Cidade Inexistente.'", );
it("escolha da noite 1 troca a cidade e a decisão esticar=false acrescenta uma noite", );
it("kmPorDia, horasPorDia, consumo e preço fora da faixa dão 400", /* 1001 e 149 km; 1 e 15 h; 2 e 41 km/l; 99 e 2001 centavos */);
it("viagem curta sem nenhuma noite traz o aviso 'Nenhuma perna passa de um dia de estrada.'", /* Joinville → Florianópolis 180 km: chegada descontada do dia 1 */);
it("mais de 21 dias dá 400 com a explicação", /* alvo 150 km numa rota de 3.000 km */);
it("sem estrada dá 422 'Não há estrada entre Joinville/SC e Fernando de Noronha/PE.'", );
it("OSRM fora do ar sem cache dá 503 'Não consegui calcular a rota agora; tente de novo em alguns minutos.'", );
it("sem viagemDeCarro a resposta é a de hoje, com viagemDeCarro null", );
```

- [ ] **Step 6: Implement**

`resolverEntradaDaViagem`: origem = `dados.origem` ou `usuario.codigoMunicipioBase` (senão `ErroDaViagem("Informe de onde você sai.")`); cada etapa por `codigoIbge` ou `procurarMunicipio(cidade)` (0 → "Não encontrei o município {cidade}."; >1 → "Informe a UF de {cidade}."). `planejarViagemDeCarro`: para a perna casa → 1ª etapa (se forem municípios diferentes): `buscarRota`, `candidatosDaRota(idRota, [origem, destino])`, até 3 rodadas de `dividirEmDias` + `resumirCidades(semResumo)`, `tracadoEntre` por trecho, segundos por `segundosAte`, depois `montarAgenda`; `etapasDoGerador` leva `primeiroDia`, `chegada` (`{ de: "Cidade/UF", metros, minutos }` ou `null`) e as cidades no nome que o gerador entende (`cidade`); total > 21 → `ErroDaViagem("Com {km} km por dia a viagem passa de 21 dias; aumente os km por dia ou diminua os dias nas cidades.")`. No handler: Zod do bloco (spec 7.3) e `codigoIbge` opcional em cada etapa do `gerarRoteiroSchema` (nesta parte, `comVolta: true` dá 400 "A volta ainda não está disponível." até a Task 15), chama o plano, passa `etapasDoGerador` ao `gerarRoteiroSugerido` e responde `{ ...recomendacao, viagemDeCarro }` (`null` sem o bloco); `ErroDaViagem` → 400, `SemEstrada` → 422, `ErroRota` → 503.

- [ ] **Step 7: Run** `npm run typecheck && npm run test:unit && npm run test:integracao` — Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat: viagem de carro no gerador de roteiro, com pernoites na ida"`.
- [ ] **Step 9: Fechar a Parte 2** — cobertura ≥ 60%, OK do usuário para push + PR; `git switch -c feat/viagem-de-carro-parte3`.

---

## Parte 3 — Telas e salvamento da ida (PR 3)

### Task 11: Gravar e ler a viagem (`trecho_estrada`)

**Files:**
- Create: `backend/prisma/migrations/20261105120000_viagem_de_carro/migration.sql` (spec 5.4 e 5.5 completas, inclusive `horas_por_dia`, `consumo_km_por_litro`, `preco_litro_centavos`, `litros`, `custo_combustivel_centavos`, `no_fim_do_dia`)
- Modify: `backend/prisma/schema.prisma` (`Roteiro` + `TrechoEstrada`)
- Create: `backend/src/lib/gravarViagem.ts`
- Modify: `backend/src/lib/trajeto.ts` (`viagensComEstrada`) e `backend/src/lib/trajeto.test.ts`
- Modify: `backend/src/routes/roteiros.routes.ts` (`criarRoteiroSchema`, `POST /`, `GET /:id`, `GET /publico/:slug`, restauração de versão)
- Modify: `backend/src/lib/versionamentoRoteiro.ts` (`DadosVersaoRoteiro.viagemDeCarro?`, `trechos?`)
- Create: `backend/src/testes/integracao/viagemDeCarroSalvar.itest.ts`

**Interfaces:**
- Consumes: `planejarViagemDeCarro`, `resolverEntradaDaViagem`, `ResumoOsm`, `pontoDoElemento` (`osm.ts`), `importarPontosOsm` (`importacaoOsm.ts`).
- Produces:
  ```ts
  // gravarViagem.ts
  export interface NoiteSalva { perna: number; noite: number; codigoIbge: number | null; idOsm?: string }
  export function conferirNoites(plano: PlanoDaViagem, noites: NoiteSalva[]): boolean;          // perna, noite e cidade iguais
  export async function hospedagensParaOCatalogo(plano: PlanoDaViagem): Promise<Map<string, number>>; // idOsm → id do ponto (fora da transação)
  export async function gravarViagemDeCarro(tx: Prisma.TransactionClient, idRoteiro: number, entrada: EntradaDaViagem, plano: PlanoDaViagem, noites: NoiteSalva[], idsDosHoteis: Map<string, number>): Promise<void>;
  // trajeto.ts
  export interface TrechoSalvo { dia: number; perna: number; de: string; para: string; metros: number; segundos: number; noFimDoDia: boolean }
  export function viagensComEstrada(viagens: ViagemEntreDias[], trechos: TrechoSalvo[]): ViagemEntreDias[]; // ViagemEntreDias ganha estrada?: boolean e noFimDoDia?: boolean
  ```
  Leitura (`GET /roteiros/:id`, `/publico/:slug`): `viagemDeCarro` e `trechosDeEstrada` como na spec 7.5 (o público sem consumo/preço/litros/custo).

- [ ] **Step 1: Write the failing unit tests** em `trajeto.test.ts`

```ts
it("viagensComEstrada troca a estimativa do dia pelo trecho real e marca estrada", );
it("dia de estrada sem viagem estimada ganha a do trecho", );
it("trecho no fim do dia entra separado, com noFimDoDia", );
```

- [ ] **Step 2: Write the failing integration tests** em `viagemDeCarroSalvar.itest.ts`

```ts
it("salvar grava os trechos, os pernoites e as hospedagens no catálogo", async () => {
  // gerar → montar noites da resposta (noite 1 com idOsm do 1º hotel, noite 2 sem) → POST /roteiros
  // roteiro: kmPorDia 500; 3 trecho_estrada (dias 1..3); item pernoite dia 1 com idPonto do hotel; dia 2 título "Pernoite em B (hotel a definir)"
  // ponto_turistico com idOsm de todas as hospedagens do resumo de A e B, origem OSM
});
it("idOsm que não está no resumo da cidade dá 400", );
it("noites diferentes do recálculo dão 409 'A rota mudou desde a geração; gere de novo.' e nada é gravado", );
it("GET /roteiros/:id traz trechosDeEstrada e viagensEntreDias com estrada", );
it("o link público não traz consumo, preço, litros nem custo", );
it("restaurar uma versão traz de volta os trechos e os campos da viagem", );
```

- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement** (ordem da spec 7.4: recalcular com `resolverEntradaDaViagem` + `planejarViagemDeCarro`, `conferirNoites` → 409, `hospedagensParaOCatalogo` antes da transação reconstruindo `ElementoOsm` a partir de `idOsm`/`tags`, depois a transação que já cria o roteiro e as paradas + `gravarViagemDeCarro`). Título do pernoite sem hotel: `Pernoite em {cidade} (hotel a definir)`; sem cidade: `Pernoite no km {km} (a definir)`.
- [ ] **Step 5: Apply the migration, run** `npm run typecheck && npm run test:unit && npm run test:integracao` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: salvar a viagem de carro com trechos, pernoites e hospedagens"`.

### Task 12: Caixa "Vou de carro" no gerador

**Files:**
- Create: `frontend/src/types/viagem.ts` (tipos das spec 7.3, 7.4 e 7.5: `PedidoDeViagem`, `EscolhaDaNoite`, `DecisaoDaPerna`, `NoiteSalva`, `PernaPlanejada`, `TrechoPlanejado`, `CidadeDePernoite`, `TrechoDeEstrada`)
- Modify: `frontend/src/types/roteiro.ts` (`RespostaRecomendacao.viagemDeCarro?`, `Roteiro.viagemDeCarro?`, `Roteiro.trechosDeEstrada?`, `ViagemEntreDias.estrada?`/`noFimDoDia?`)
- Create: `frontend/src/components/viagem/CaixaViagemDeCarro.tsx`
- Modify: `frontend/src/components/EscolherCidade.tsx` (`aoEscolher(nome, cidade?: CidadeDaBusca)`) e `frontend/src/pages/GerarRoteiro.tsx` (etapa guarda `codigoIbge?`; envia `viagemDeCarro`)

**Interfaces:**
- Produces:
  ```ts
  export interface OpcoesViagemDeCarro { ativa: boolean; origem: MunicipioEscolhido | null; kmPorDia: string; horasPorDia: string; comVolta: boolean; consumo: string; preco: string }
  interface CaixaViagemDeCarroProps { valor: OpcoesViagemDeCarro; aoMudar: (v: OpcoesViagemDeCarro) => void }
  export function pedidoDaViagem(o: OpcoesViagemDeCarro, escolhas: EscolhaDaNoite[], decisoes: DecisaoDaPerna[]): PedidoDeViagem | undefined; // undefined quando a caixa está desmarcada
  ```
  Rótulos exatos: "Vou de carro saindo de casa", "Saindo de", "Alvo por dia (km)", "No máximo (horas ao volante)". `comVolta`, `consumo` e `preco` ainda sem campo (Tasks 16 e 18).

- [ ] **Step 1: Implement** — origem começa em `usuario.municipioBase`; a caixa usa `CampoMinhaCidade` com `rotulo="Saindo de"`; números aceitam vírgula; enquanto gera, o botão mostra "Calculando a rota…" quando a caixa está marcada.
- [ ] **Step 2: Run** `cd frontend && npm run lint && npm run build` — Expected: sem erros.
- [ ] **Step 3: Commit** — `git commit -m "feat(front): caixa da viagem de carro no gerador de roteiro"`.

### Task 13: Dias de estrada, pernoites e decisão no resultado

**Files:**
- Create: `frontend/src/utils/viagem.ts`, `frontend/src/components/viagem/TrechoNaEstrada.tsx`, `frontend/src/components/viagem/PernoiteNaEstrada.tsx`, `frontend/src/components/viagem/DecisaoDeChegada.tsx`
- Modify: `frontend/src/pages/GerarRoteiro.tsx` (estado `escolhas`, `decisoes`, `hoteis`; render por dia; salvar com `viagemDeCarro`)
- Modify: `frontend/src/components/MapaRoteiro.tsx` (prop `estradas`), `frontend/src/styles/pages.css`

**Interfaces:**
- Consumes: tipos da Task 12; resposta da Task 10; salvamento da Task 11.
- Produces:
  ```ts
  // utils/viagem.ts
  export interface DiaDaViagem { dia: number; tipo: "ESTRADA" | "CIDADE"; trechos: TrechoPlanejado[]; diaGerado: DiaDoRoteiroGerado | null }
  export function diasDaViagem(r: RespostaRecomendacao): DiaDaViagem[];          // 1..total, na ordem
  export function chaveDaNoite(perna: number, noite: number): string;            // "0-1"
  export function noitesParaSalvar(r: RespostaRecomendacao, hoteis: Map<string, string>): NoiteSalva[];
  // MapaRoteiro
  estradas?: { dia: number; tracado: [number, number][]; pernoite: string | null }[];
  ```
  Textos: cabeçalho "Dia {n} · Estrada · {de} → {para} · {km} · ~{tempo}" (`formatarDistancia`, `formatarDuracao`); "{n} hospedagens"; "tem: {a}, {b}"; opção "Hotel a definir"; botão "Trocar cidade"; decisão "Esticar e chegar hoje ({km} · ~{tempo})" e "Dormir no caminho e chegar amanhã com ~{km}"; legenda "tempo de direção, sem paradas"; crédito "Rotas: OSRM · dados © colaboradores do OpenStreetMap".

- [ ] **Step 1: Implement** — trocar cidade regera com `escolhas` atualizadas e apaga de `hoteis` as chaves daquela perna com noite ≥ a trocada; decidir regera com `decisoes`; o mapa desenha cada `tracado` com `corDoDia(dia)` e um marcador 🛏 no último ponto quando há pernoite (popup "Pernoite em {cidade}"); salvar envia `pontos` (como hoje) + `viagemDeCarro` (pedido + `noites` de `noitesParaSalvar`); 409 mostra a mensagem do servidor e um botão "Gerar de novo".
- [ ] **Step 2: Run** `npm run lint && npm run build` — Expected: sem erros. Confira na pré-visualização (`preview_start`) com o banco `nomadplan` e uma rota real Joinville → Brasília.
- [ ] **Step 3: Commit** — `git commit -m "feat(front): dias de estrada com pernoites, alternativas e decisao de chegada"`.

### Task 14: Roteiro salvo com a estrada e E2E da ida

**Files:**
- Modify: `frontend/src/pages/RoteiroDetalhes.tsx` e `frontend/src/pages/RoteiroPublico.tsx` (faixa `.dia__viagem` com 🚗 quando `estrada`; faixa no fim do dia quando `noFimDoDia`; `estradas` no mapa)
- Create: `backend/src/scripts/dadosViagemE2e.ts` (rotas sintéticas Joinville → Brasília, Brasília → Joinville e Joinville → Goiânia de 1.120 km via `gravarRotaEmCache`; para cada município que `candidatosDaRota` achar nessas rotas, um resumo sintético em `resumo_osm` com `resumo_em = now()` — 3 hospedagens e 2 atrações em 1 a cada 3 cidades, vazio nas outras — para que nenhuma consulta vá ao Overpass; 6 pontos publicados em Brasília e em Goiânia)
- Modify: `e2e/playwright.config.ts` (no `env` do backend, `OSRM_URL: "http://127.0.0.1:9"`, para que uma rota fora do cache falhe em vez de ir à internet)
- Modify: `backend/src/scripts/prepararE2e.ts` (chama `dadosViagemE2e`)
- Modify: `e2e/testes/12-viagem-de-carro.spec.ts`

- [ ] **Step 1: Write the failing E2E tests**

```ts
test("gera Joinville → Brasília de carro, troca o pernoite, decide a chegada e salva", async ({ page }) => {
  // conta com casa Joinville (PUT /auth/me pela API ou pelo Perfil)
  // /roteiros/gerar: etapa "Brasília, DF" 4 dias; marcar "Vou de carro saindo de casa"; Gerar roteiro
  await expect(page.getByText(/Dia 1 · Estrada · Joinville\/SC →/)).toBeVisible();
  // "Trocar cidade" na noite 1 → escolher a 1ª alternativa → cabeçalho do dia 1 muda de cidade
  // salvar → URL /roteiros/\d+ → faixa "🚗 Joinville/SC →" visível no dia 1
});
test("trocar a cidade de uma noite limpa o hotel escolhido", async ({ page }) => {
  // escolher um hotel na noite 1, trocar a cidade da noite 1 → seletor de hotel volta para "Hotel a definir"
});
test("decisão de chegada vem marcada em esticar", /* rota sintética de ~1.120 km para Goiânia no dadosViagemE2e → rádio "Esticar e chegar hoje" marcado */);
```

- [ ] **Step 2: Run** `cd backend && npm run e2e:preparar && cd ../e2e && npx playwright test testes/12-viagem-de-carro.spec.ts; echo "PLAYWRIGHT_EXIT=$?"` — Expected: FAIL.
- [ ] **Step 3: Implement** as telas do roteiro salvo e os dados do E2E.
- [ ] **Step 4: Run** a suíte E2E inteira — Expected: `PLAYWRIGHT_EXIT=0`.
- [ ] **Step 5: Commit** — `git commit -m "feat(front): estrada no roteiro salvo e testes de ponta a ponta da viagem de carro"`.
- [ ] **Step 6: Fechar a Parte 3** — suítes do backend, lint/build, OK do usuário para push + PR; `git switch -c feat/viagem-de-carro-parte4`.

---

## Parte 4 — Todas as pernas (PR 4)

### Task 15: Pernas entre etapas e volta

**Files:**
- Modify: `backend/src/lib/viagemDeCarro.ts` (`montarAgenda` com `terminaEmCasa`; pernas `i → i+1` e última → casa), `backend/src/lib/viagemDeCarro.test.ts`
- Modify: `backend/src/routes/roteiros.routes.ts` (tira o 400 de `comVolta`)
- Test: `backend/src/testes/integracao/viagemDeCarro.itest.ts`, `viagemDeCarroSalvar.itest.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
it("volta curta fica no fim do último dia da última etapa", /* etapas [2], volta t(180, 8100, null) terminaEmCasa → dia 2, noFimDoDia true; etapa minutosNoFimDoUltimoDia 135; total 2 */);
it("volta curta que não deixa 2 h vira dia só de estrada", );
it("volta longa: noites e chegada em casa como dias de estrada", );
it("perna entre etapas maior que um dia entra entre os dias das duas cidades", /* etapas [2, 2], perna 1 com 1 noite → dias 1-2 cidade A, 3 estrada, 4-5 cidade B (chegada curta descontada) */);
it("escolhas e decisões de uma perna não mexem nas outras", );
```

- [ ] **Step 2: Write the failing integration tests**

```ts
it("Brasília 2 dias → Goiânia 2 dias com volta: pernas 0, 1 e 2 com dias numerados em sequência", );
it("perna entre etapas curta usa o tempo real do OSRM como chegada", /* dias[...].viagem.minutos === segundos/60 do OSRM falso, não a linha reta */);
it("salvar com volta grava os trechos de todas as pernas", );
it("o limite de 21 dias conta estrada de ida, entre etapas e volta", );
```

- [ ] **Step 3: Run** — Expected: FAIL. **Step 4: Implement.** **Step 5: Run** `npm run typecheck && npm run test:unit && npm run test:integracao` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: viagem de carro com pernas entre as cidades e volta para casa"`.

### Task 16: "Planejar a volta" e pernas no front

**Files:**
- Modify: `frontend/src/components/viagem/CaixaViagemDeCarro.tsx` (caixa "Planejar a volta"), `frontend/src/utils/viagem.ts` (`diasDaViagem` com trechos no início e no fim do dia), `frontend/src/pages/GerarRoteiro.tsx`
- Modify: `e2e/testes/12-viagem-de-carro.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

```ts
test("viagem com volta mostra a estrada de volta e chega em casa", async ({ page }) => {
  // Brasília 2 dias, "Planejar a volta" marcada → último dia "Estrada · Brasília/DF → …" e um dia terminando em "Joinville/SC"; salvar; faixa 🚗 da volta no roteiro salvo
});
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** (trecho com `ocupaODia = false` vira a faixa "🚗 Chegada de {de} · {km} · ~{tempo}" no início do dia, ou "🚗 Volta para {para} · …" no fim). **Step 4: Run** lint/build e o E2E inteiro — Expected: `PLAYWRIGHT_EXIT=0`.
- [ ] **Step 5: Commit** — `git commit -m "feat(front): volta para casa e pernas entre cidades na viagem de carro"`.
- [ ] **Step 6: Fechar a Parte 4** — suítes, OK do usuário para push + PR; `git switch -c feat/viagem-de-carro-parte5`.

---

## Parte 5 — Combustível, banca e documentação (PR 5)

### Task 17: Combustível no plano e no orçamento (backend)

**Files:**
- Create: `backend/src/lib/combustivel.ts`, `backend/src/lib/combustivel.test.ts`
- Modify: `backend/src/lib/viagemDeCarro.ts` (litros/custo por trecho e total), `backend/src/lib/gravarViagem.ts` (grava `litros`, `custo_combustivel_centavos`, consumo e preço do roteiro)
- Modify: `backend/src/lib/orcamento.ts` (terceiro parâmetro `trechos`), `backend/src/lib/orcamento.test.ts`, `backend/src/routes/roteiros.routes.ts` (`resumirOrcamento(itens, teto, trechos)`)
- Test: `backend/src/testes/integracao/viagemDeCarroSalvar.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  export function estimarCombustivel(km: number, consumoKmPorLitro: number | null, precoLitroCentavos: number | null): { litros: number; custoCentavos: number } | null;
  export function resumirOrcamento(itens: { dia: number; custoCentavos: number | null }[], orcamentoCentavos: number | null, trechos?: { dia: number; custoCombustivelCentavos: number | null }[]): ResumoOrcamento; // ResumoOrcamento ganha combustivelCentavos: number
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("502 km a 12 km/l e R$ 6,29: 41,8 l e R$ 262,92", () => assert.deepEqual(estimarCombustivel(502, 12, 629), { litros: 41.8, custoCentavos: 26292 }));
it("sem consumo ou sem preço: null", );
it("o orçamento soma o combustível no dia do trecho e no total", /* itens dia 1 R$ 50; trecho dia 1 R$ 262,92 → porDia[1] 31292, combustivelCentavos 26292, restante descontado */);
it("só consumo informado gera o aviso 'Informe o consumo e o preço do litro para estimar o combustível.'", /* integração */);
it("salvar grava litros e custo de cada trecho e o orçamento do roteiro mostra o combustível", /* integração */);
```

`custoCentavos = round(litros_sem_arredondar × preço)`; `litros` exibido com 1 casa.

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** unidade + integração — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: estimativa de combustivel da viagem de carro no orcamento"`.

### Task 18: Combustível no front

**Files:**
- Modify: `frontend/src/components/viagem/CaixaViagemDeCarro.tsx` (campos "Consumo do carro (km/l)" e "Preço do litro (R$)"; consumo vem de `usuario.consumoKmPorLitro`; preço lembrado em `localStorage` na chave `nomadplan.precoDoLitro`, com `try/catch`)
- Create: `frontend/src/components/viagem/ResumoCombustivel.tsx` ("Combustível estimado: {km} · ~{litros} l · ~{R$}")
- Modify: `frontend/src/components/viagem/TrechoNaEstrada.tsx` (· ~{litros} l · ~{R$}), `frontend/src/components/roteiro/PainelOrcamento.tsx` (linha "Combustível"), `frontend/src/pages/RoteiroDetalhes.tsx`
- Modify: `e2e/testes/12-viagem-de-carro.spec.ts`

- [ ] **Step 1: Write the failing E2E assertions** no teste da ida: consumo 12 no Perfil, preço "6,29" → resumo "Combustível estimado" visível; no roteiro salvo, o painel de orçamento mostra "Combustível"; sem preço, aparece "Informe o consumo e o preço do litro para estimar o combustível".
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** (`formatarMoeda` para R$). **Step 4: Run** lint/build e o E2E inteiro — Expected: `PLAYWRIGHT_EXIT=0`.
- [ ] **Step 5: Commit** — `git commit -m "feat(front): consumo e preco do litro na viagem de carro, com o combustivel no orcamento"`.

### Task 19: `viagem:preparar`, documentação e verificação final

**Files:**
- Create: `backend/src/scripts/prepararViagem.ts`; Modify: `backend/package.json` (`viagem:preparar`)
- Modify: `docs/api.md`, `docs/dicionario-de-dados.md`, `docs/operacao.md`, `docs/seguranca.md`, `frontend/src/pages/Privacidade.tsx`, `README.md` (seção curta "Viagem de carro"), `backend/.env.example`

- [ ] **Step 1: Implement `prepararViagem.ts`** — uso `npm run viagem:preparar -- "Joinville/SC" "Brasília/DF" [--km 500]`: resolve os dois com `procurarMunicipio`, busca as rotas de ida e de volta (`buscarRota`), roda a divisão com o alvo dado e busca os resumos de todas as cidades das faixas (`resumirCidades`), e imprime km, noites sugeridas e quantas cidades ficaram com resumo.
- [ ] **Step 2: Run** contra o banco `nomadplan` (com internet): `npm run viagem:preparar -- "Joinville/SC" "Brasília/DF"` — Expected: imprime ~1.500 km e 2 noites; `SELECT count(*) FROM rota_em_cache` ≥ 2.
- [ ] **Step 3: Write the docs** — `api.md`: `POST /cidades/perto`, `codigoIbge` na busca, campos novos da conta, bloco `viagemDeCarro` em `/roteiros/gerar` e `POST /roteiros`, leitura (spec 7); `dicionario-de-dados.md`: `municipio`, `rota_em_cache`, `trecho_estrada` e as colunas novas; `operacao.md`: `municipios:baixar`, `municipios:importar`, `viagem:preparar`, `OSRM_URL` e o roteiro de preparação da banca (preparar Brasília e a viagem antes); `seguranca.md` e `Privacidade.tsx`: GPS só para achar a cidade, sem gravar nem registrar em log, coordenadas arredondadas; município e consumo na exportação e na anonimização; créditos OSRM/OSM/IBGE.
- [ ] **Step 4: Final verification** — backend `npm run typecheck`, `npm run test:cobertura` (≥ 60%); front `npm run lint && npm run build`; `npm run e2e:preparar` e a suíte E2E inteira (`PLAYWRIGHT_EXIT=0`). Anote os totais de testes e a cobertura para o RFC.
- [ ] **Step 5: Commit** — `git commit -m "docs: viagem de carro na API, no dicionario de dados e na operacao, e preparo para a banca"`.
- [ ] **Step 6: Fechar a Parte 5** — OK do usuário para push + PR. Depois do merge das cinco partes, avise que o RFC precisa da seção da viagem de carro (com capturas novas) e dos números de testes.
