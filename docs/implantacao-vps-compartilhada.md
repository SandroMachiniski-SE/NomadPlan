# Colocar o NomadPlan num servidor que já tem outro projeto (só para a banca)

Este guia vale quando o servidor **já roda outro sistema com um proxy nas portas 80 e 443** (no caso, um Caddy no
contêiner `elevare-central-caddy-1`). O kit normal ([implantacao-web.md](implantacao-web.md)) sobe o seu próprio Caddy
nessas portas e brigaria com o que já existe. Aqui o NomadPlan **não publica nenhuma porta**: o Caddy que já está no
servidor passa a atender também os dois endereços novos e repassa o tráfego para os contêineres do NomadPlan.

Regras para não atrapalhar o projeto que já está no ar:

- O NomadPlan roda num projeto Docker separado (`-p nomadplan`): contêineres, rede e volumes próprios.
- Nenhum comando altera, reinicia ou remove contêineres, redes ou volumes do outro projeto.
- O único arquivo do outro projeto que muda é o Caddyfile (dois blocos novos, com cópia de segurança antes).
- Não use `docker system prune`, `docker volume prune` nem `ufw --force enable`/`ufw reset`. As portas 22, 80 e 443 já estão liberadas.
- Faça fora do horário de movimento e **crie um snapshot do VPS pelo painel da hospedagem antes de começar**.

```
Navegador ──443──▶ Caddy que já existe ──▶ nomadplan-web:80  (site, só HTTP interno)
                       │
                       └──────────────────▶ nomadplan-api:3333 ──▶ nomadplan-postgres
```

## Parte 1. DNS (de 3 a 4 dias antes da banca)

Na GoDaddy, crie dois registros `A` apontando para o IP do servidor (o mesmo do outro projeto):

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `nomadplan` | IP do servidor |
| A | `api.nomadplan` | IP do servidor |

Confira com `nslookup nomadplan.blackyears.com.br`. O Caddy só emite o certificado depois que o DNS estiver certo.

## Parte 2. Levar os dados do seu computador

No **seu computador** (com o Docker Desktop aberto e o banco `nomadplan-postgres` rodando), na pasta do projeto:

```bash
scripts/backup.sh backups
```

Isso gera `backups/nomadplan-AAAAMMDD-HHMMSS.dump` (e, se houver, um `uploads-*.tar.gz` com fotos enviadas em testes, que não precisa ir: as fotos dos pontos reais vêm do Wikimedia Commons). O `.dump` tem os 3.189 pontos, os
municípios do IBGE, o roteiro de exemplo e a rota Joinville ↔ Brasília já guardada, então a banca não depende do Overpass.
Copie para o servidor (troque usuário e IP):

```bash
scp backups/nomadplan-*.dump usuario@IP_DO_VPS:/tmp/
```

## Parte 3. Subir o NomadPlan no servidor

```bash
git clone https://github.com/SandroMachiniski-SE/NomadPlan.git /opt/nomadplan
cd /opt/nomadplan
cp deploy/env.prod.exemplo .env.prod
for v in POSTGRES_PASSWORD JWT_SECRET CHAVE_CRIPTOGRAFIA; do sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env.prod; done
nano .env.prod      # confira os dois domínios; os dados do Brevo entram depois
```

Guarde uma cópia do `.env.prod` fora do servidor. Depois, **primeiro só o banco**, para restaurar os dados antes da API:

```bash
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml up -d postgres
scripts/restaurar.sh /tmp/nomadplan-AAAAMMDD-HHMMSS.dump
```

Digite `nomadplan` quando pedir a confirmação. Agora a API e o site (a primeira compilação leva alguns minutos e usa memória; os
contêineres ficam limitados a 768 MB, 768 MB e 128 MB):

```bash
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml up -d --build
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml logs -f api
```

Aguarde `NomadPlan API executando` e saia com Ctrl+C.

## Parte 4. Ligar o Caddy que já existe

1. Conecte o Caddy existente à rede do NomadPlan (só adiciona uma rede; não reinicia nada):

   ```bash
   docker network connect nomadplan_default elevare-central-caddy-1
   ```

2. Descubra onde está o Caddyfile dele, faça uma cópia e abra para editar (o caminho depende de como o outro projeto foi montado):

   ```bash
   docker inspect elevare-central-caddy-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   ```

   Copie o arquivo que aparece montado em `/etc/caddy/Caddyfile` para `Caddyfile.antes-do-nomadplan` na mesma pasta e acrescente **no fim** do original:

   ```
   nomadplan.blackyears.com.br {
   	reverse_proxy nomadplan-web:80
   }

   api.nomadplan.blackyears.com.br {
   	encode zstd gzip
   	reverse_proxy nomadplan-api:3333
   }
   ```

3. Valide e só então recarregue (se a validação falhar, o Caddy continua com a configuração antiga):

   ```bash
   docker exec elevare-central-caddy-1 caddy validate --config /etc/caddy/Caddyfile
   docker exec elevare-central-caddy-1 caddy reload --config /etc/caddy/Caddyfile
   ```

4. Teste: `https://api.nomadplan.blackyears.com.br/health` deve mostrar `{"status":"ok",...}` e `https://nomadplan.blackyears.com.br` deve abrir o site, com cadeado.

> O `docker network connect` não sobrevive se o contêiner do Caddy for **recriado** (por exemplo, ao atualizar o outro projeto). Se o site do
> NomadPlan passar a dar erro 502, repita o comando do passo 1.

## Parte 5. Contas de demonstração e e-mail

O backup traz as contas de demonstração (`admin@`, `moderador@`, `negocio@`, `morador@nomadplan.local`) com **senhas conhecidas**. Como o
servidor fica na internet, troque-as antes de divulgar o endereço:

```bash
HASH=$(docker exec nomadplan-api node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'UmaSenhaForteSua')
docker exec nomadplan-postgres psql -U nomadplan -d nomadplan -c "UPDATE usuario SET senha_hash = '$HASH' WHERE email LIKE '%@nomadplan.local';"
```

Para o e-mail de recuperação de senha, siga a Parte 6 do [implantacao-web.md](implantacao-web.md) (Brevo). Sem isso o sistema funciona, só não
envia e-mails.

## Depois da banca: remover tudo

```bash
cd /opt/nomadplan
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml down -v --rmi local
docker network disconnect nomadplan_default elevare-central-caddy-1 2>/dev/null || true
cd / && rm -rf /opt/nomadplan /tmp/nomadplan-*.dump
```

Depois tire os dois blocos do Caddyfile do outro projeto (ou volte a cópia `Caddyfile.antes-do-nomadplan`), valide, recarregue e apague os dois
registros `A` na GoDaddy. Confira que só sobraram os contêineres do outro projeto: `docker ps`.
