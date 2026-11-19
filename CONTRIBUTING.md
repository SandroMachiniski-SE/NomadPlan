# Como contribuir com o NomadPlan

Obrigado pelo interesse. Este guia mostra como rodar o projeto, o que esperamos de uma alteração e como ela chega à `main`.
O projeto é individual e acadêmico (Católica SC), mas está aberto a sugestões, relatos de erro e revisão de código.

## Relatar um erro ou sugerir algo

Abra uma *issue* descrevendo: o que você esperava, o que aconteceu, os passos para repetir e, se possível, o navegador e o
endereço. Para falhas de segurança, **não** abra issue pública: veja [docs/seguranca.md](docs/seguranca.md) e escreva ao autor
pelo e-mail do perfil do GitHub.

## Preparar o ambiente

Pré-requisitos: Node.js 22, Docker (banco PostgreSQL com PostGIS) e Git. O passo a passo completo está em
[Como executar](README.pt-BR.md#-como-executar). Em resumo:

```bash
docker compose up -d                                  # banco (PostGIS) e caixa de e-mail de teste
cd backend && cp .env.example .env && npm ci
npx prisma migrate deploy && npm run prisma:seed      # nunca use "prisma migrate dev" (ver o README)
npm run dev
cd ../frontend && npm ci && npm run dev               # em outro terminal
```

## Padrões do código

- **TypeScript** nos dois lados, sem `any` solto; o frontend passa no ESLint (`npm run lint`) e o backend no `npm run typecheck`.
- **Regra de negócio em `backend/src/lib`**, fora das rotas do Express, para poder ser testada sem subir servidor.
- **Validação de toda entrada** com Zod na rota; mensagens de erro claras, em português.
- **Migrações do banco** em SQL, em `backend/prisma/migrations`, que só acrescentam (a volta de versão do deploy depende disso).
- Textos e nomes do domínio em português, como no restante do código.

## Testes primeiro (TDD)

Escreva o teste que falha, depois o código que o faz passar. Vale para regras de negócio (testes unitários `*.test.ts`), rotas
(testes de integração `*.itest.ts`, com banco real) e telas (Vitest + Testing Library, e Playwright para o fluxo completo).

```bash
cd backend  && npm test                 # unitários + integração (banco "nomadplan_teste", descartável)
cd frontend && npm test                 # unitários e de componentes
cd e2e && npx playwright test           # ponta a ponta (banco "nomadplan_e2e", descartável)
npm run test:cobertura                  # em backend e em frontend: relatório de cobertura
```

Metas de cobertura da disciplina: **75% no backend** e **25% no frontend**. Prefira testes que exercitam regra de negócio; um teste
que só percorre linhas para subir o percentual não conta como qualidade. Nunca rode testes contra um banco de verdade.

## Enviar uma alteração

1. Crie uma branch a partir da `main` (`feat/...` ou `fix/...`).
2. Faça commits pequenos, com mensagem no imperativo e dizendo o porquê (`fix(notas): ...`).
3. Rode lint, testes e build antes de abrir o *pull request*; o CI repete tudo (backend, frontend, ponta a ponta e análise
   estática) e precisa ficar verde.
4. Descreva no PR o que mudou, como foi testado e o que o revisor precisa observar. Mudança de comportamento atualiza também a
   documentação (`docs/api.md`, `docs/requisitos.md`).
5. Depois do merge na `main`, o deploy para a VPS é automático ([docs/implantacao-automatica.md](docs/implantacao-automatica.md)).

## Segurança e dados

Nunca coloque senhas, chaves ou o `.env.prod` no repositório. Dados pessoais seguem a LGPD ([docs/seguranca.md](docs/seguranca.md)).
Ao usar bibliotecas, assets ou dados de terceiros, respeite a licença e dê o crédito (o projeto é MIT; os dados do OpenStreetMap
são ODbL).
