# Sugestões de melhoria (novembro/2026)

Duas sugestões levantadas em uma releitura do projeto no estado atual da `main`. As duas partem
de itens que a própria [documentação de segurança](seguranca.md) já reconhece como pendentes ou
mantém "à mão", e propõem um passo concreto e pequeno para cada um. Nada foi alterado no código:
este documento só descreve o problema, a evidência e a proposta, para o mantenedor decidir.

---

## 1. Monitoramento automático de dependências (Dependabot + `npm audit` no CI)

### Situação atual

- A seção A06 de [seguranca.md](seguranca.md) afirma: *"`npm audit` sem vulnerabilidades no
  frontend e no e2e"*. Hoje isso não é mais verdade: o `npm audit` do frontend aponta
  **10 vulnerabilidades moderadas**, todas em ferramentas de desenvolvimento
  (`eslint`, `@eslint/js`, `typescript-eslint` e dependências como `minimatch`).
  Em produção (`npm audit --omit=dev`) o frontend segue com **0**.
- No backend há 3 altas (`deepmerge-ts`, vinda da CLI do `prisma`), que **já estão registradas**
  em *Riscos aceitos*. Esse caso está bem tratado.
- O CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) roda tipos, build, testes e e2e,
  mas **não tem nenhum passo de auditoria** e a pasta `.github/` não tem `dependabot.yml`.

Ou seja: a afirmação da doc é verificada só quando alguém lembra de rodar `npm audit` manualmente,
e já ficou desatualizada sem que nada avisasse.

### Evidência (reproduzível)

```bash
npm --prefix frontend audit             # 10 moderate severity vulnerabilities (só devDependencies)
npm --prefix frontend audit --omit=dev  # found 0 vulnerabilities
npm --prefix backend  audit --omit=dev  # 3 high (deepmerge-ts via prisma, risco já aceito)
ls .github                              # só "workflows": não existe dependabot.yml
```

### Proposta

**a) Arquivo `.github/dependabot.yml`** — abre PRs de atualização sozinho, uma vez por semana, para
os três projetos npm e para as Actions do CI:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /backend
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /frontend
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /e2e
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

**b) Passo de auditoria no job `frontend` do CI**, que **passa hoje** e quebra o build se uma
dependência de produção ganhar uma vulnerabilidade:

```yaml
      - run: npm audit --omit=dev --audit-level=moderate
```

No backend, o mesmo comando falharia por causa do `deepmerge-ts` (risco já aceito). Duas saídas:
rodar o passo com `continue-on-error: true` (só informativo) ou usar uma ferramenta com lista de
exceções (ex.: `audit-ci`) liberando apenas o aviso `GHSA-ggr8-5vv4-36mx`.

**c) Ajustar a frase da seção A06** para refletir a realidade: *"`npm audit --omit=dev` sem
vulnerabilidades no frontend (restam alertas moderados só em ferramentas de desenvolvimento)"*.

### Esforço e risco

Baixo. São dois arquivos de configuração e uma linha de documentação, sem mudança de código da
aplicação. O único efeito colateral é receber PRs semanais do Dependabot (que podem ser agrupados
ou limitados com `open-pull-requests-limit`).

---

## 2. Content-Security-Policy com `script-src` (começando em modo só-relatório)

### Situação atual

- A tabela *Riscos aceitos* de [seguranca.md](seguranca.md) registra que o token de sessão fica no
  `localStorage` (o código está em `frontend/src/services/api.ts`) e que, para produção real, a
  mitigação recomendada inclui *"definir uma Content-Security-Policy no servidor do frontend"*.
- O [deploy/Caddyfile](../deploy/Caddyfile) (e o `Caddyfile.interno`) **já define uma CSP**, mas só
  com as restrições que não afetam o site:

  ```
  Content-Security-Policy "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
  ```

  Faltam `default-src` e `script-src`, que são justamente as diretivas que limitam o estrago de um
  XSS (impedem carregar e executar script de outra origem, mesmo que alguém consiga injetar uma
  tag). Como o token está no `localStorage`, é o que mais reduziria o risco já aceito.
- Ponto favorável: o [frontend/index.html](../frontend/index.html) **não tem script nem estilo
  inline** (só `<script type="module" src="/src/main.tsx">`), então `script-src 'self'` é viável
  sem refatorar nada.

### Origens externas que o frontend usa (levantadas no código)

| Uso | Origem | Onde |
| --- | --- | --- |
| Tiles do mapa | `https://{s}.tile.openstreetmap.org` | `MapaPontos.tsx`, `MapaRoteiro.tsx` |
| Fontes | `https://fonts.googleapis.com` (CSS) e `https://fonts.gstatic.com` (arquivos) | `index.html` (linhas 13 a 16) |
| API | o endereço de `DOMINIO_API` | `frontend/src/services/api.ts` |
| Fotos de lugares | Wikimedia Commons e fotos do Google via API (descritas em seguranca.md) | a confirmar na prática |

### Proposta

Publicar primeiro em **modo só-relatório** (não bloqueia nada, apenas registra violações no
console do navegador), navegar pelo site e ajustar a lista até não haver violações; só então trocar
para `Content-Security-Policy`:

```
Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://upload.wikimedia.org https://*.googleusercontent.com; connect-src 'self' https://{$DOMINIO_API}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
```

Esta lista é um **ponto de partida**, não um valor validado: `'unsafe-inline'` em `style-src` foi
incluído por precaução (React e Leaflet costumam aplicar estilos em linha), e os hosts de imagem
vêm da leitura do código e da documentação, devendo ser confirmados no console durante o teste.

### Esforço e risco

Baixo a médio. A mudança é de uma linha no Caddyfile, mas exige uma rodada de teste manual pelas
telas principais (mapa, detalhes do lugar com foto, roteiro) para não bloquear algo legítimo — por
isso a recomendação de começar com `Report-Only`. Não altera o código React nem o backend.

---

## Como validar depois de aplicar

1. **Dependabot:** aba *Insights → Dependency graph → Dependabot* do repositório lista as
   atualizações; o primeiro lote de PRs deve aparecer em até uma semana.
2. **Auditoria no CI:** abrir um PR de teste que adicione uma dependência de produção
   comprovadamente vulnerável e confirmar que o job `frontend` falha.
3. **CSP:** em `https://<DOMINIO_WEB>`, abrir *DevTools → Console*, navegar pelo site e checar que
   não há mensagens `Content Security Policy`; em *Network*, o cabeçalho de resposta do
   `index.html` deve conter a política.
