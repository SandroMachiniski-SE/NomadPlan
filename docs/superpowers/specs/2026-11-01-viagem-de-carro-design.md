# Viagem de carro com pernoites sugeridos — especificação

Data: 01/11/2026 · Entrega do projeto: 20/11/2026 · Base: branch `feat/fontes-de-dados-e-multicidade`

## 1. Objetivo

Quem mora longe do destino (ex.: Joinville → Brasília, ~1.507 km pela estrada) quer planejar a viagem
de carro dirigindo por dia a distância (e, se quiser, o máximo de horas ao volante) que ela mesma
escolhe. O NomadPlan divide cada perna da viagem em dias, sugere em que cidade dormir ao fim de cada
dia, estima o combustível com os dados do carro da pessoa e junta tudo ao roteiro que já existe (dias
nas cidades, caderno de viagem, multicidade, orçamento).

Sucesso: a pessoa cadastra onde mora e o consumo do carro, pede "Brasília 4 dias → Goiânia 2 dias, de
carro, 500 km ou 7 h por dia, com volta, gasolina a R$ 6,29" e recebe um roteiro com os dias de
estrada (km, tempo e combustível reais), uma cidade de pernoite sugerida por noite com alternativas,
os dias nas cidades e a volta; salva e vê tudo no roteiro, com a estrada no mapa e o combustível no
orçamento.

## 2. Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Faixa do pernoite | Alvo de km por dia (padrão 500) e busca entre alvo − 50 e alvo + 50 km (450–550), contados a partir do pernoite anterior. A faixa existe porque no km exato pode não haver onde dormir. |
| Horas de direção | Opcional: "no máximo N horas ao volante". O dia termina no limite que chegar primeiro (km ou horas). |
| Destino perto | Quando o que falta passa um pouco da faixa, a pessoa decide entre esticar e chegar ou dormir antes. **Vem marcado "esticar e chegar".** |
| Ordem das sugestões | Perto do alvo, mais hospedagens e ter o que ver. O desvio da estrada não entra na nota (só limita a busca a um corredor). |
| Pernas da viagem | Com a viagem de carro, todas as pernas usam a rota real: casa → 1ª cidade, entre as cidades e, com volta, última cidade → casa. Perna maior que um dia de estrada é dividida em dias com pernoite. |
| Dia da chegada | Se depois da direção sobrarem pelo menos 2 horas de passeio, o dia da chegada já conta como o 1º dia na cidade; senão é dia só de estrada. Volta curta fica no fim do último dia na cidade. |
| Volta | Opcional (caixa "Planejar a volta"), com o mesmo cálculo e escolhas próprias. |
| Combustível | Consumo do carro (km/l) e preço do litro informados pela pessoa. O consumo pode ficar guardado no Perfil e vem preenchido; o preço é digitado na viagem (o navegador lembra o último). Sem os dois, não há estimativa. O custo entra no orçamento do roteiro. |
| Onde a pessoa mora | No cadastro e no Perfil: busca de cidades do Brasil + botão "Usar minha localização" (GPS do navegador). Guarda só o município, nunca o ponto exato. Opcional. |
| Escolha do pernoite | O sistema entrega a viagem montada com a melhor cidade de cada noite e até 3 alternativas; trocar recalcula os dias seguintes daquela perna. Na mesma tela se escolhe o hotel ou "hotel a definir". |
| Abordagem técnica | Serviços abertos + PostGIS: rota pelo OSRM, municípios do IBGE no banco, hospedagens e atrações pelo Overpass, tudo com cache no banco. |

## 3. Fora do escopo

Ficam registrados no RFC como evolução:

- pedágio (não há fonte única e aberta: praças federais na ANTT, estaduais em outras bases);
- rotas alternativas (o OSRM devolve a principal) e escolher a estrada;
- reservas de hotel ou preços de diárias;
- paradas para abastecer ou almoçar e o deslocamento dentro das cidades no cálculo do combustível;
- OSRM próprio em Docker e Google Routes (bastará trocar `OSRM_URL`).

## 4. Fontes externas

| Fonte | Uso | Licença / política | Configuração |
|---|---|---|---|
| OSRM (servidor público de demonstração, `router.project-osrm.org`) | Rota de carro: metros, segundos, traçado e tempo ao longo da estrada | Dados © colaboradores do OpenStreetMap (ODbL); uso leve, 1 consulta/s, com User-Agent | `OSRM_URL` (alternativa: `https://routing.openstreetmap.de/routed-car`) |
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
| `nome_normalizado` | text | `normalizarCidade(nome)`, para buscar sem acento |
| `uf` | char(2) | |
| `latitude`, `longitude` | double precision | Sede do município |
| `geom` | geography(Point, 4326), gerada | Índice GIST |
| `resumo_osm` | jsonb, nulo | Cache do Overpass (5.6) |
| `resumo_em` | timestamptz, nulo | Quando o resumo foi buscado; vale 30 dias |

Carga: `npm run municipios:importar` (idempotente, `upsert` por código) e o seed. Índice comum (não
único) em `(nome_normalizado, uf)`: se a procura por nome e UF achar mais de um município, a etapa
pede para escolher na busca (que devolve o código).

### 5.2 `usuario`

- `codigo_municipio_base` int, nulo, FK → `municipio`.
- `consumo_km_por_litro` numeric(4,1), nulo — consumo do carro da pessoa (3 a 40 km/l).
- `cidade_base` (texto) continua e é preenchido com o nome do município sempre que o código for
  gravado, porque a recomendação por cidade já usa esse campo. Quem tem só o texto antigo continua
  funcionando; a viagem de carro pede "Saindo de" nesse caso.

### 5.3 `rota_em_cache` (nova)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | serial PK | |
| `codigo_origem`, `codigo_destino` | int, FK → `municipio` | Único `(codigo_origem, codigo_destino)`; cada sentido é um registro |
| `metros`, `segundos` | int | Totais do OSRM |
| `tracado` | geometry(LineString, 4326) | Simplificado com `ST_Simplify` (tolerância 0,005°) |
| `perfil` | jsonb | Lista `[km, segundos]` acumulados a cada 5 km, montada das anotações do OSRM |
| `buscada_em` | timestamptz | Vale 90 dias; vencida ainda é usada se o OSRM falhar |

### 5.4 `roteiro`

Novas colunas, todas nulas (roteiro sem viagem de carro não muda): `viagem_origem` (FK → `municipio`),
`km_por_dia` int, `horas_por_dia` numeric(3,1), `viagem_volta` boolean,
`consumo_km_por_litro` numeric(4,1), `preco_litro_centavos` int.

### 5.5 `trecho_estrada` (nova)

Um registro por trecho dirigido de um roteiro salvo: cada dia só de estrada e cada trecho curto
descontado de um dia na cidade.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | serial PK | |
| `id_roteiro` | int, FK → `roteiro`, `ON DELETE CASCADE` | Índice `(id_roteiro, dia)` |
| `dia` | int | Número do dia no roteiro |
| `perna` | int | 0 = casa → 1ª cidade, 1 = 1ª → 2ª cidade, … |
| `noite` | int, nulo | 1ª, 2ª… noite da perna; nulo no trecho que chega à cidade |
| `de_nome`, `para_nome` | text | "Joinville/SC", "Campinas/SP" |
| `metros`, `segundos` | int | |
| `ocupa_o_dia` | boolean | `false` quando o trecho é descontado de um dia na cidade |
| `no_fim_do_dia` | boolean | `true` só na volta curta, no fim do último dia na cidade |
| `litros` | numeric(6,1), nulo | Sem consumo/preço, nulo |
| `custo_combustivel_centavos` | int, nulo | |
| `tracado` | jsonb | Lista `[lat, lon]` do trecho, só para desenhar (máx. 400 pontos) |

Um dia pode ter dois trechos (chegada curta de manhã e volta curta no fim do dia, quando a cidade tem
um dia só); a ordem é pela `perna`.

O trecho é informativo e fica preso ao número do dia: mover paradas de dia não o altera. O histórico de
versões (`VersaoRoteiro`) passa a guardar os trechos e os campos da viagem, para que restaurar uma
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
atrações; os totais contam todas. As `tags` guardadas são as que o classificador `osm.ts` precisa para
virar ponto do catálogo.

## 6. Cálculo

### 6.1 Constantes (em `backend/src/lib/viagemDeCarro.ts`)

| Constante | Valor |
|---|---|
| `KM_POR_DIA_PADRAO` | 500 (aceito: 150 a 1.000) |
| Horas ao volante por dia | opcional, 2 a 14 |
| `FAIXA_KM` | 50 (busca em alvo ± 50) |
| `FAIXA_ALARGADA_KM` | 100 (alvo ± 100, quando a faixa não tem hospedagem) |
| `DIA_CURTO` | 30% do alvo do dia (150 km com alvo de 500) |
| `CORREDOR_KM` | 20 (distância máxima da sede à estrada) |
| `RAIO_DA_CIDADE_KM` | 8 (raio da contagem de hospedagens e atrações) |
| `MAX_ALTERNATIVAS` | 3 |
| `HORAS_MINIMAS_DE_PASSEIO_NA_CHEGADA` | 2 |
| `PERFIL_A_CADA_KM` | 5 |
| `MAX_DIAS_DA_VIAGEM` | 21 (dias de estrada + dias nas cidades) |
| Consumo / preço aceitos | 3 a 40 km/l · R$ 1,00 a R$ 20,00 por litro |
| Pesos da nota | proximidade 0,40 · hospedagens 0,35 · atrações 0,25 |

### 6.2 Rota

`buscarRota(origem, destino)` em `backend/src/lib/rotas.ts`:

1. Se há registro em `rota_em_cache` com menos de 90 dias, usa.
2. Senão chama
   `GET {OSRM_URL}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson&annotations=distance,duration`
   (User-Agent `AGENTE`, fila de 1 consulta/s, tempo limite de 15 s), monta o `perfil` somando as
   anotações e guardando um par `[km, segundos]` a cada 5 km, e grava no cache.
3. Se o OSRM falhar e houver cache vencido, usa o vencido. Sem cache: erro `ErroRota`.
4. `code = "NoRoute"` vira erro `SemEstrada` ("Não há estrada entre X e Y").

`segundosAte(perfil, km)` e `kmApos(perfil, kmInicial, segundos)` interpolam o perfil; são as funções
que convertem horas em km e dão o tempo de cada trecho.

### 6.3 Cidades ao longo da estrada

Uma consulta SQL por rota (`candidatosDaRota`):

- municípios com `ST_DWithin(m.geom, rota::geography, 20 000)`, menos as duas pontas da perna;
- `fracao = ST_LineLocatePoint(rota, m.geom::geometry)`;
- `km = ST_Length(ST_LineSubstring(rota, 0, fracao)::geography) × (metros_do_osrm / ST_Length(rota::geography)) / 1000`
  — o comprimento geodésico da parte do traçado até a cidade, escalado para a distância real da
  estrada (o traçado simplificado é um pouco mais curto que a estrada);
- `desvio_km = ST_Distance(m.geom, rota::geography) / 1000`.

Resultado: `{ codigoIbge, cidade, uf, latitude, longitude, km, desvioKm }[]`, ordenado por `km`.

### 6.4 Divisão de uma perna em dias (função pura `dividirEmDias`)

Entradas: `totalKm`, `alvoKm`, `horasPorDia` (opcional), `perfil`, candidatos (com resumo ou `null`
quando não foi possível contar), `escolhas` (`noite → codigoIbge`) e `decisao` (`esticar` ou não).

O alvo de cada dia, a partir do km `pos`, é
`alvoDoDia = min(alvoKm, kmApos(perfil, pos, horasPorDia × 3600) − pos)` — sem horas, só `alvoKm`.

```
pos = 0; noite = 1
repita:
  restante = totalKm − pos
  se restante ≤ alvoDoDia + FAIXA_KM:
      trecho final (chega ao fim da perna); fim
  se restante ≤ alvoDoDia + FAIXA_KM + DIA_CURTO:
      cria a decisão da perna; esticar = decisao ?? true
      se esticar: trecho final com `restante` km; fim
  faixa = [pos + alvoDoDia − FAIXA_KM, pos + alvoDoDia + FAIXA_KM]
  candidatos da faixa com totalHospedagens ≥ 1
  se nenhum: faixa alargada (± FAIXA_ALARGADA_KM) + aviso
  se ainda nenhum: pernoite "a definir" na cidade (sem hospedagem) mais perto de pos + alvoDoDia + aviso;
                  se nem isso existir, pernoite "a definir" no km pos + alvoDoDia, sem cidade, + aviso
  ordena pela nota (desempate: menor desvio, depois menor km)
  escolhida = escolhas[noite] se estiver entre os candidatos da faixa usada; senão a melhor
             (escolha que saiu da faixa gera aviso "a cidade escolhida para a noite N mudou")
  alternativas = as 3 seguintes
  pos = escolhida.km; noite = noite + 1
```

Nota de cada candidato (todas as partes entre 0 e 1):

- proximidade = `max(0, 1 − |km − (pos + alvoDoDia)| / largura)`, `largura` = 50 ou 100 (faixa alargada);
- hospedagens = `min(1, ln(1 + n) / ln(21))`;
- atrações = `min(1, ln(1 + n) / ln(11))`;
- nota = `0,40 × proximidade + 0,35 × hospedagens + 0,25 × atrações`.

Sem resumo (Overpass indisponível), a nota é só a proximidade, nenhuma cidade é descartada por falta de
hospedagem e o resultado leva o aviso "não foi possível contar os hotéis agora".

Cada trecho sai com `metros` (diferença de km), `segundos = segundosAte(perfil, fim) − segundosAte(perfil, inicio)`
e o pedaço do traçado (`ST_LineSubstring` entre as frações de início e fim, até 400 pontos).

Exemplos esperados (alvo 500, sem horas): 1.507 km → 2 noites e o trecho final de ~507 km;
1.120 km → 1 noite, depois faltam ~620 km → decisão marcada "esticar" (trecho final de ~620 km); com
"dormir", 2 noites e trecho final de ~120 km; 540 km → só o trecho final. Com 7 h por dia numa perna
em que o OSRM estima 70 km/h, o alvo do dia cai para ~490 km.

### 6.5 Resumos das cidades (`resumirCidades`)

Antes de dividir, para os candidatos das faixas que serão avaliadas:

- os que têm `resumo_em` com menos de 30 dias usam o cache;
- os demais vão numa só consulta ao Overpass por rodada (todas as faixas de todas as pernas juntas):
  `nwr(around:8000, lat, lon)` de cada cidade para `tourism` em
  `hotel|motel|guest_house|hostel|chalet|apartment` e para as atrações
  (`tourism=attraction|museum|viewpoint|gallery|zoo|theme_park`, `historic`, `leisure=park`,
  `natural=beach|waterfall`, `waterway=waterfall`), só elementos com nome, `out center tags`,
  `[timeout:25]`;
- cada elemento vai para a cidade candidata mais próxima dentro de 8 km;
- o resultado é gravado em `resumo_osm`/`resumo_em`.

Como a faixa da noite 2 depende do pernoite da noite 1, a função divide, junta as cidades das faixas
que ainda não têm resumo, busca esses resumos e divide de novo até não faltar nenhum (no máximo 3
rodadas; o que faltar depois disso entra sem resumo).

### 6.6 Viagem completa (`planejarViagemDeCarro`)

Entradas: `origem` (casa), `etapas` (`{ codigoIbge, dias }[]`, as mesmas do gerador), `kmPorDia`,
`horasPorDia`, `comVolta`, `horasDisponiveis` (passeio por dia, do gerador), `consumoKmPorLitro`,
`precoLitroCentavos`, `escolhas` (`{ perna, noite, codigoIbge }[]`) e `decisoes` (`{ perna, esticar }[]`).

Pernas: `0` = casa → 1ª etapa, `1` = 1ª → 2ª etapa, …, e, com volta, última etapa → casa.

Para cada perna, em ordem, montando os números de dia:

1. busca a rota e divide a perna (6.4) com as escolhas e a decisão dela;
2. cada noite vira um **dia só de estrada** terminando no pernoite;
3. o **trecho final** (do último pernoite, ou do início da perna, até o fim dela):
   - se a perna termina numa etapa e `horasDisponiveis − horas do trecho ≥ 2`, ele é descontado do 1º
     dia da etapa (`ocupa_o_dia = false`), que fica com as horas de passeio que sobram, como o
     multicidade já faz hoje; senão vira um dia só de estrada e a etapa começa no dia seguinte;
   - na volta (perna termina em casa) sem noites e com `horasDisponiveis − horas do trecho ≥ 2`, ele
     é descontado do fim do último dia na última etapa (`no_fim_do_dia = true`); nos outros casos vira
     um dia só de estrada que chega em casa;
4. os dias da etapa seguinte são gerados pelo `gerarRoteiroSugerido` atual, que passa a receber, por
   etapa, o tempo real da chegada (no lugar da estimativa em linha reta) e a redução de horas do
   último dia quando a volta curta fica nele.

Total acima de 21 dias → erro 400 "Com X km por dia a viagem passa de 21 dias; aumente os km por dia
ou diminua os dias nas cidades". Perna que cabe num trecho só e é descontada do dia não gera aviso; a
viagem inteira sem nenhuma noite de estrada gera o aviso "nenhuma perna passa de um dia de estrada".

Exemplos com 6 h de passeio por dia: Joinville → Florianópolis (180 km, ~2h15) → o dia 1 já é em
Florianópolis com ~3h45 de passeio; Joinville → Brasília, alvo 500 → dias 1 e 2 de estrada com
pernoite, dia 3 só de estrada (~507 km, ~6h10, não sobram 2 h) e Brasília a partir do dia 4.

### 6.7 Combustível

Só quando a viagem tem consumo e preço:

- `litros = km_do_trecho / consumoKmPorLitro` (uma casa decimal);
- `custoCentavos = round(litros × precoLitroCentavos)`;
- total da viagem = soma dos trechos de todas as pernas.

`resumirOrcamento` (`backend/src/lib/orcamento.ts`) passa a receber também os trechos: o custo de
combustível de cada um entra em `porDia` (no dia do trecho) e no `totalCentavos`, e o resumo ganha
`combustivelCentavos`. `paradasSemCusto` não muda.

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
  aceita `null` para limpar). Código inexistente → 400. Ao gravar, `cidadeBase` recebe o nome do
  município.
- `PUT /auth/me`: aceita `consumoKmPorLitro` (3 a 40, ou `null` para limpar).
- `GET /auth/me` e `GET /auth/me/dados` (portabilidade LGPD): devolvem
  `municipioBase: { codigoIbge, cidade, uf } | null` e `consumoKmPorLitro`.

### 7.3 Geração (`POST /roteiros/gerar`, existente)

- Cada etapa ganha `codigoIbge` opcional. Sem ele, a cidade da etapa é procurada em `municipio` pelo
  nome (aceitando "Brasília, DF" ou "Brasília/DF"); nome repetido sem UF → 400 "Informe a UF de X".
  Isso só é necessário quando há viagem de carro.
- Novo bloco opcional:

```ts
viagemDeCarro?: {
  origem?: number;               // código IBGE; padrão: o município de casa do usuário
  kmPorDia?: number;             // 150 a 1000; padrão 500
  horasPorDia?: number;          // 2 a 14; opcional
  comVolta?: boolean;            // padrão false
  consumoKmPorLitro?: number;    // 3 a 40; sem ele (ou sem preço), não há estimativa de combustível
  precoLitroCentavos?: number;   // 100 a 2000
  escolhas?: { perna: number; noite: number; codigoIbge: number }[];
  decisoes?: { perna: number; esticar: boolean }[];
}
```

Sem `origem` e sem município de casa → 400 "Informe de onde você sai".

- A resposta atual ganha:

```ts
viagemDeCarro: {
  origem: Municipio; kmPorDia: number; horasPorDia: number | null; comVolta: boolean;
  consumoKmPorLitro: number | null; precoLitroCentavos: number | null;
  pernas: PernaPlanejada[];
  combustivel: { litros: number; custoCentavos: number } | null;   // total da viagem
  avisos: string[];
} | null

PernaPlanejada = {
  perna: number; de: Municipio; para: Municipio; metros: number; segundos: number;
  trechos: TrechoPlanejado[];
  decisao: { esticar: boolean; metrosEsticando: number; metrosNoDiaSeguinte: number } | null;
}

TrechoPlanejado = {
  dia: number; noite: number | null;            // noite nula no trecho que chega ao fim da perna
  de: string; para: string; metros: number; segundos: number;
  ocupaODia: boolean; noFimDoDia: boolean;
  litros: number | null; custoCentavos: number | null;
  tracado: [number, number][];
  pernoite: CidadeDePernoite | null;            // nulo no trecho final
  alternativas: CidadeDePernoite[];
}

CidadeDePernoite = {
  codigoIbge: number | null; cidade: string; uf: string | null; km: number; distanciaDoAlvoKm: number;
  totalHospedagens: number | null; totalAtracoes: number | null;
  hospedagens: { idOsm: string; nome: string; tipo: string }[];   // até 40
  atracoes: string[];                                             // até 5 nomes
  aDefinir: boolean;
}
```

Os dias nas cidades (já existentes em `pontos` e `dias`) vêm com os números ajustados aos dias de
estrada.

### 7.4 Salvamento (`POST /roteiros`, existente)

Ganha o bloco opcional:

```ts
viagemDeCarro?: {
  origem: number; etapas: { codigoIbge: number; dias: number }[]; horasDisponiveis: number;
  kmPorDia: number; horasPorDia?: number; comVolta: boolean;
  consumoKmPorLitro?: number; precoLitroCentavos?: number;
  escolhas: { perna: number; noite: number; codigoIbge: number }[];
  decisoes: { perna: number; esticar: boolean }[];
  // Uma entrada por noite de estrada, como a pessoa viu na tela: a cidade do pernoite e o hotel
  // escolhido (sem idOsm = "hotel a definir").
  noites: { perna: number; noite: number; codigoIbge: number | null; idOsm?: string }[];
}
```

O servidor **recalcula** a viagem a partir do cache (mesmas entradas → mesmo resultado), em vez de
confiar em metros e traçados vindos do navegador, e na mesma transação:

1. grava os campos da viagem em `roteiro` e um `trecho_estrada` por trecho;
2. coloca no catálogo todas as hospedagens do resumo das cidades de pernoite (pelo classificador
   `osm.ts` e o `upsert` por `idOsm` de `importacaoOsm.ts`, com `origem = OSM`);
3. cria o `item_roteiro` de pernoite de cada noite: o hotel de `noites` (procurado no resumo daquela
   cidade; `idOsm` que não está no resumo → 400) ou o título "Pernoite em X (hotel a definir)";
4. grava as paradas de `pontos` (dias nas cidades) como hoje.

Se as noites recalculadas (perna, noite e cidade) forem diferentes das de `noites` (ex.: cache vencido
e rota nova), responde 409 "A rota mudou desde a geração; gere de novo" e nada é gravado.

### 7.5 Leitura (`GET /roteiros/:id`, `GET /roteiros/publico/:slug`)

Ganham `viagemDeCarro: { origem, kmPorDia, horasPorDia, comVolta, consumoKmPorLitro, precoLitroCentavos } | null`
e `trechosDeEstrada: { dia, perna, noite, de, para, metros, segundos, ocupaODia, noFimDoDia, litros, custoCentavos, tracado }[]`.
Em `viagensEntreDias`, o dia que tem trecho de estrada usa os metros e segundos do trecho no lugar da
estimativa em linha reta, com a marca `estrada: true`. O resumo do orçamento inclui o combustível
(6.7). A rota pública não traz valores: omite `consumoKmPorLitro`, `precoLitroCentavos`, `litros` e
`custoCentavos`, como já acontece com o orçamento, que fica só para quem participa do roteiro.

## 8. Telas

### 8.1 Cadastro e Perfil

Componente `CampoMinhaCidade` (`frontend/src/components/`), usado nos dois:

- campo "Onde você mora (opcional)" com a busca de cidades do Brasil (`buscarCidadesDoBrasil`), que
  guarda o `codigoIbge` escolhido;
- botão "Usar minha localização": `navigator.geolocation.getCurrentPosition` → `POST /cidades/perto`
  → preenche o campo; a pessoa confere antes de salvar. Sem permissão ou sem GPS: mensagem e o campo
  continua disponível;
- texto curto: "Usamos só para saber a sua cidade; não guardamos o ponto exato."

No Perfil, também o campo opcional "Consumo do meu carro (km/l)".

### 8.2 Gerador (`/roteiros/gerar`)

- Caixa "Vou de carro saindo de casa" acima das etapas. Marcada, mostra:
  - "Saindo de" (já preenchido com a cidade de casa; troca com o mesmo componente de busca);
  - "Alvo por dia (km)" [500] e "No máximo (horas ao volante)" [vazio, opcional];
  - "Consumo do carro (km/l)" (vem do Perfil, pode mudar só para esta viagem) e "Preço do litro (R$)"
    (vazio na primeira vez; depois o navegador lembra o último valor). Sem os dois, a tela avisa
    "Informe o consumo e o preço do litro para estimar o combustível";
  - "Planejar a volta".
- O resultado mostra cada perna na ordem, com os dias de estrada entre os dias nas cidades:
  - cabeçalho do dia de estrada "Dia 1 · Estrada · Joinville/SC → Campinas/SP · 502 km · ~6h10 · ~41,8 l · ~R$ 263";
  - trecho descontado de um dia na cidade: faixa "🚗 Chegada de Joinville/SC · 180 km · ~2h15" no
    início do dia (ou "🚗 Volta para Joinville/SC" no fim do último dia);
  - cartão de pernoite: cidade, "18 hospedagens", "tem: Museu X, Parque Y", lista de hotéis com
    "Hotel a definir" como primeira opção, e "Trocar cidade" com as alternativas (km, distância do
    alvo, hospedagens, atrações). Trocar chama a geração de novo com `escolhas`;
  - cartão de decisão quando o fim da perna está perto: "◉ Esticar e chegar hoje (620 km · ~7h30)" e
    "○ Dormir no caminho e chegar amanhã com ~120 km". Mudar chama a geração com `decisoes`;
  - resumo "Combustível estimado: 3.050 km · ~254 l · ~R$ 1.598";
  - avisos no mesmo lugar dos avisos de hoje;
  - mapa com a estrada (`Polyline` do `react-leaflet`, já usado em `MapaRoteiro.tsx`) e os pernoites
    com 🛏, e o crédito "Rotas: OSRM · dados © colaboradores do OpenStreetMap".
- Enquanto calcula: "Calculando a rota…" (a primeira vez pode levar alguns segundos por causa do
  Overpass).
- "Salvar como meu roteiro" envia `viagemDeCarro` com as escolhas, as decisões e as noites (cidade e
  hotel de cada uma).

### 8.3 Roteiro salvo (detalhe e público)

- No dia de estrada, a faixa da viagem mostra "🚗 Joinville/SC → Campinas/SP · 502 km · ~6h10 · ~R$ 263";
  o trecho descontado aparece no início (ou no fim) do dia na cidade.
- O mapa desenha a estrada a partir de `trechosDeEstrada`.
- O orçamento mostra o combustível de cada dia e o total, somados ao teto de gastos. A página pública
  não mostra valores, como já acontece com o orçamento.
- O pernoite "hotel a definir" se troca pelo formulário "Onde dormir" que já existe: as hospedagens da
  cidade de pernoite já estão no catálogo (7.4, passo 2).

## 9. Erros e degradação

| Situação | Comportamento |
|---|---|
| OSRM fora do ar ou lento (15 s) | Usa cache, mesmo vencido. Sem cache: 503 "Não consegui calcular a rota agora; tente de novo em alguns minutos". Nunca cai para linha reta. |
| Overpass fora do ar | Ordena só pela distância, sem descartar cidades; aviso; pernoites "hotel a definir". |
| Sem estrada (ex.: Fernando de Noronha) | 422 "Não há estrada entre X e Y". |
| Nenhuma perna passa de um dia | Trechos descontados ou dias só de estrada, sem pernoite, com aviso. |
| Faixa sem hospedagem | Faixa alargada (±100) com aviso; depois "a definir". |
| Sem casa e sem "Saindo de" | 400 "Informe de onde você sai". |
| Consumo ou preço fora da faixa aceita | 400 com a faixa aceita. Só um dos dois informado: sem estimativa, com aviso. |
| Mais de 21 dias | 400 com a explicação (6.6). |
| Rota mudou entre gerar e salvar | 409, nada gravado (7.4). |

## 10. Privacidade e uso responsável

- O município de casa e o consumo do carro entram na exportação de dados (`/auth/me/dados`) e são
  apagados na anonimização da conta, como `cidade_base`.
- As coordenadas do GPS só existem durante a requisição de `POST /cidades/perto`: não são gravadas nem
  registradas em log, e chegam arredondadas.
- `docs/seguranca.md` e a página de privacidade ganham um parágrafo sobre isso.
- Servidores públicos: User-Agent identificado, fila de 1 consulta/s, cache no banco e créditos ao
  OpenStreetMap/OSRM.

## 11. Testes

**Unidade (node:test + tsx, sem banco e sem internet)**

- `dividirEmDias`: 1.507/500 → 2 noites e trecho final; 1.120 → decisão com esticar marcado e a versão
  "dormir"; 540 → só trecho final; faixa sem hospedagem → alargada + aviso; nada na alargada →
  "a definir"; troca na noite 1 muda a faixa da noite 2 e descarta escolha que saiu dela; sem resumos →
  só proximidade + aviso; desempates; limite por horas encurta o alvo do dia pelo perfil.
- Perfil: montagem a partir das anotações do OSRM, `segundosAte` e `kmApos`.
- `planejarViagemDeCarro` (com rotas e candidatos falsos): pernas casa → etapas → casa, numeração dos
  dias, regra das 2 horas na chegada e na volta curta, escolhas e decisões presas à perna, limite de
  21 dias.
- Combustível e `resumirOrcamento` com trechos.
- Nota: proximidade, escala logarítmica e pesos.
- Clientes: leitura da resposta do OSRM (`Ok`, `NoRoute`, erro HTTP, tempo esgotado) e montagem/leitura
  do resumo do Overpass (cada elemento na cidade mais próxima dentro do raio). `mapasFalsos.ts` passa a
  interceptar também o OSRM.

**Integração (`nomadplan_teste`)**

- `candidatosDaRota` com municípios e uma rota sintética: corredor de 20 km, km na rota, pontas fora.
- Cache: a segunda geração da mesma viagem não chama o OSRM; cache vencido é usado quando o OSRM falha.
- `POST /roteiros/gerar` com `viagemDeCarro` (várias pernas, volta, horas, combustível, escolhas,
  decisões, erros 400/422/503).
- `POST /roteiros` com viagem: trechos, pernoites com hotel e "a definir", hospedagens no catálogo,
  combustível no orçamento, 409 quando a rota muda; leitura com `trechosDeEstrada` e
  `viagensEntreDias` marcados como estrada; versão restaurada traz os trechos.
- Conta: `codigoMunicipioBase` e `consumoKmPorLitro` no registro/Perfil, na exportação e na
  anonimização.
- `POST /cidades/perto` devolve o município e não grava nada.

**E2E (`e2e/testes/12-viagem-de-carro.spec.ts`)**

O `preparar.ts` do E2E carrega no `nomadplan_e2e` alguns municípios, rotas sintéticas (Joinville →
Brasília, Brasília → Joinville) em `rota_em_cache` e resumos em `resumo_osm`: o teste não usa a
internet e prova que a viagem funciona só com o cache.

- cadastro com "Onde você mora" e consumo do carro no Perfil;
- gerar Brasília de carro com preço do litro, trocar o pernoite da noite 1, ver a decisão de chegada e
  a estimativa de combustível, salvar;
- no roteiro salvo, a faixa 🚗 com km, tempo e custo, e o combustível no orçamento.

Cobertura do backend continua acima de 60% (hoje 92%).

## 12. Entrega em 5 PRs

1. **Municípios e dados da pessoa**: tabela `municipio`, `municipios:importar`, `codigoIbge` em
   `/cidades/buscar` e busca local quando o Nominatim falha, `POST /cidades/perto`,
   `codigoMunicipioBase` e `consumoKmPorLitro` na conta, `CampoMinhaCidade` no cadastro e no Perfil.
2. **Rota e divisão em dias (backend)**: `rota_em_cache` com perfil, cliente OSRM, `candidatosDaRota`,
   resumos do Overpass, `dividirEmDias` (km e horas), `viagemDeCarro` em `POST /roteiros/gerar` para a
   perna casa → 1ª etapa.
3. **Telas e salvamento da ida**: gerador com a viagem de carro, cartões de pernoite e decisão, mapa
   com a estrada, `trecho_estrada`, salvamento, detalhe e público.
4. **Todas as pernas**: trechos entre etapas, volta e a regra do dia da chegada (back e front).
5. **Combustível, banca e documentação**: combustível no plano e no orçamento,
   `npm run viagem:preparar -- "Joinville/SC" "Brasília/DF"` (aquece as rotas e os resumos no banco),
   E2E, `api.md`, `dicionario-de-dados.md`, `operacao.md` (`OSRM_URL`, comandos novos),
   `seguranca.md`. O RFC é atualizado depois, junto com as demais novidades.

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Internet instável na banca | `viagem:preparar` antes da apresentação; tudo funciona pelo cache. |
| Cidades de destino sem pontos para os dias de passeio | Preparar as cidades antes (preparo sob demanda ou `osm:baixar`). |
| OSRM público mudar a política ou sair do ar | `OSRM_URL` configurável (FOSSGIS ou OSRM próprio). |
| Overpass lento na primeira geração | Uma consulta só por rodada, `[timeout:25]`, cache de 30 dias e mensagem "Calculando a rota…". |
| Km estimado da cidade diferente do real | Comprimento geodésico escalado pela distância do OSRM (6.3); a faixa de ±50 km absorve a diferença. |
| Tempo do OSRM otimista (não conta paradas) | A tela mostra "~" e o texto "tempo de direção, sem paradas". |
| Preço do combustível desatualizado | A pessoa digita o preço em cada viagem; não há valor fixo no sistema. |
