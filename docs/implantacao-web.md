# Colocar o NomadPlan na web (passo a passo)

Este guia leva o NomadPlan de um computador para a internet, em um servidor virtual (VPS) com Docker, usando um domínio comprado na GoDaddy e o Brevo para os e-mails. Ele complementa o [operacao.md](operacao.md) (backup, restauração e monitoramento).

**O que vamos montar**

| Endereço | O que serve |
| --- | --- |
| `https://nomadplan.blackyears.com.br` | O site (frontend) |
| `https://api.nomadplan.blackyears.com.br` | A API (o site conversa com ela) |

Três contêineres no mesmo servidor: o banco (PostgreSQL + PostGIS), a API e o Caddy, que entrega o site e obtém sozinho os certificados HTTPS. Só as portas 80 e 443 ficam abertas. Os arquivos estão em `docker-compose.prod.yml` e `deploy/`.

> Se quiser outro nome, troque `nomadplan` por qualquer subdomínio em todo o guia. O domínio principal (`blackyears.com.br`) continua livre.

---

## Parte 1. Escolher e criar o servidor

O servidor precisa de **2 vCPU e 4 GB de RAM** (2 GB funciona, mas apertado), 20 GB de disco e Ubuntu 24.04 LTS. Opções:

| Opção | Custo | Observações |
| --- | --- | --- |
| **Azure for Students** (recomendada se você é estudante) | US$ 100 de crédito, **sem cartão de crédito** | Verifique-se em https://azure.microsoft.com/free/students com o e-mail da faculdade. Crie uma VM Ubuntu 24.04 de porte B2s (2 vCPU, 4 GB). Confira o preço na calculadora da Azure; o crédito costuma dar para alguns meses. Algumas regiões são restritas para contas de estudante: escolha uma que apareça liberada. |
| **VPS pago barato** (Hetzner, Contabo, DigitalOcean etc.) | em torno de € 4 a US$ 24 por mês, conforme o porte | Pede cartão. É o mais simples e previsível. |
| Oracle Cloud "Always Free" | grátis | **Não recomendo para este prazo**: exige cartão, a criação da VM costuma falhar por falta de capacidade e a oferta gratuita foi reduzida em 2026. |

Ao criar a VM:

1. Autenticação por **chave SSH** (não por senha). O provedor oferece baixar a chave `.pem`; guarde-a bem.
2. Libere as portas de entrada **22 (SSH), 80 e 443** no firewall/grupo de segurança do provedor (na Azure: *Rede → Regras de porta de entrada*). Não abra a 5432.
3. Anote o **IP público** da VM.
4. **Custo:** crie um alerta de orçamento no provedor. Na Azure, parar a VM pelo portal (estado "Parada (desalocada)") libera o custo de computação; ao final da avaliação, apague o grupo de recursos para não gastar crédito.

Conecte-se: `ssh -i caminho/da/chave.pem usuario@IP`.

## Parte 2. Apontar o domínio (DNS na GoDaddy)

1. Entre na GoDaddy → **Meus produtos → blackyears.com.br → DNS (Gerenciar DNS)**.
2. Crie dois registros do tipo **A**:

| Tipo | Nome | Valor | TTL |
| --- | --- | --- | --- |
| A | `nomadplan` | IP do servidor | 600 |
| A | `api.nomadplan` | IP do servidor | 600 |

3. Confira (pode levar de minutos a algumas horas): `nslookup nomadplan.blackyears.com.br` deve devolver o IP do servidor. O Caddy só consegue o certificado HTTPS depois que o DNS estiver certo.

> Não altere os outros registros do domínio. Se algum registro `A` ou `CNAME` com esses mesmos nomes já existir, edite-o em vez de criar outro.

## Parte 3. Preparar o servidor

No servidor (via SSH):

```bash
# Docker e Git
sudo apt update && sudo apt install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # saia e entre de novo no SSH para valer

# Firewall do próprio servidor (além do do provedor)
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable

# Memória extra, por segurança na hora de compilar (se a VM tem só 2 GB)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

Baixe o projeto:

```bash
git clone https://github.com/SandroMachiniski-SE/NomadPlan.git
cd NomadPlan
```

## Parte 4. Configurar e subir

1. Crie o arquivo de configuração e gere os segredos:

   ```bash
   cp deploy/env.prod.exemplo .env.prod
   for v in POSTGRES_PASSWORD JWT_SECRET CHAVE_CRIPTOGRAFIA; do
     sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env.prod
   done
   nano .env.prod      # confira os dois domínios e (depois) os dados do Brevo
   ```

2. **Guarde uma cópia do `.env.prod` fora do servidor** (gerenciador de senhas). Sem a `CHAVE_CRIPTOGRAFIA`, quem ativou o 2FA não consegue entrar de novo.
3. Suba tudo (a primeira vez compila e leva alguns minutos):

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
   docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api     # Ctrl+C para sair
   ```

   Aguarde a linha `NomadPlan API executando` (as migrações rodam sozinhas antes).
4. Teste no navegador: `https://api.nomadplan.blackyears.com.br/health` deve mostrar `{"status":"ok",...}` e `https://nomadplan.blackyears.com.br` deve abrir o site, com cadeado.

## Parte 5. Carregar os dados e criar o administrador

```bash
# 2.025 pontos reais (OpenStreetMap) de Joinville, Florianópolis e Blumenau
docker exec nomadplan-api npm run osm:importar
```

Depois, **cadastre-se pelo site** com o seu e-mail e promova a conta a administradora:

```bash
docker exec nomadplan-postgres psql -U nomadplan -d nomadplan -c "UPDATE usuario SET tipo_conta = 'ADMIN' WHERE email = 'seu@email.com';"
```

Saia e entre de novo no site para o novo papel valer.

> **Contas de demonstração.** O `npm run prisma:seed` (que cria `admin@`, `moderador@`, `negocio@`, `morador@nomadplan.local` com senha conhecida) recusa rodar em produção, de propósito. Se quiser usar a mesma base do seu computador (inclusive essas contas), restaure um backup feito com `scripts/backup.sh` conforme o [operacao.md](operacao.md#restauração-e-recuperação-de-desastre-rnf08) e troque as senhas depois.

## Parte 6. E-mail pelo Brevo

1. Crie a conta em https://www.brevo.com (o plano gratuito envia cerca de 300 e-mails por dia).
2. **Domínios e remetentes → Domínios → Adicionar** `blackyears.com.br`. O Brevo mostra registros DNS (verificação do domínio, DKIM, e sugere SPF e DMARC).
3. Cadastre esses registros no DNS da GoDaddy (**Adicionar novo registro**, tipo e valores exatamente como o Brevo mostrar; atenção para não duplicar um SPF `TXT` que já exista: junte as inclusões em um só) e clique em **Verificar** no Brevo.
4. No Brevo, em **SMTP e API → SMTP**, copie o servidor, o login e gere uma **chave SMTP**.
5. No servidor, edite o `.env.prod` (`SMTP_USER` com o login e `SMTP_PASS` com a chave; a chave só vai neste arquivo, nunca no git nem em conversas) e reinicie a API:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d api
   docker exec nomadplan-api npm run email:testar -- seu@email.com
   ```

6. Teste "Esqueci minha senha" pelo site. Se o e-mail cair no spam, confira se o SPF, o DKIM e o DMARC estão verificados no Brevo.

## Parte 7. Depois que estiver no ar

- **Backup diário**: ajuste o caminho e agende, como em [operacao.md](operacao.md#backup-rnf07). Copie os backups para fora do servidor.
- **Atualizar a versão**: `git pull && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`. Faça um backup antes (as migrações não têm reversão automática).
- **Logs**: `docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api web`.
- **Reiniciar tudo**: os contêineres sobem sozinhos quando o servidor reinicia (`restart: unless-stopped`).
- **Monitoramento**: cadastre `https://api.nomadplan.blackyears.com.br/health` no UptimeRobot (gratuito) para ser avisado se cair.

## Riscos e limites (leia antes da apresentação)

- Os riscos aceitos de [seguranca.md](seguranca.md) valem aqui, em especial o token de sessão no `localStorage` e o limite de taxa em memória. Para uma demonstração acadêmica é aceitável.
- A internet da sala pode falhar: **mantenha a versão local (com o Mailpit) pronta como plano B** na apresentação.
- O servidor fica exposto: use sempre chave SSH, mantenha o sistema atualizado (`sudo apt update && sudo apt upgrade`) e não abra a porta 5432.
- O Caddy renova os certificados sozinho, mas o DNS precisa continuar apontando para o servidor.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Navegador avisa "conexão não segura" ou o Caddy não emite certificado | O DNS ainda não aponta para o servidor, ou as portas 80/443 estão fechadas no firewall do provedor. Veja `docker compose ... logs web`. |
| O site abre, mas não carrega pontos | `DOMINIO_API` errado no `.env.prod`: ele é fixado na compilação, então rode o comando de subida com `--build` de novo. |
| API reinicia sem parar | Falta algum segredo no `.env.prod` (veja `logs api`) ou `JWT_SECRET` curto demais (mínimo 32 caracteres). |
| E-mail não chega | Domínio não verificado no Brevo, chave SMTP errada ou mensagem no spam. |
| `Out of memory` na compilação | Ative o swap (Parte 3) ou use uma VM de 4 GB. |
