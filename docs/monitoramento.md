# Monitoramento e observabilidade (Prometheus + Grafana)

Atende ao RNF25 (métricas de latência, erros 5xx e uso de CPU e memória, com alertas) e ao item de monitoramento do núcleo
comum de engenharia.

## O que é coletado

A API expõe métricas no formato do Prometheus numa **porta interna** (`METRICAS_PORT`, padrão `9464`), separada da porta
pública da API. O proxy HTTPS só encaminha a porta da API, então `/metrics` **não fica na internet**: só o Prometheus, dentro
da rede do Docker, consegue lê-las (`backend/src/lib/prometheus.ts`).

| Métrica | O que mostra |
| --- | --- |
| `nomadplan_http_requisicoes_total{metodo,rota,status}` | Requisições atendidas por método, rota declarada (`/roteiros/:id`, nunca o id) e status |
| `nomadplan_http_duracao_segundos` (histograma) | Tempo de resposta por rota; dá o p50 e o p95 |
| `nomadplan_process_resident_memory_bytes`, `nomadplan_nodejs_heap_size_used_bytes` | Memória do processo |
| `nomadplan_process_cpu_seconds_total` | CPU |
| `nomadplan_nodejs_eventloop_lag_p99_seconds` | Atraso do laço de eventos (sobrecarga) |

O painel **NomadPlan — API** (`deploy/monitoramento/grafana/dashboards/nomadplan.json`) já vem configurado: API no ar,
requisições por segundo e por classe de status, proporção de erros 5xx, p50 e p95, rotas mais lentas, memória, laço de
eventos e CPU.

## Alertas

As regras estão em `deploy/monitoramento/alertas.yml` e aparecem no Prometheus (aba *Alerts*) e no Grafana (*Alerting*):

| Alerta | Condição | Severidade |
| --- | --- | --- |
| ApiForaDoAr | A API não responde à coleta por 2 min | crítica |
| ErrosNoServidor | Mais de 1% de respostas 5xx por 5 min | alta |
| RespostaLenta | p95 acima de 2 s por 10 min | média |
| MemoriaAlta | Mais de 600 MB (o limite do contêiner é 768 MB) por 10 min | média |
| LacoDeEventosAtrasado | p99 do atraso acima de 0,5 s por 5 min | média |

As regras disparam e ficam visíveis nos painéis. Para **receber aviso** (e-mail, Telegram), acrescente um Alertmanager ao
`docker-compose.monitoramento.yml` e aponte `alerting.alertmanagers` no `prometheus.yml`; não está incluído para não pesar na VPS
compartilhada.

## Como ligar na VPS

1. **DNS:** crie um registro `A` para `grafana.nomadplan.blackyears.com.br` apontando para o IP da VPS (o mesmo dos outros dois).
2. **`.env.prod`** (na VPS, nunca no git): defina `DOMINIO_GRAFANA`, `GRAFANA_SENHA` (um segredo forte, `openssl rand -hex 16`) e,
   se quiser o painel visível sem login na apresentação, `GRAFANA_ANONIMO=true` (só leitura).
3. **Subir** (`scripts/implantar.sh` já inclui o arquivo de monitoramento quando `DOMINIO_GRAFANA` está preenchido):

   ```bash
   docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml -f docker-compose.monitoramento.yml up -d
   ```

4. **Proxy HTTPS:** `scripts/ligar-caddy-existente.sh` acrescenta o endereço do Grafana ao Caddy compartilhado (sem alterar o
   arquivo do outro projeto) e emite o certificado sozinho.
5. Abra `https://grafana.nomadplan.blackyears.com.br`, entre com `admin` e a senha definida e abra a pasta **NomadPlan**.

Consumo: Prometheus e Grafana têm limite de 256 MB cada e o Prometheus guarda 15 dias de histórico.

## Verificar

- `docker compose -p nomadplan ... ps` mostra `nomadplan-prometheus` e `nomadplan-grafana` no ar.
- No Grafana, *Connections → Data sources → Prometheus → Test* deve responder "Successfully queried".
- No Prometheus, *Status → Targets*: o alvo `nomadplan-api` deve estar `UP`.
- `GET /health` continua sendo a checagem de disponibilidade simples ([operacao.md](operacao.md)).

## Outros sinais já existentes

Logs da API em `combined` (método, rota, status, tempo), log de auditoria e alerta de força bruta no painel administrativo e métricas
de uso do negócio (`/admin/metricas`). Ver [operacao.md](operacao.md).
