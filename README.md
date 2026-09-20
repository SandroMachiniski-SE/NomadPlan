# NomadPlan

Plataforma de turismo inteligente que centraliza inventários turísticos das cidades e sugere roteiros personalizados para cada usuário.

## ✨ Funcionalidades
- Cadastro e gerenciamento de pontos turísticos, restaurantes, hotéis e eventos.
- Pesquisa de cidades e atrações com filtros por categoria.
- Perfis de usuário com preferências de viagem.
- Sugestão de roteiros personalizados com base no perfil.
- Mapa interativo para explorar atrações.

## 🚀 Tecnologias utilizadas
- **Frontend**: React (ou Angular/Flutter)
- **Backend**: Node.js / Express
- **Banco de Dados**: PostgreSQL ou MySQL
- **Integrações**: Google Maps API / OpenStreetMap

## 🎯 Objetivo
O projeto foi desenvolvido como parte do portfólio acadêmico da 7ª fase do curso de Engenharia de Software, com foco em aplicar conceitos de arquitetura, design de sistemas e boas práticas de desenvolvimento.

## 📌 Como executar

Pré-requisitos: Node.js 22+, Docker Desktop e Git. Rode cada etapa a partir da raiz do projeto.

1. Clone o repositório e suba o banco (PostgreSQL + PostGIS):
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
   O `npm install` já executa `prisma generate` (script `postinstall`). O arquivo `.env` **não** é versionado: copie o `.env.example` e ajuste os valores.

3. Frontend (porta 5173), em outro terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Depois acesse http://localhost:5173.

## 🧪 Testes

```bash
cd backend
npm test
```

A suíte usa o executor de testes nativo do Node (`node:test`) e cobre o rate limit de login e de recuperação de senha, a autenticação (senhas, tokens e redefinição de uso único), a validação do `JWT_SECRET`, o cálculo de distância, a interpretação de horários de funcionamento, o parser de CSV e o filtro de conteúdo.

## 🔒 Segurança

- **`JWT_SECRET`**: em produção (`NODE_ENV=production`) a API recusa iniciar com um segredo curto (menos de 32 caracteres) ou com o valor de exemplo. Gere um com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- **Rate limit**: login (por IP e por e-mail), cadastro, contribuições e recuperação de senha têm limite de tentativas por janela de 15 minutos. Atrás de um proxy reverso (Nginx, load balancer), defina `TRUST_PROXY` com o número de proxies confiáveis para que o limite use o IP real do cliente.
- **Login**: o tempo de resposta é o mesmo para e-mails cadastrados e não cadastrados, para não revelar quais contas existem.
- **Redefinição de senha**: cada link só funciona uma vez; ao trocar a senha, os links anteriores deixam de valer.
- **Segredos no repositório**: `backend/.env` e `backend/node_modules` não são versionados. Se um segredo já foi exposto no histórico do git, consulte [docs/seguranca-credenciais-no-historico.md](docs/seguranca-credenciais-no-historico.md).
