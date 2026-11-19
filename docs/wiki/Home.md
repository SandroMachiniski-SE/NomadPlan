# NomadPlan — Wiki

Plataforma web de turismo inteligente: centraliza o inventário turístico das cidades e gera roteiros personalizados (inclusive
viagens de carro com pernoite) respeitando horários, distâncias, interesses e acessibilidade.

**Em produção:** <https://nomadplan.blackyears.com.br> · **API:** <https://api.nomadplan.blackyears.com.br/health> ·
**Código:** <https://github.com/SandroMachiniski-SE/NomadPlan>

> Esta Wiki é **gerada a partir da pasta `docs/` do repositório** a cada alteração na `main` (workflow *Wiki*). Para corrigir uma
> página, edite o arquivo em `docs/` por pull request; edições feitas aqui são sobrescritas.

## Por onde começar

| Quero... | Leia |
| --- | --- |
| Entender o que o sistema faz e como é testado | [Requisitos](Requisitos) |
| Ver a arquitetura (C4) e as decisões | [Arquitetura](Arquitetura) |
| Conhecer as rotas da API | [API](API) |
| Entender os dados | [Dicionário de dados](Dicionario-de-Dados) |
| Contribuir com o código | [Contribuindo](Contribuindo) |

## Engenharia e operação

| Tema | Leia |
| --- | --- |
| Deploy automático (CI/CD) e volta de versão | [Implantação automática](Implantacao-Automatica) |
| Implantação inicial na VPS | [Implantação web](Implantacao-Web) |
| Backup, recuperação e procedimentos | [Operação](Operacao) |
| Métricas, painel e alertas (Prometheus + Grafana) | [Monitoramento](Monitoramento) |
| Análise estática e de segurança (SonarCloud) | [Análise estática](Analise-Estatica) |
| Segurança, LGPD e riscos aceitos | [Segurança](Seguranca) |
| Teste de carga (100 usuários) | [Relatório de carga](Relatorio-de-Carga) |

## Resumo técnico

React 19 + TypeScript + Vite · Node.js 22 + Express + Prisma · PostgreSQL 16 com PostGIS · Docker Compose · GitHub Actions
(CI/CD) · Prometheus e Grafana · SonarCloud · testes com `node:test`, Vitest e Playwright.
