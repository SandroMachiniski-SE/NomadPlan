# Colocar o NomadPlan num servidor que já tem outro projeto (só para a banca)

Este guia vale quando o servidor **já roda outro sistema com um proxy nas portas 80 e 443** (no caso, um Caddy no
contêiner `elevare-central-caddy-1`). O kit normal ([implantacao-web.md](implantacao-web.md)) sobe o seu próprio Caddy
nessas portas e brigaria com o que já existe. Aqui o NomadPlan **não publica nenhuma porta**: o Caddy que já está no
servidor passa a atender também os dois endereços novos e repassa o tráfego para os contêineres do NomadPlan.

Regras para não atrapalhar o projeto que já está no ar:

- O NomadPlan roda num projeto Docker separado (`-p nomadplan`): contêineres, rede e volumes próprios.
- Nenhum comando altera, reinicia ou remove contêineres, redes ou volumes do outro projeto.
- **Nenhum arquivo do outro projeto é editado.** Um script junta o Caddyfile dele com os dois endereços do NomadPlan num arquivo temporário e recarrega o Caddy com ele; para desfazer, outro script recarrega o Caddyfile original.
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
bash scripts/backup.sh backups
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
bash scripts/restaurar.sh /tmp/nomadplan-AAAAMMDD-HHMMSS.dump
```

Digite `nomadplan` quando pedir a confirmação. Agora a API e o site (a primeira compilação leva alguns minutos e usa memória; os
contêineres ficam limitados a 768 MB, 768 MB e 128 MB):

```bash
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml up -d --build
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml logs -f api
```

Aguarde `NomadPlan API executando` e saia com Ctrl+C.

## Parte 4. Ligar o Caddy que já existe

Ainda na pasta `/opt/nomadplan`:

```bash
scripts/ligar-caddy-existente.sh
```

O script conecta o Caddy do outro projeto à rede do NomadPlan (só adiciona uma rede; não reinicia nada), monta um Caddyfile temporário
com o original **mais** os dois endereços do `.env.prod`, valida e recarrega o Caddy com ele. Se a validação falhar, o Caddy continua com
a configuração anterior. O arquivo `/opt/elevare/deploy/vps/Caddyfile` (que faz parte do repositório do outro projeto) **não é alterado**.

Teste: `https://api.nomadplan.blackyears.com.br/health` deve mostrar `{"status":"ok",...}` e `https://nomadplan.blackyears.com.br` deve abrir
o site, com cadeado (o certificado sai na primeira visita; pode levar alguns segundos).

Pontos de atenção:

- O Caddy do outro projeto tem um bloco curinga `*.{$DOMINIO}` com certificado sob demanda, mas para outro domínio (`central.elevaresystem.com`)
  e com um `ask` que só autoriza endereços da própria central: não há sobreposição com `blackyears.com.br`.
- A ligação vale até o Caddy do outro projeto ser **recriado ou reiniciado** (por exemplo, ao reimplantar o outro projeto): ele volta a ler só o
  Caddyfile original, e o site do NomadPlan passa a dar erro. O outro projeto não é afetado. Para religar, rode o script de novo.
- Os certificados do NomadPlan ficam no volume do Caddy do outro projeto (`elevare-central_caddy_dados`). Depois da banca eles não atrapalham
  em nada, mas continuam lá.

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
scripts/desligar-caddy-existente.sh
docker compose -p nomadplan --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.compartilhado.yml down -v --rmi local
cd / && rm -rf /opt/nomadplan /tmp/nomadplan-*.dump
```

O primeiro comando devolve ao Caddy do outro projeto a configuração original e o tira da rede do NomadPlan. Depois apague os dois registros
`A` (`nomadplan` e `api.nomadplan`) na GoDaddy e confira que só sobraram os contêineres do outro projeto: `docker ps`.
