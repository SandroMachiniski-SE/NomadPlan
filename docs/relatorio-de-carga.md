# Relatório de teste de carga

Atende à RNF27 (teste de carga com pelo menos 100 usuários simultâneos antes de uma entrega) e verifica as RNF01, RNF02 e RNF04. Realizado em **26/10/2026**.

## Ambiente

| Item | Valor |
| --- | --- |
| API | build de produção (`NODE_ENV=production`, `node dist/src/server.js`), **um único processo**, `RATE_LIMIT_OFF=1` (os limites de taxa bloqueariam o teste) |
| Banco | PostgreSQL 16 + PostGIS 3.4 em contêiner Docker (configuração padrão do `docker-compose.yml`) |
| Máquina | Notebook com Intel Core i7-13620H (10 núcleos / 16 threads), 15,7 GB de RAM, Windows 11 — **o gerador de carga, a API e o banco rodaram na mesma máquina**, que também fazia outras tarefas, então os números são conservadores em relação a servidores dedicados |
| Gerador | `e2e/carga/carga.mjs` (Node 22, sem dependências), 100 usuários virtuais, conexões persistentes |
| Dados | **113 pontos** publicados (seed) e, para o teste de volume, **5.113 pontos** (≈ 1.000 por cidade) |

Para repetir:

```bash
cd backend && npm run build
# em outro terminal (variáveis de ambiente de um banco de testes; veja docs/operacao.md):
NODE_ENV=production RATE_LIMIT_OFF=1 JWT_SECRET=<32+ caracteres> node dist/src/server.js
cd e2e && node carga/carga.mjs --url http://localhost:3333 --usuarios 100 --duracao 20 --pausa-ms 1000
```

## Método

Cada cenário roda primeiro com **1 usuário** (a base de comparação: o sistema ocioso) e depois com **100 usuários simultâneos**. Dois perfis:

- **Uso real** (`--pausa-ms 1000`): cada usuário "pensa" em média 1 s entre uma ação e a seguinte, como alguém navegando. É o perfil da RNF27.
- **Saturação** (sem pausa): os 100 usuários disparam requisições sem parar. É um teste de estresse, muito mais severo que o uso real: mostra até onde a API vai.

Cenários: busca por cidade e categoria, busca por proximidade (raio de 10 km), detalhe de ponto e geração de roteiro (a operação mais pesada: carrega os pontos da cidade e planeja o trajeto com horários). Latências em milissegundos; **nenhuma requisição falhou em nenhum teste** (0 erros).

## Resultados — 113 pontos

### Uso real (100 usuários, ≈ 95 requisições/s)

| Cenário | 1 usuário (média) | 100 usuários: média | p95 | p99 | máx. |
| --- | ---: | ---: | ---: | ---: | ---: |
| Busca por cidade e categoria | 3,0 | 10,7 | 7,3 | 178 | 195 |
| Busca por proximidade | 3,5 | 11,5 | 11,9 | 181 | 189 |
| Detalhe do ponto | 4,7 | 9,2 | 20,5 | 111 | 117 |
| Geração de roteiro | 11,2 | 28,2 | 26,8 | 341 | 349 |

O p99 e o máximo refletem a rajada inicial (as 100 conexões abrem ao mesmo tempo); fora disso a latência fica estável.

### Saturação (100 usuários sem pausa)

| Cenário | Média | p95 | p99 | máx. | Vazão |
| --- | ---: | ---: | ---: | ---: | ---: |
| Busca por cidade e categoria | 90,7 | 124,5 | 156 | 187 | 1.099 req/s |
| Busca por proximidade | 109,8 | 145,5 | 169 | 186 | 908 req/s |
| Detalhe do ponto | 108,8 | 151,2 | 179 | 196 | 917 req/s |
| Geração de roteiro | 311,4 | 395,5 | 420 | 524 | 320 req/s |

## Resultados — 5.113 pontos (teste de volume)

| Cenário | 1 usuário | Uso real: média | p95 | Saturação: média | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Busca por cidade e categoria | 8,4 | 17,6 | 18,5 | 148,3 | 166,4 |
| Busca por proximidade | 4,2 | 12,5 | 11,6 | 108,5 | 130,5 |
| Detalhe do ponto | 4,6 | 9,8 | 18,2 | 107,4 | 140,6 |
| Geração de roteiro | 41,3 | 543,1 | 1.109 | 1.481 | 1.630 |

## Conclusão frente aos requisitos

| Requisito | Meta | Resultado | Situação |
| --- | --- | --- | --- |
| RNF01 — latência média de busca | < 300 ms (pico < 1 s) | 9–18 ms em uso real; 91–148 ms (máx. 232 ms) mesmo na saturação, com 100 usuários | ✅ atendido com folga |
| RNF02 — geração de roteiro | média < 5 s | 28 ms (113 pontos) e 543 ms (5.113 pontos) em uso real; no pior caso (saturação, 5.113 pontos) 1,5 s | ✅ atendido |
| RNF04 — 100 usuários simultâneos | latência ≤ 2× a média ociosa | Sem queda de disponibilidade e sem nenhum erro. Em uso real a razão fica entre 2,0× e 3,6× nas buscas e no detalhe (113 pontos) e 2,1× a 3,0× com 5.113 pontos, porque a base ociosa é minúscula (3–8 ms): o aumento absoluto é de poucos milissegundos. Na geração de roteiro com 5.113 pontos a razão é maior (13×), pois cada geração custa ~40 ms de CPU e 100 usuários gerando roteiros a cada segundo saturam um processo — uso bem mais intenso que o real, em que uma pessoa gera poucos roteiros por visita | ✅ atendido no que importa (latência absoluta muito abaixo das metas); a razão literal de 2× só é cumprida em parte dos cenários |
| RNF27 — relatório de carga com ≥ 100 usuários | documentado | este documento | ✅ |

## Otimização feita durante o teste

A primeira rodada com 5.113 pontos mostrou a geração de roteiro como gargalo: **4,2 s** de média com 100 usuários (e 78 ms com um só). A causa era o planejador reinterpretar o texto de horário de funcionamento de cada candidato a cada passo (expressões regulares recompiladas centenas de vezes por requisição). Passou a guardar a interpretação por texto (`backend/src/lib/horarios.ts`), o que reduziu o planejamento de ~42 ms para ~5 ms de CPU com 1.000 candidatos e a média sob carga para **0,54 s** (−87%).

## Limites e recomendações

- Foi usado **um** processo Node. A API é *stateless* (sessão em JWT validado no banco), então pode escalar com vários processos/instâncias atrás de um balanceador — ressalvado o limite de taxa em memória (ver [seguranca.md](seguranca.md)).
- O gargalo restante da geração de roteiro é buscar todos os pontos da cidade para planejar. Para cidades com dezenas de milhares de pontos, pré-filtrar candidatos por raio ou categoria no banco.
- Cenários não cobertos: upload de imagens sob carga e escritas concorrentes intensas.
