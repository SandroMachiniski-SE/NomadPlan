# Credenciais commitadas no histórico do git

## O problema

O arquivo `backend/.env` está versionado no repositório desde o commit
`3cf32d6` ("Adiciona backend, frontend e docker-compose do NomadPlan") e
recebeu uma nova versão no commit `bc7ad38` ("feat: adiciona autenticacao,
contas e perfis"). O `.gitignore` do projeto já tem a linha `.env`, mas isso
só impede *novos* commits de incluir o arquivo — não remove o que já foi
commitado. Hoje, qualquer pessoa que clonar o repositório (ou olhar o
histórico no GitHub) consegue ver o conteúdo desses commits:

```
DATABASE_URL="postgresql://nomadplan:nomadplan_dev@localhost:5432/nomadplan?schema=public"
PORT=3333
FRONTEND_URL="http://localhost:5173"
JWT_SECRET="dev-only-change-me-nomadplan-jwt-secret"
JWT_EXPIRES_IN="7d"
```

## Por que isso importa

- O `JWT_SECRET` é o que assina os tokens de autenticação da API. Qualquer
  pessoa com esse valor consegue **forjar um token válido para qualquer
  usuário**, inclusive de conta `ADMIN`, sem precisar de senha.
- As credenciais do Postgres também ficam expostas. Hoje elas só valem para
  o container local (`docker-compose.yml`), mas se esse mesmo usuário/senha
  for reaproveitado em um ambiente real (homologação, produção), o banco
  fica exposto.
- Está marcado como "dev-only" no valor, o que reduz o risco imediato — mas
  não existe garantia de que ninguém tenha copiado esse `.env` para rodar em
  outro ambiente sem trocar o segredo.

## Por que não corrigimos isso diretamente nesta branch

Remover um arquivo do **histórico** (não só do commit atual) exige reescrever
todos os commits que o contêm, usando uma ferramenta como
[`git filter-repo`](https://github.com/newren/git-filter-repo) ou o
[BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/), seguido de um
`push --force` para o `origin`. Isso:

- Muda o hash de todos os commits a partir de `3cf32d6`, incluindo os que já
  foram mesclados nas branches `modulo-1` a `modulo-5`.
- Invalida os clones locais que o Sandro (e qualquer outro colaborador) já
  tem — todo mundo precisaria re-clonar ou resetar o repositório manualmente.
- É uma operação administrativa do repositório, não uma mudança de código
  revisável em um PR normal.

Por isso, preferimos documentar o problema com clareza para que o Sandro
decida quando e como aplicar a correção, em vez de forçar isso por dentro de
uma contribuição de branch.

## O que recomendamos que o Sandro faça

1. **Trocar o `JWT_SECRET` real** usado em qualquer ambiente que não seja o
   Docker local de desenvolvimento — mesmo sem limpar o histórico, isso já
   invalida o segredo exposto.
2. Quando tiver um momento tranquilo (sem ninguém com PR aberto), limpar o
   histórico:
   ```bash
   # instalar git-filter-repo, depois:
   git filter-repo --path backend/.env --invert-paths
   git push origin --force --all
   git push origin --force --tags
   ```
3. Avisar os colaboradores para re-clonar o repositório após o force-push
   (um `git pull` normal não resolve, pois o histórico mudou).
4. Confirmar que `backend/.env` continua listado em `.gitignore` (já está) e
   que o `backend/.env.example` (sem segredos reais) segue sendo a referência
   para novos ambientes.

## Observação relacionada (fora do escopo desta branch)

A pasta `backend/node_modules` também está commitada por completo (~6 mil
arquivos), pelo mesmo motivo: foi adicionada antes do `.gitignore` existir.
Não é um problema de segurança, mas infla bastante o repositório. Vale uma
limpeza (`git rm -r --cached backend/node_modules`) em uma contribuição
futura.
