# Operação: implantação, backup, recuperação e monitoramento

Procedimentos para quem executa o NomadPlan fora do ambiente de desenvolvimento (atende às RNF07, RNF08, RNF23, RNF24 e RNF25).

## Componentes

| Componente | O que é | Observações |
| --- | --- | --- |
| API | Node.js 22 + Express (`backend/`) | *Stateless*: pode ter várias instâncias atrás de um balanceador. Porta `PORT` (3333). |
| Frontend | Aplicação React compilada (`frontend/dist/`) | Arquivos estáticos; sirva com Nginx, Caddy, GitHub Pages, Netlify etc. A URL da API é definida **na compilação** por `VITE_API_URL`. |
| Banco | PostgreSQL 16 com PostGIS | Imagem `postgis/postgis:16-3.4` no `docker-compose.yml`. |
| Imagens enviadas | Pasta `UPLOADS_DIR` (padrão `backend/uploads`) | Precisa de disco persistente e entra no backup. |
| E-mail | Servidor SMTP externo | Recuperação de senha e convites de roteiro; ver README. |
| Dados do OpenStreetMap | Arquivos em `backend/prisma/dados/osm/` | Inventário real das cidades, baixado da Overpass API. Ver *Dados reais* abaixo. |

## Variáveis de ambiente da API (`backend/.env`)

O `backend/.env.example` documenta todas. As obrigatórias em produção:

| Variável | Para quê |
| --- | --- |
| `NODE_ENV=production` | Ativa as verificações de segurança (recusa `JWT_SECRET` fraco) e o log `combined`. |
| `DATABASE_URL` | Conexão com o PostgreSQL. |
| `JWT_SECRET` | 32+ caracteres aleatórios. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CHAVE_CRIPTOGRAFIA` | Chave que cifra o segredo do 2FA. **Faça backup dela**: sem ela, quem ativou o 2FA não consegue entrar. |
| `FRONTEND_URL` | Endereço do frontend (CORS e links dos e-mails). |
| `TRUST_PROXY` | Número de proxies à frente da API (1 com Nginx), para o limite de taxa enxergar o IP real. |
| `SMTP_*`, `EMAIL_FROM` | Envio de e-mail. |

## Implantação

```bash
git pull
cd backend
npm ci
npx prisma migrate deploy      # aplica migrations pendentes (NUNCA use "migrate dev")
npm run build
NODE_ENV=production npm start  # use um gerenciador de processos (systemd, PM2, Docker) em produção

cd ../frontend
VITE_API_URL=https://api.exemplo.com.br npm run build   # gera frontend/dist
```

1. **Antes** de `migrate deploy`, faça um backup (abaixo). As migrations são escritas à mão e não têm reversão automática.
2. Coloque a API atrás de um proxy reverso com **HTTPS** (Nginx, Caddy). A API em si fala HTTP.
3. Confira a saúde: `GET /health` deve responder `{"status":"ok"}`.
4. Carregue o inventário real das cidades: `npm run osm:importar` (ver *Dados reais*).
5. Crie o primeiro administrador: cadastre-se pela tela de cadastro e promova a conta direto no banco: `UPDATE usuario SET tipo_conta = 'ADMIN' WHERE email = '...';`. Não use `npm run prisma:seed` em produção (cria contas de demonstração com senha conhecida; o comando recusa rodar com `NODE_ENV=production`).

## Dados reais (OpenStreetMap)

O inventário inicial vem do [OpenStreetMap](https://www.openstreetmap.org) (OSM), uma base aberta mantida por voluntários, com licença [ODbL](https://www.openstreetmap.org/copyright). As fotos e descrições curtas vêm do Wikidata e do Wikimedia Commons, que têm licenças livres e exigem o crédito do autor. O NomadPlan mostra os dois créditos na página do ponto.

São dois passos. Baixar fica separado de importar para que o seed, o CI e quem clona o projeto tenham os mesmos dados sem depender de um servidor externo:

```bash
cd backend
npm run osm:baixar -- Joinville Florianópolis Blumenau   # consulta a Overpass API e grava prisma/dados/osm/<cidade>.json
npm run osm:importar                                     # leva todos os arquivos da pasta ao banco
```

- **Outras cidades:** use o nome oficial com acentos. A UF é `SC` por padrão; para outro estado, passe `--uf PR`. Cada cidade é uma consulta de 30 s a 1 min, e o script espera alguns segundos entre elas. Se a Overpass estiver ocupada (`429`/`504`), tente mais tarde ou use um espelho com `OVERPASS_URL=https://overpass.kumi.systems/api/interpreter`.
- **O que entra:** lugares com nome de interesse turístico, como museus, teatros, patrimônio histórico, mirantes, praias, parques, restaurantes, cafés, bares, hotéis, pousadas, shoppings, mercados e igrejas de interesse histórico. Ficam de fora lanchonetes de rede, praças de bairro, residências antigas e o que estiver marcado como privado ou desativado. O mapeamento de etiquetas para categorias fica em `backend/src/lib/osm.ts`.
- **Horários:** o formato do OSM (`Mo-Fr 09:00-18:00; Sa 09:00-13:00`) é convertido para o do sistema (`Seg-Sex 9h-18h; Sáb 9h-13h`), em `backend/src/lib/horariosOsm.ts`. O que não dá para converter com segurança, como variação por mês ou horário sem fim, fica como "não informado", e a página do ponto convida a comunidade a informar.
- **Atualizar:** rode os dois comandos de novo quando quiser. A importação não duplica pontos (usa o `id_osm`). Nos pontos que já existem, só preenche os campos vazios: o que a comunidade e os responsáveis editaram nunca é sobrescrito, e cada complemento vira uma versão no histórico. Um ponto **rejeitado** pela moderação não volta. Para tirar um ponto importado do ar, rejeite-o em vez de excluí-lo.
- **Pontos de exemplo antigos:** bancos criados com versões anteriores do seed têm 110 pontos fictícios ("Natureza Joinville #1"...). `npm run osm:importar -- --remover-ficticios` apaga esses pontos, junto com as avaliações, favoritos e sugestões ligados a eles. Os que estiverem em algum roteiro são mantidos.
- Cada importação fica no log de auditoria (`importar_osm`, com o resumo).

## Rollback (RNF24)

A API é compilada e versionada pelo git, então voltar de versão é voltar o código:

1. `git checkout <versão-anterior>` (ou reimplante a imagem/artefato anterior), `npm ci && npm run build`, reinicie.
2. Se a versão nova aplicou migrations que a anterior não entende, **restaure o backup feito antes do deploy** (abaixo). Migrations só adicionam colunas e tabelas nesta base, então na prática a versão anterior costuma continuar funcionando com o esquema novo; confirme lendo as migrations do intervalo.
3. Se a checagem `GET /health` falhar após o deploy, aplique o passo 1 imediatamente. Num pipeline automatizado, faça deste passo a ação de falha do job de *smoke test*.

## Backup (RNF07)

Os scripts em `scripts/` salvam o banco (formato `pg_dump -Fc`, compactado) e as imagens enviadas, e apagam backups com mais de 30 dias (`RETENCAO_DIAS`).

| Sistema | Comando |
| --- | --- |
| Linux/macOS/Git Bash | `scripts/backup.sh [pasta-de-destino]` |
| PowerShell | `.\scripts\backup.ps1 [-Destino pasta]` |

Os arquivos saem em `backups/` (ignorada pelo git): `nomadplan-AAAAMMDD-HHMMSS.dump` e `uploads-AAAAMMDD-HHMMSS.tar.gz` (`.zip` no PowerShell). Variáveis opcionais: `POSTGRES_CONTAINER` (padrão `nomadplan-postgres`), `POSTGRES_USER`, `POSTGRES_DB`, `UPLOADS_DIR`, `RETENCAO_DIAS`.

**Backup diário agendado.** Linux (cron, todo dia às 3h):

```cron
0 3 * * * cd /opt/nomadplan && scripts/backup.sh /var/backups/nomadplan >> /var/log/nomadplan-backup.log 2>&1
```

Windows (Agendador de Tarefas):

```powershell
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -File C:\NomadPlan\scripts\backup.ps1 -Destino D:\backups-nomadplan" -WorkingDirectory "C:\NomadPlan"
Register-ScheduledTask -TaskName "Backup NomadPlan" -Action $acao -Trigger (New-ScheduledTaskTrigger -Daily -At 3am)
```

Copie os backups para **outro disco ou serviço** (nuvem, outro servidor): um backup na mesma máquina não protege contra a perda dela. Guarde também o `.env` (principalmente `JWT_SECRET` e `CHAVE_CRIPTOGRAFIA`) em local seguro, **fora** do repositório.

## Restauração e recuperação de desastre (RNF08)

Meta: restauração completa em até 4 horas. O procedimento, em um servidor novo:

1. Instale Docker e Node.js 22; clone o repositório; restaure o `.env`.
2. `docker compose up -d postgres` (sobe o PostgreSQL com PostGIS vazio).
3. Restaure o banco e as imagens:
   ```bash
   scripts/restaurar.sh backups/nomadplan-<data>.dump nomadplan backups/uploads-<data>.tar.gz
   ```
   ```powershell
   .\scripts\restaurar.ps1 -Dump backups\nomadplan-<data>.dump -ArquivoUploads backups\uploads-<data>.zip
   ```
   Sem o segundo argumento, o script restaura sobre o banco em uso e **pede que você digite o nome do banco** para confirmar.
4. `cd backend && npm ci && npx prisma migrate deploy && npm run build && npm start`.
5. Confirme: `GET /health`, entrar com uma conta conhecida, abrir um ponto com imagem.

**Conferir um backup sem risco.** Restaure para um banco com outro nome e compare os números:

```bash
scripts/restaurar.sh backups/nomadplan-<data>.dump nomadplan_conferencia
docker exec nomadplan-postgres psql -U nomadplan -d nomadplan_conferencia -c "select count(*) from ponto_turistico"
docker exec nomadplan-postgres psql -U nomadplan -d postgres -c "DROP DATABASE nomadplan_conferencia"
```

Faça essa conferência periodicamente: backup que nunca foi restaurado não é backup. (Os scripts foram verificados assim: um dump do banco de desenvolvimento restaurado em outro banco trouxe as mesmas contagens, inclusive a coluna geográfica.)

## Monitoramento e alertas (RNF25)

- **Disponibilidade:** monitore `GET /health` (UptimeRobot, Uptime Kuma, `curl` em cron). Falha em 2 checagens seguidas deve alertar.
- **Logs:** a API escreve no stdout (`combined` em produção: método, rota, status, tempo). Redirecione para arquivo/serviço de logs e alerte sobre respostas `5xx` e sobre mensagens `Erro ...` (o `console.error` das rotas).
- **Segurança:** o log de auditoria (`/admin/auditoria`) registra bloqueios de login; uma sequência deles gera `alerta_forca_bruta` e **notifica os administradores** dentro do sistema.
- **Uso:** `/admin/metricas` e `/admin/metricas/uso` (com exportação CSV) mostram buscas, roteiros, cadastros e avaliações por dia.
- **Banco:** acompanhe espaço em disco do volume do PostgreSQL e das imagens; `docker stats nomadplan-postgres` para CPU/memória.
- **Busca lenta:** quando a consulta passa de `BUSCA_TIMEOUT_MS` (5 s), a API responde o último resultado igual em cache (`desatualizado: true`) ou `504`, e registra a ocorrência no log.

Para métricas contínuas de latência e uso de CPU/memória (Prometheus + Grafana, citados na RFC), exponha um *exporter* de Node.js ou use o painel do provedor de nuvem; o sistema não embute essa pilha.

## Testes antes de liberar

```bash
cd backend && npm run test:cobertura   # unitários + integração, falha se a cobertura de linhas < 60%
cd frontend && npm run lint && npm run build
cd e2e && npx playwright test          # fluxos principais no navegador
```

O mesmo conjunto roda a cada *push* no GitHub (`.github/workflows/ci.yml`). Para o teste de carga, veja [relatorio-de-carga.md](relatorio-de-carga.md).
