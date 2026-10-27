# NomadPlan

Plataforma de turismo inteligente que centraliza o inventário turístico das cidades (pontos, restaurantes, hospedagens e eventos) e sugere roteiros personalizados para cada usuário, respeitando horários de funcionamento, distâncias, interesses e necessidades de acessibilidade.

## ✨ Funcionalidades

- **Explorar:** busca por cidade, categoria, texto, acessibilidade, faixa de preço, nota mínima, "aberto agora" e proximidade (raio a partir da localização), com ordenação por relevância, distância, nome ou avaliação; mapa interativo.
- **Pontos salvos (favoritos)** e **recomendações** baseadas nos interesses do perfil e no gosto de usuários parecidos.
- **Roteiros:** viagens de vários **dias** (com as datas e o dia da semana), mapa com paradas numeradas e trajeto de cada dia, **tempo e distância estimados entre as paradas**, botão para **otimizar a ordem** pelo caminho mais curto, **orçamento** (custo por parada, total por dia e teto de gastos), **checklist** e **notas** da viagem, compartilhamento por link público, histórico de versões com restauração e **geração automática** com horários estimados de chegada e saída, deslocamento e espera.
- **Contribuição da comunidade:** avaliações (com foto), sugestões de edição que se confirmam entre usuários ou são aplicadas direto por quem tem reputação, selo de ponto verificado.
- **Cadastro e moderação:** pontos entram como rascunho, passam por revisão com motivo de rejeição, detecção de duplicados e bloqueio contra edições simultâneas; importação e exportação em CSV e GeoJSON.
- **Administração:** papéis (visitante, morador, negócio, gestor, moderador, administrador), desativação de contas, log de auditoria, métricas de uso diário com exportação em CSV.
- **Segurança e privacidade (LGPD):** verificação em duas etapas (TOTP), bloqueio de tentativas de login, recuperação de senha por e-mail, aceite da política, download dos próprios dados e exclusão da conta.

## 🚀 Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, Leaflet (mapas), Axios |
| Backend | Node.js 22, Express, TypeScript, Prisma, Zod, JWT, bcrypt, Nodemailer |
| Banco | PostgreSQL 16 + PostGIS (busca por raio com índice geográfico) |
| Testes | `node:test` + `tsx` (unitários e integração com banco real), Playwright (ponta a ponta) |
| Infra | Docker Compose (banco e caixa de e-mail de teste), GitHub Actions (CI) |

## 📌 Como executar

Pré-requisitos: Node.js 22+, Docker Desktop e Git. Rode cada etapa a partir da raiz do projeto.

1. Clone o repositório e suba o banco (PostgreSQL + PostGIS) e a caixa de e-mail de teste (Mailpit):
   ```bash
   git clone https://github.com/SandroMachiniski-SE/NomadPlan.git
   cd NomadPlan
   docker compose up -d
   ```

2. Backend (porta 3333):
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate deploy
   npm run prisma:seed
   npm run dev
   ```
   O `npm install` já executa `prisma generate`. O `.env` **não** é versionado: copie o `.env.example` e ajuste. **Nunca use `prisma migrate dev`** neste projeto (o esquema tem uma coluna geográfica que o Prisma não modela); as migrations são escritas à mão e aplicadas com `migrate deploy`.

3. Frontend (porta 5173), em outro terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Depois acesse http://localhost:5173.

Contas de demonstração criadas pelo `prisma:seed` (senha `senha-temporaria`): `admin@nomadplan.local`, `moderador@nomadplan.local`, `negocio@nomadplan.local` e `morador@nomadplan.local`. O seed também cadastra 113 pontos em Joinville, Florianópolis e Blumenau e pode ser repetido sem duplicar nada. Ele **recusa rodar em produção**.

## 🧪 Testes

```bash
# Backend: unitários + integração (usa um banco "nomadplan_teste", criado sozinho)
cd backend
npm test
npm run test:cobertura   # com relatório de cobertura; falha se ficar abaixo de 60% das linhas
npm run typecheck

# Frontend
cd frontend
npm run lint
npm run build

# Ponta a ponta: sobe API e frontend próprios (banco "nomadplan_e2e") e dirige o navegador
cd e2e
npm install
npx playwright test
```

- Os testes de **integração** sobem a API de verdade e conversam por HTTP com um PostgreSQL real, cobrindo autenticação (inclusive 2FA e bloqueio de login), pontos, busca, contribuições, moderação, importação, roteiros, favoritos, notificações, administração e limites de taxa. Cada teste começa com o banco limpo.
- Os testes **de ponta a ponta** (Playwright, 60 cenários) percorrem os fluxos principais no navegador: cadastro e login, busca e filtros, favoritos, avaliações com foto, cadastro e moderação de pontos, roteiros (manuais e gerados), perfil, 2FA, LGPD e administração. No computador usam o Microsoft Edge instalado; no CI, o Chromium.
- A cada *push*, o GitHub Actions executa tudo isso (`.github/workflows/ci.yml`).
- Teste de carga: [docs/relatorio-de-carga.md](docs/relatorio-de-carga.md).

## 📚 Documentação

| Documento | Conteúdo |
| --- | --- |
| [docs/api.md](docs/api.md) | Todas as rotas da API, com permissões, parâmetros e respostas |
| [docs/dicionario-de-dados.md](docs/dicionario-de-dados.md) | Tabelas, colunas, relacionamentos e dados pessoais |
| [docs/operacao.md](docs/operacao.md) | Implantação, rollback, backup, restauração, monitoramento |
| [docs/seguranca.md](docs/seguranca.md) | Controles por categoria do OWASP Top 10 e riscos aceitos |
| [docs/relatorio-de-carga.md](docs/relatorio-de-carga.md) | Resultados do teste com 100 usuários simultâneos |
| [RFC.pdf](RFC.pdf) | Especificação completa do projeto (requisitos, regras de negócio, fluxos) |

## 🗂️ Estrutura

```
backend/    API (src/routes, src/lib, src/middleware), esquema e migrations do Prisma, testes
frontend/   aplicação React (src/pages, src/components, src/context, src/styles)
e2e/        testes de ponta a ponta (Playwright) e script de carga
scripts/    backup e restauração (bash e PowerShell)
docs/       documentação técnica
```

## 📧 Recuperação de senha

Na tela de login, **"Esqueci minha senha"** pede o e-mail da conta e o sistema envia, automaticamente, uma mensagem para **o próprio e-mail informado pelo usuário** com um link para escolher a nova senha. O link vale por 15 minutos e só pode ser usado uma vez. Não há nada a cadastrar por usuário: qualquer conta registrada recebe no seu endereço.

Para isso o backend precisa de **uma conta de envio** (o remetente do sistema, como um `nao-responda@`), configurada uma única vez no `backend/.env`. Ela é só quem *envia*; quem *recebe* é cada usuário.

### Configurando o envio (Gmail, gratuito)

1. Na conta Google que será o remetente, ative a **verificação em duas etapas**.
2. Crie uma **senha de app** em https://myaccount.google.com/apppasswords (16 caracteres).
3. Preencha no `backend/.env`:
   ```env
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_USER="seuemail@gmail.com"
   SMTP_PASS="a senha de app de 16 caracteres"
   ```
4. Confira se está tudo certo (envia um e-mail de teste):
   ```bash
   cd backend
   npm run email:testar -- seuemail@gmail.com
   ```
5. Reinicie o backend. Na subida ele mostra `E-mail: enviando por smtp.gmail.com:587 ...`.

O Gmail permite cerca de 500 e-mails por dia e mostra como remetente a própria conta. Para volume maior ou um remetente com domínio próprio, use qualquer serviço com SMTP (Brevo, Mailgun, SendGrid, Amazon SES): basta trocar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`.

### Sem servidor de e-mail (só para desenvolvimento)

Sem `SMTP_HOST`, nenhum e-mail é enviado: o link de redefinição é impresso no **console do backend** (procure por `[e-mail em modo de desenvolvimento]`) e o backend avisa disso ao subir. Em produção, sem SMTP, nada é enviado e o servidor registra um aviso.

Opcionalmente, o `docker compose up -d` também sobe o [Mailpit](https://mailpit.axllent.org/), uma caixa de entrada de teste em http://localhost:8025 que **guarda** os e-mails sem entregá-los a ninguém. Para usá-lo, configure `SMTP_HOST="localhost"` e `SMTP_PORT=1025`.

## 🔒 Segurança

Resumo; o detalhamento por categoria do OWASP Top 10 e os riscos aceitos estão em [docs/seguranca.md](docs/seguranca.md).

- **`JWT_SECRET` e `CHAVE_CRIPTOGRAFIA`**: em produção (`NODE_ENV=production`) a API recusa iniciar com um `JWT_SECRET` curto (menos de 32 caracteres) ou de exemplo. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. A `CHAVE_CRIPTOGRAFIA` cifra o segredo do 2FA no banco.
- **Rate limit**: login (por IP e por e-mail), cadastro, contribuições e recuperação de senha têm limite de tentativas por janela de 15 minutos. Atrás de um proxy reverso, defina `TRUST_PROXY`.
- **Sessões** expiram e são renovadas enquanto o usuário usa o sistema; o token é conferido no banco a cada requisição, então desativar ou rebaixar uma conta vale na hora.
- **Login**: o tempo de resposta é o mesmo para e-mails cadastrados e não cadastrados; redefinição de senha só funciona uma vez.
- **Segredos no repositório**: `backend/.env` e `node_modules` não são versionados. Se um segredo já foi exposto no histórico do git, consulte [docs/seguranca-credenciais-no-historico.md](docs/seguranca-credenciais-no-historico.md).

## 🎯 Objetivo

Projeto desenvolvido como parte do portfólio acadêmico da 7ª fase do curso de Engenharia de Software, com foco em arquitetura, design de sistemas e boas práticas de desenvolvimento.
