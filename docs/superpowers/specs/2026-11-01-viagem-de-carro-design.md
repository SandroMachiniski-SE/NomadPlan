# Viagem de carro com pernoites sugeridos — especificação

Data: 01/11/2026 · Entrega do projeto: 20/11/2026 · Base: branch `feat/fontes-de-dados-e-multicidade`

## 1. Objetivo

Quem mora longe do destino (ex.: Joinville → Brasília, ~1.507 km pela estrada) quer planejar a ida de
carro dirigindo uma distância por dia que ela mesma escolhe (ex.: 500 km). O NomadPlan divide o
percurso em dias, sugere em que cidade dormir ao fim de cada dia e junta isso ao roteiro que já
existe (dias no destino, caderno de viagem, multicidade).

Sucesso: a pessoa cadastra onde mora, pede "Brasília, 4 dias, de carro, 500 km por dia, com volta" e
recebe um roteiro com os dias de estrada (km e tempo reais), uma cidade de pernoite sugerida por noite
com alternativas, os dias em Brasília e a volta; salva e vê tudo no roteiro, inclusive a estrada no mapa.

## 2. Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Faixa do pernoite | Alvo de km por dia (padrão 500) e busca entre alvo − 50 e alvo + 50 km (450–550), contados a partir do pernoite anterior. A faixa existe porque no km exato pode não haver onde dormir. |
| Destino perto | Quando o que falta passa um pouco da faixa, a pessoa decide entre esticar e chegar ou dormir antes. **Vem marcado "esticar e chegar".** |
| Ordem das sugestões | Perto do alvo, mais hospedagens e ter o que ver. O desvio da estrada não entra na nota (só limita a busca a um corredor). |
| Volta | Opcional (caixa "Planejar a volta"), com o mesmo cálculo e escolhas independentes da ida. |
| Onde a pessoa mora | No cadastro e no Perfil: busca de cidades do Brasil + botão "Usar minha localização" (GPS do navegador). Guarda só o município, nunca o ponto exato. Opcional. |
| Escolha do pernoite | O sistema entrega a viagem montada com a melhor cidade de cada noite e até 3 alternativas; trocar recalcula os dias seguintes. Na mesma tela se escolhe o hotel ou "hotel a definir". |
| Abordagem técnica | Serviços abertos + PostGIS: rota pelo OSRM, municípios do IBGE no banco, hospedagens e atrações pelo Overpass, tudo com cache no banco. |

## 3. Fora do escopo

- Dividir em dias um trecho longo **entre etapas** (ex.: Brasília → Salvador no meio da viagem): entre
  etapas continua a estimativa atual em linha reta.
- Limite por horas de direção (só km), paradas para abastecer/almoçar, pedágios e custo de combustível.
- Rotas alternativas (o OSRM devolve a principal) e escolher a estrada.
- Reservas de hotel ou preços.
- OSRM próprio em Docker e Google Routes: ficam como evolução (bastará trocar `OSRM_URL`).

## 4. Fontes externas

| Fonte | Uso | Licença / política | Configuração |
|---|---|---|---|
| OSRM (servidor público de demonstração, `router.project-osrm.org`) | Rota de carro: metros, segundos e traçado | Dados © colaboradores do OpenStreetMap (ODbL); uso leve, 1 consulta/s, com User-Agent | `OSRM_URL` (alternativa: `https://routing.openstreetmap.de/routed-car`) |
| Overpass (já usado) | Hospedagens e atrações perto das cidades candidatas | ODbL, mesma fila e User-Agent (`AGENTE`) de `baixarCidade.ts` | `OVERPASS_URL` (já existe) |
| Municípios do IBGE | 5.570 municípios com código, nome, UF e coordenadas da sede | Conjunto `kelvins/municipios-brasileiros` (MIT), derivado do IBGE; créditos aos dois. Na implementação, conferir a licença no repositório e a contagem de 5.570 | Arquivo versionado `backend/prisma/dados/municipios.json` |

A tela do resultado e a documentação creditam "Rotas: OSRM · dados © colaboradores do OpenStreetMap".

## 5. Modelo de dados

Migrations escritas à mão e aplicadas com `npx prisma migrate deploy`, como as anteriores.

### 5.1 `municipio` (nova)

| Coluna | Tipo | Observação |
|---|---|---|
| `codigo_ibge` | int, PK | 7 dígitos |
| `nome` | text | Com acentos ("Brasília") |
| `nome_normalizado` | text | `normalizarCidade(nome)`, para buscar sem acento; índice |
| `uf` | char(2) | |
| `latitude`, `longitude` | double precision | Sede do município |
| `geom` | geography(Point, 4326), gerada | Índice GIST |
| `resumo_osm` | jsonb, nulo | Cache do Overpass (5.6) |
| `resumo_em` | timestamptz, nulo | Quando o resumo foi buscado; vale 30 dias |

Carga: `npm run municipios:importar` (idempotente, `upsert` por código) e o seed. Índice comum (não
único) em `(nome_normalizado, uf)`: se a procura por nome e UF achar mais de um município, a etapa
pede para escolher na busca (que devolve o código).

### 5.2 `usuario`

- Nova `codigo_municipio_base` int, nulo, FK → `municipio`.
- `cidade_base` (texto) continua e é preenchido com o nome do município sempre que o código for
  gravado, porque a recomendação por cidade já usa esse campo. Quem tem só o texto antigo continua
  funcionando; a viagem de carro pede "Saindo de" nesse caso.

### 5.3 `rota_em_cache` (nova)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | serial PK | |
| `codigo_origem`, `codigo_destino` | int, FK → `municipio` | Único `(codigo_origem, codigo_destino)`; ida e volta são registros separados |
| `metros`, `segundos` | int | Totais do OSRM |
| `tracado` | geometry(LineString, 4326) | Simplificado com `ST_Simplify` (tolerância 0,005°) |
| `buscada_em` | timestamptz | Vale 90 dias; vencida ainda é usada se o OSRM falhar |

### 5.4 `roteiro`

Novas colunas, todas nulas (roteiro sem viagem de carro não muda):
`viagem_origem` (FK → `municipio`), `viagem_destino` (FK → `municipio`), `km_por_dia` int,
`viagem_volta` boolean.

### 5.5 `trecho_estrada` (nova)

Um registro por dia de estrada de um roteiro salvo.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | serial PK | |
| `id_roteiro` | int, FK → `roteiro`, `ON DELETE CASCADE` | Índice |
| `dia` | int | Número do dia no roteiro; único `(id_roteiro, dia)` |
| `sentido` | text (`IDA` ou `VOLTA`) | CHECK |
| `de_nome`, `para_nome` | text | "Joinville/SC", "Campinas/SP" |
| `metros`, `segundos` | int | |
| `tracado` | jsonb | Lista `[lat, lon]` do trecho, só para desenhar (máx. 400 pontos) |

O trecho é informativo e fica preso ao número do dia: mover paradas de dia não o altera; o histórico
de versões (`VersaoRoteiro`) passa a guardar os trechos e os campos da viagem, para que restaurar uma
versão traga tudo de volta (campos novos opcionais em `DadosVersaoRoteiro`, como já foi feito com
`pernoite`).

O pernoite de um dia de estrada é um `item_roteiro` com `pernoite = true`, como hoje: com o hotel
escolhido (`id_ponto`) ou com o título "Pernoite em Campinas (hotel a definir)".

### 5.6 Formato de `municipio.resumo_osm`

```json
{
  "hospedagens": [
    { "idOsm": "node/123", "nome": "Hotel Exemplo", "tipo": "hotel",
      "latitude": -22.9, "longitude": -47.06, "tags": { "phone": "...", "website": "...", "stars": "3" } }
  ],
  "atracoes": [{ "idOsm": "way/456", "nome": "Museu Exemplo" }],
  "totalHospedagens": 18,
  "totalAtracoes": 7
}
```

Guarda no máximo 40 hospedagens (as mais completas: com telefone, site ou estrelas primeiro) e 10
atrações; os totais contam todas. As `tags` guardadas são as que o classificador `osm.ts` precisa
para virar ponto do catálogo.

## 6. Cálculo

### 6.1 Constantes (em `backend/src/lib/viagemDeCarro.ts`)

| Constante | Valor |
|---|---|
| `KM_POR_DIA_PADRAO` | 500 (aceito: 150 a 1.000) |
| `FAIXA_KM` | 50 (busca em alvo ± 50) |
| `FAIXA_ALARGADA_KM` | 100 (alvo ± 100, quando a faixa não tem hospedagem) |
| `DIA_CURTO` | 30% do alvo (150 km com alvo de 500) |
| `CORREDOR_KM` | 20 (distância máxima da sede à estrada) |
| `RAIO_DA_CIDADE_KM` | 8 (raio da contagem de hospedagens e atrações) |
| `MAX_ALTERNATIVAS` | 3 |
| `MAX_DIAS_DA_VIAGEM` | 21 (estrada de ida + destino + estrada de volta) |
| Pesos da nota | proximidade 0,40 · hospedagens 0,35 · atrações 0,25 |

### 6.2 Rota

`buscarRota(origem, destino)` em `backend/src/lib/rotas.ts`:

1. Se há registro em `rota_em_cache` com menos de 90 dias, usa.
2. Senão chama `GET {OSRM_URL}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`
   (User-Agent `AGENTE`, fila de 1 consulta/s, tempo limite de 15 s) e grava no cache.
3. Se o OSRM falhar e houver cache vencido, usa o vencido. Sem cache: erro `ErroRota`.
4. `code = "NoRoute"` vira erro `SemEstrada` ("Não há estrada entre X e Y").

### 6.3 Cidades ao longo da estrada

Uma consulta SQL por rota (`candidatosDaRota`):

- municípios com `ST_DWithin(m.geom, rota::geography, 20 000)`, menos origem e destino;
- `fracao = ST_LineLocatePoint(rota, m.geom::geometry)`;
- `km = ST_Length(ST_LineSubstring(rota, 0, fracao)::geography) × (metros_do_osrm / ST_Length(rota::geography)) / 1000`
  — o comprimento geodésico da parte do traçado até a cidade, escalado para a distância real da estrada
  (o traçado simplificado é um pouco mais curto que a estrada);
- `desvio_km = ST_Distance(m.geom, rota::geography) / 1000`.

Resultado: `{ codigoIbge, cidade, uf, latitude, longitude, km, desvioKm }[]`, ordenado por `km`.

### 6.4 Divisão em dias (função pura `dividirEmDias`)

Entradas: `totalKm`, `alvoKm`, candidatos (com resumo ou `null` quando não foi possível contar),
`escolhas` (`dia → codigoIbge`) e `decisoes` (`dia → esticar: boolean`).

```
pos = 0; dia = 1
repita:
  restante = totalKm − pos
  se restante ≤ alvo + FAIXA_KM:
      dia de chegada (sem pernoite); fim
  se restante ≤ alvo + FAIXA_KM + DIA_CURTO:
      cria decisão do dia; esticar = decisoes[dia] ?? true
      se esticar: dia de chegada com `restante` km; fim
  faixa = [pos + alvo − FAIXA_KM, pos + alvo + FAIXA_KM]
  candidatos da faixa com totalHospedagens ≥ 1
  se nenhum: faixa alargada [pos + alvo − 100, pos + alvo + 100] + aviso
  se ainda nenhum: pernoite "a definir" na cidade (sem hospedagem) mais perto de pos + alvo + aviso;
                  se nem isso existir, pernoite "a definir" no km pos + alvo, sem cidade, + aviso
  ordena pela nota (desempate: menor desvio, depois menor km)
  escolhida = escolhas[dia] se estiver entre os candidatos da faixa usada; senão a melhor
             (escolha que saiu da faixa gera aviso "a cidade escolhida para a noite do dia N mudou")
  alternativas = as 3 seguintes
  pos = escolhida.km; dia = dia + 1
```

Nota de cada candidato (todas as partes entre 0 e 1):

- proximidade = `max(0, 1 − |km − (pos + alvo)| / largura)`, `largura` = 50 ou 100 (faixa alargada);
- hospedagens = `min(1, ln(1 + n) / ln(21))`;
- atrações = `min(1, ln(1 + n) / ln(11))`;
- nota = `0,40 × proximidade + 0,35 × hospedagens + 0,25 × atrações`.

Sem resumo (Overpass indisponível), a nota é só a proximidade, nenhuma cidade é descartada por falta
de hospedagem e o resultado leva o aviso "não foi possível contar os hotéis agora".

Cada dia sai com `metros` (diferença de km) e `segundos = segundos_da_rota × metros_do_dia / metros_da_rota`,
e com o pedaço do traçado (`ST_LineSubstring` entre as frações de início e fim, até 400 pontos).

Exemplo esperado (alvo 500): 1.507 km → 3 dias, 2 pernoites, chegada no 3º; 1.120 km → dia 1 até a
faixa, no dia 2 faltam ~620 km → decisão marcada "esticar" (chega no dia 2); com "dormir", chega no
dia 3 com ~120 km; 540 km → 1 dia, sem pernoite.

### 6.5 Resumos das cidades (`resumirCidades`)

Antes de dividir, para os candidatos das faixas que serão avaliadas:

- os que têm `resumo_em` com menos de 30 dias usam o cache;
- os demais vão numa só consulta ao Overpass por divisão (todas as faixas juntas):
  `nwr(around:8000, lat, lon)` de cada cidade para `tourism` em
  `hotel|motel|guest_house|hostel|chalet|apartment` e para as atrações
  (`tourism=attraction|museum|viewpoint|gallery|zoo|theme_park`, `historic`, `leisure=park`,
  `natural=beach|waterfall`, `waterway=waterfall`), só elementos com nome, `out center tags`,
  `[timeout:25]`;
- cada elemento vai para a cidade candidata mais próxima dentro de 8 km;
- o resultado é gravado em `resumo_osm`/`resumo_em`.

Como a faixa do dia 2 depende do pernoite do dia 1, a função calcula a divisão, junta as cidades das
faixas que ainda não têm resumo, busca esses resumos e refaz a divisão até não faltar nenhum
(no máximo 3 rodadas; o que faltar depois disso entra sem resumo).

### 6.6 Viagem completa

`planejarViagemDeCarro({ origem, destino, origemVolta, kmPorDia, comVolta, diasNoDestino, escolhas, decisoes })`
(`destino` = 1ª etapa; `origemVolta` = última etapa):

- dias de ida: 1…n (o dia n termina no destino);
- dias no destino: n+1…n+D, gerados pelo `gerarRoteiroSugerido` atual com as etapas (os números de
  dia da resposta atual são deslocados em n);
- dias de volta, se marcada: n+D+1…, rota da última etapa até a origem, com escolhas e decisões
  próprias (chave `VOLTA`);
- total acima de 21 dias → erro 400 "Com X km por dia a viagem passa de 21 dias; aumente os km por dia
  ou diminua os dias no destino";
- distância até o destino ≤ alvo + 50 → um dia de estrada sem pernoite e o aviso "o destino fica a
  menos de um dia de estrada".

## 7. API

### 7.1 Cidades

- `GET /cidades/buscar` (existente): cada resultado ganha `codigoIbge` (procurado em `municipio` por
  nome normalizado + UF; `null` se não achar). Se o Nominatim falhar, a busca passa a usar a tabela
  `municipio` (hoje só usa as cidades que já têm pontos).
- `POST /cidades/perto` (nova, pública, com limite de requisições): corpo `{ latitude, longitude }`,
  resposta `{ codigoIbge, cidade, uf, latitude, longitude }` do município com a sede mais próxima
  (`ORDER BY geom <-> ponto LIMIT 1`). É `POST` de propósito: o `morgan` registra a URL, e as
  coordenadas não podem aparecer em log. O front arredonda para 2 casas (~1 km) antes de enviar; o
  servidor não grava nada.

### 7.2 Conta

- `POST /auth/registrar` e `PUT /auth/me`: aceitam `codigoMunicipioBase` (inteiro, opcional; no `PUT`
  aceita `null` para limpar). Código inexistente → 400. Ao gravar, `cidadeBase` recebe o nome do município.
- `GET /auth/me` e `GET /auth/me/dados` (portabilidade LGPD): devolvem `municipioBase: { codigoIbge, cidade, uf } | null`.

### 7.3 Geração (`POST /roteiros/gerar`, existente)

- Cada etapa ganha `codigoIbge` opcional. Sem ele, a cidade da etapa é procurada em `municipio` pelo
  nome (aceitando "Brasília, DF" ou "Brasília/DF"); nome repetido em UFs diferentes sem UF → 400
  "Informe a UF de X". Isso só é necessário quando há viagem de carro.
- Novo bloco opcional:

```ts
viagemDeCarro?: {
  origem?: number;            // código IBGE; padrão: o município de casa do usuário
  kmPorDia?: number;          // 150 a 1000; padrão 500
  comVolta?: boolean;         // padrão false
  escolhas?: { sentido: "IDA" | "VOLTA"; dia: number; codigoIbge: number }[];   // "dia" = número no roteiro
  decisoes?: { sentido: "IDA" | "VOLTA"; dia: number; esticar: boolean }[];
}
```

Sem `origem` e sem município de casa → 400 "Informe de onde você sai".

- A resposta atual ganha:

```ts
viagemDeCarro: {
  origem: Municipio; destino: Municipio; kmPorDia: number; comVolta: boolean;
  ida: TrechoPlanejado;
  volta: TrechoPlanejado | null;
} | null

TrechoPlanejado = { metros: number; segundos: number; dias: DiaDeEstrada[]; avisos: string[] }

DiaDeEstrada = {
  dia: number; sentido: "IDA" | "VOLTA";
  de: string; para: string; metros: number; segundos: number;
  tracado: [number, number][];
  pernoite: CidadeDePernoite | null;        // null no dia de chegada
  alternativas: CidadeDePernoite[];
  decisao: { esticar: boolean; metrosEsticando: number; metrosNoDiaSeguinte: number } | null;
}

CidadeDePernoite = {
  codigoIbge: number | null; cidade: string; uf: string | null; km: number; distanciaDoAlvoKm: number;
  totalHospedagens: number | null; totalAtracoes: number | null;
  hospedagens: { idOsm: string; nome: string; tipo: string }[];   // até 40
  atracoes: string[];                                             // até 5 nomes
  aDefinir: boolean;
}
```

Os dias no destino (já existentes em `pontos` e `dias`) vêm com os números deslocados.

### 7.4 Salvamento (`POST /roteiros`, existente)

Ganha o bloco opcional:

```ts
viagemDeCarro?: {
  origem: number; destino: number; kmPorDia: number; comVolta: boolean;
  origemVolta?: number;        // última etapa, quando há volta
  diasNoDestino: number;
  escolhas: ...; decisoes: ...;          // os mesmos enviados na geração
  // Uma entrada por noite de estrada, como a pessoa viu na tela: a cidade do pernoite e o hotel
  // escolhido (sem idOsm = "hotel a definir").
  noites: { sentido: "IDA" | "VOLTA"; dia: number; codigoIbge: number | null; idOsm?: string }[];
}
```

O servidor **recalcula** os dias de estrada a partir do cache (mesmas entradas → mesmo resultado),
em vez de confiar em metros e traçados vindos do navegador, e na mesma transação:

1. grava os campos da viagem em `roteiro` e um `trecho_estrada` por dia de estrada;
2. coloca no catálogo todas as hospedagens do resumo das cidades de pernoite (pelo classificador
   `osm.ts` e o `upsert` por `idOsm` de `importacaoOsm.ts`, com `origem = OSM`);
3. cria o `item_roteiro` de pernoite de cada noite: o hotel de `noites` (procurado no resumo daquela
   cidade; `idOsm` que não está no resumo → 400) ou o título "Pernoite em X (hotel a definir)";
4. grava as paradas de `pontos` (dias no destino) como hoje.

Se as noites recalculadas (dia e cidade) forem diferentes das de `noites` (ex.: cache vencido e rota
nova), responde 409 "A rota mudou desde a geração; gere de novo" e nada é gravado.

### 7.5 Leitura (`GET /roteiros/:id`, `GET /roteiros/publico/:slug`)

Ganham `viagemDeCarro: { origem, destino, kmPorDia, comVolta } | null` e
`trechosDeEstrada: { dia, sentido, de, para, metros, segundos, tracado }[]`. Em `viagensEntreDias`,
o dia que tem trecho de estrada usa os metros e segundos do trecho no lugar da estimativa em linha
reta, com a marca `estrada: true`.

## 8. Telas

### 8.1 Cadastro e Perfil

Componente `CampoMinhaCidade` (`frontend/src/components/`), usado nos dois:

- campo "Onde você mora (opcional)" com a busca de cidades do Brasil (`buscarCidadesDoBrasil`), que
  guarda o `codigoIbge` escolhido;
- botão "Usar minha localização": `navigator.geolocation.getCurrentPosition` → `POST /cidades/perto`
  → preenche o campo; a pessoa confere antes de salvar. Sem permissão ou sem GPS: mensagem e o campo
  continua disponível;
- texto curto: "Usamos só para saber a sua cidade; não guardamos o ponto exato."

### 8.2 Gerador (`/roteiros/gerar`)

- Caixa "Vou de carro saindo de casa" acima das etapas. Marcada, mostra "Saindo de" (já preenchido com
  a cidade de casa; troca com o mesmo componente de busca), "Km por dia" (500) e "Planejar a volta".
- A estrada vai até a 1ª etapa e, com volta, sai da última.
- O resultado mostra os dias de estrada antes (e depois, na volta) dos dias no destino:
  - cabeçalho "Dia 1 · Estrada · Joinville/SC → Campinas/SP · 502 km · ~6h10";
  - cartão de pernoite: cidade, "18 hospedagens", "tem: Museu X, Parque Y", lista de hotéis com
    "Hotel a definir" como primeira opção, e "Trocar cidade" com as alternativas (km, distância do
    alvo, hospedagens, atrações). Trocar chama a geração de novo com `escolhas`;
  - cartão de decisão quando o destino está perto: "◉ Esticar e chegar hoje (620 km · ~7h30)" e
    "○ Dormir no caminho e chegar amanhã com ~120 km". Mudar chama a geração com `decisoes`;
  - avisos no mesmo lugar dos avisos de hoje;
  - mapa com a estrada (`Polyline` do `react-leaflet`, já usado em `MapaRoteiro.tsx`) e os pernoites
    com 🛏, e o crédito "Rotas: OSRM · dados © colaboradores do OpenStreetMap".
- Enquanto calcula: "Calculando a rota…" (a primeira vez pode levar alguns segundos por causa do
  Overpass).
- "Salvar como meu roteiro" envia `viagemDeCarro` com as escolhas, as decisões e as noites (cidade e
  hotel de cada uma).

### 8.3 Roteiro salvo (detalhe e público)

- No dia de estrada, a faixa da viagem mostra "🚗 Joinville/SC → Campinas/SP · 502 km · ~6h10".
- O mapa desenha a estrada a partir de `trechosDeEstrada`.
- O pernoite "hotel a definir" se troca pelo formulário "Onde dormir" que já existe: as hospedagens da
  cidade de pernoite já estão no catálogo (7.4, passo 2).

## 9. Erros e degradação

| Situação | Comportamento |
|---|---|
| OSRM fora do ar ou lento (15 s) | Usa cache, mesmo vencido. Sem cache: 503 "Não consegui calcular a rota agora; tente de novo em alguns minutos". Nunca cai para linha reta. |
| Overpass fora do ar | Ordena só pela distância, sem descartar cidades; aviso; pernoites "hotel a definir". |
| Sem estrada (ex.: Fernando de Noronha) | 422 "Não há estrada entre X e Y". |
| Destino a menos de um dia | Um dia de estrada, sem pernoite, com aviso. |
| Faixa sem hospedagem | Faixa alargada (±100) com aviso; depois "a definir". |
| Sem casa e sem "Saindo de" | 400 "Informe de onde você sai". |
| Mais de 21 dias | 400 com a explicação (6.6). |
| Rota mudou entre gerar e salvar | 409, nada gravado (7.4). |

## 10. Privacidade e uso responsável

- O município de casa é dado pessoal: entra na exportação de dados (`/auth/me/dados`) e é apagado na
  anonimização da conta, como `cidade_base`.
- As coordenadas do GPS só existem durante a requisição de `POST /cidades/perto`: não são gravadas nem
  registradas em log, e chegam arredondadas.
- `docs/seguranca.md` e a página de privacidade ganham um parágrafo sobre isso.
- Servidores públicos: User-Agent identificado, fila de 1 consulta/s, cache no banco e créditos ao
  OpenStreetMap/OSRM.

## 11. Testes

**Unidade (node:test + tsx, sem banco e sem internet)**

- `dividirEmDias`: 1.507/500 → 3 dias e 2 pernoites; 1.120 → decisão com esticar marcado e a versão
  "dormir"; 540 → 1 dia sem pernoite; faixa sem hospedagem → alargada + aviso; nada na alargada →
  "a definir"; troca no dia 1 muda a faixa do dia 2 e descarta escolha que saiu dela; sem resumos →
  só proximidade + aviso; desempates.
- Nota: proximidade, escala logarítmica e pesos.
- Clientes: leitura da resposta do OSRM (`Ok`, `NoRoute`, erro HTTP, tempo esgotado) e montagem/leitura
  do resumo do Overpass (cada elemento na cidade mais próxima dentro do raio). `mapasFalsos.ts` passa a
  interceptar também o OSRM.

**Integração (`nomadplan_teste`)**

- `candidatosDaRota` com municípios e uma rota sintética: corredor de 20 km, km na rota, origem e
  destino fora.
- Cache: a segunda geração da mesma viagem não chama o OSRM; cache vencido é usado quando o OSRM falha.
- `POST /roteiros/gerar` com `viagemDeCarro` (ida, volta, escolhas, decisões, erros 400/422/503).
- `POST /roteiros` com viagem: trechos, pernoites com hotel e "a definir", hospedagens no catálogo,
  409 quando a rota muda; leitura com `trechosDeEstrada` e `viagensEntreDias` marcados como estrada;
  versão restaurada traz os trechos.
- Conta: `codigoMunicipioBase` no registro, no Perfil, na exportação e na anonimização.
- `POST /cidades/perto` devolve o município e não grava nada.

**E2E (`e2e/testes/12-viagem-de-carro.spec.ts`)**

O `preparar.ts` do E2E carrega no `nomadplan_e2e` alguns municípios, uma rota sintética
Joinville → Brasília (e a volta) em `rota_em_cache` e resumos em `resumo_osm`: o teste não usa a
internet e prova que a viagem funciona só com o cache.

- cadastro com "Onde você mora";
- gerar Brasília de carro, trocar o pernoite do dia 1, ver a decisão de chegada, salvar;
- no roteiro salvo, a faixa 🚗 com km e tempo.

Cobertura do backend continua acima de 60% (hoje 92%).

## 12. Entrega em 4 PRs

1. **Municípios e onde a pessoa mora**: tabela `municipio`, `municipios:importar`, `codigoIbge` em
   `/cidades/buscar` e busca local quando o Nominatim falha, `POST /cidades/perto`,
   `codigoMunicipioBase` na conta, `CampoMinhaCidade` no cadastro e no Perfil.
2. **Rota e divisão em dias (backend)**: `rota_em_cache`, cliente OSRM, `candidatosDaRota`, resumos do
   Overpass, `dividirEmDias`, `viagemDeCarro` em `POST /roteiros/gerar`.
3. **Telas e salvamento**: gerador com a viagem de carro, cartões de pernoite e decisão, mapa com a
   estrada, `trecho_estrada`, salvamento, detalhe e público.
4. **Volta, banca e documentação**: volta, `npm run viagem:preparar -- "Joinville/SC" "Brasília/DF"`
   (aquece rota de ida e volta e resumos no banco), E2E, `api.md`, `dicionario-de-dados.md`,
   `operacao.md` (`OSRM_URL`, comandos novos), `seguranca.md`. O RFC é atualizado depois, junto com as
   demais novidades.

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Internet instável na banca | `viagem:preparar` antes da apresentação; tudo funciona pelo cache. |
| Brasília sem pontos para os dias no destino | Preparar a cidade antes (preparo sob demanda ou `osm:baixar`). |
| OSRM público mudar a política ou sair do ar | `OSRM_URL` configurável (FOSSGIS ou OSRM próprio). |
| Overpass lento na primeira geração | Uma consulta só por rodada, `[timeout:25]`, cache de 30 dias e mensagem "Calculando a rota…". |
| Km estimado da cidade diferente do real | Comprimento geodésico escalado pela distância do OSRM (6.3); a faixa de ±50 km absorve a diferença. |
