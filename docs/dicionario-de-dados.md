# Dicionário de dados

Banco PostgreSQL 16 com a extensão PostGIS. O esquema é definido em `backend/prisma/schema.prisma` e evolui por *migrations* SQL escritas à mão em `backend/prisma/migrations/` (aplicadas com `npx prisma migrate deploy`; **não use `prisma migrate dev`**, que tentaria apagar a coluna `geom`, gerada pelo Postgres e invisível ao Prisma).

## Tipos enumerados

| Tipo | Valores |
| --- | --- |
| `TipoConta` | `VISITANTE`, `MORADOR`, `NEGOCIO`, `GESTOR`, `MODERADOR`, `ADMIN` |
| `StatusPonto` | `RASCUNHO`, `PENDENTE_VERIFICACAO` (aguardando moderação), `PUBLICADO`, `REJEITADO` |
| `StatusSolicitacao` | `PENDENTE`, `APROVADA`, `REJEITADA` (sugestões, verificações e avaliações) |

## Tabelas

### `usuario`

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `id` | serial, PK | |
| `nome`, `email` (único) | texto | Dados de identificação. Na anonimização (LGPD) são substituídos por valores neutros. |
| `senha_hash` | texto | Hash bcrypt (10 rodadas). Nunca trafega pela API. |
| `tipo_conta` | `TipoConta` | Papel; padrão `VISITANTE`. |
| `cidade_base`, `interesses[]` | texto, texto[] | Preferências usadas nas recomendações. |
| `idioma` | texto | `pt-BR`, `en` ou `es`. |
| `preferencias_acessibilidade[]` | texto[] | `mobilidade_reduzida`, `deficiencia_visual`, `deficiencia_auditiva`, `banheiro_adaptado`, `estacionamento_reservado`. |
| `reputacao` | inteiro | +2 por sugestão aprovada, +1 por avaliação aprovada. A partir de 5, as sugestões são aplicadas direto. |
| `ativo` | booleano | Conta desativada perde o acesso imediatamente. |
| `mfa_ativo`, `mfa_segredo` | booleano, texto | 2FA por TOTP. O segredo é guardado **cifrado** (AES-256-GCM). |
| `consentimento_em` | timestamp | Quando aceitou a Política de Privacidade. |
| `removido_em` | timestamp | Quando a conta foi anonimizada. |
| `data_criacao` | timestamp | |

### `ponto_turistico`

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `id` | serial, PK | |
| `nome`, `categoria`, `cidade` | texto | Obrigatórios. |
| `descricao`, `endereco`, `faixa_preco`, `acessibilidade`, `site_oficial`, `telefone_contato`, `imagem_url` | texto | Opcionais. `acessibilidade` é texto livre, interpretado por palavras-chave nas preferências do perfil. |
| `horario_funcionamento` | texto | Ex.: `Seg-Sex 9h-18h; Sáb 9h-13h`, `Todos os dias, 24h`. Interpretado pelo filtro "aberto agora" e pelo gerador de roteiros. |
| `latitude`, `longitude` | decimal | WGS84. |
| `geom` | `geography(Point,4326)` | **Gerada** pelo Postgres a partir de latitude/longitude, com índice GiST; usada nas buscas por raio. |
| `status` | `StatusPonto` | Fluxo: rascunho → pendente → publicado/rejeitado. |
| `selo_verificado` | booleano | Selo concedido pela moderação. |
| `motivo_rejeicao` | texto | Preenchido ao rejeitar. |
| `versao` | inteiro | Contador para o bloqueio otimista de edição (RB08). |
| `id_responsavel` | FK → `usuario` | Dono do cadastro. |
| `data_criacao`, `data_atualizacao` | timestamp | |

Índices: `cidade`, `categoria`, `status`, `geom` (GiST).

### `avaliacao`

`id`, `id_ponto` (FK, remove em cascata), `id_autor` (FK), `nota` (1–5), `comentario`, `foto_url`, `status` (`StatusSolicitacao`), `motivo_rejeicao`, `motivo_retencao` (`conteudo_suspeito` ou `foto_anexada`: por que ficou em análise), `data_criacao`. **Único por (`id_ponto`, `id_autor`)**: uma avaliação por pessoa e ponto, garantido pelo banco.

### `sugestao_edicao`

`id`, `id_ponto` (FK, cascata), `id_autor` (FK), `campos_propostos` (JSON `{ campo: novoValor }`), `mensagem`, `status`, `id_moderador`, `motivo_rejeicao`, `motivo_retencao`, `data_criacao`, `data_resolucao`.

### `solicitacao_verificacao`

`id`, `id_ponto` (FK, cascata), `id_solicitante` (FK), `comprovacao`, `status`, `id_moderador`, `motivo_rejeicao`, `data_criacao`, `data_resolucao`.

### `versao_ponto` e `versao_roteiro`

Histórico de alterações (RF26). `id`, `id_ponto`/`id_roteiro` (FK, cascata), `dados` (JSON com o retrato completo antes da mudança), `id_autor`, `motivo` (pontos: `edicao`, `antes_de_restaurar` e os de sugestões aplicadas; roteiros: `edicao`, `adicionar_ponto`, `remover_ponto`, `reordenar`, `organizar`, `otimizar`, `antes_de_restaurar`), `data_criacao`. O roteiro guarda até 50 versões.

### `roteiro` e `item_roteiro`

`roteiro`: `id`, `nome`, `descricao`, `cidade`, `data_inicio`, `data_fim`, `id_usuario` (FK), `publico`, `slug_publico` (único; link de compartilhamento), `notas` (anotações livres, só do dono), `orcamento_centavos` (teto de gastos), `data_criacao`, `data_atualizacao`.
`item_roteiro`: `id`, `id_roteiro` (FK, cascata), `id_ponto` (FK), `dia` (1 a 30; padrão 1), `ordem` (vale dentro de cada dia), `observacao`, `custo_centavos` (custo previsto; dinheiro em centavos inteiros), `data_criacao`. **Único por (`id_roteiro`, `id_ponto`)**.

### `item_checklist`

Lista de tarefas do roteiro. `id`, `id_roteiro` (FK, cascata), `texto`, `feito`, `ordem`, `data_criacao`. Até 100 itens por roteiro.

### `ponto_salvo`

Favoritos. `id`, `id_usuario` (FK, cascata), `id_ponto` (FK, cascata), `data_criacao`. Único por (`id_usuario`, `id_ponto`).

### `notificacao`

`id`, `id_usuario` (FK, cascata), `mensagem`, `link`, `lida`, `data_criacao`.

### `log_auditoria`

Trilha de auditoria (RF20): `id`, `id_usuario` (nulo para ações do sistema ou tentativas anônimas), `acao` (ex.: `login_ok`, `login_falhou`, `login_bloqueado`, `alerta_forca_bruta`, `alterar_papel`, `desativar_conta`, `exportar`, `importar`), `entidade`, `id_entidade`, `detalhes` (JSON; nunca guarda senhas nem e-mails digitados), `data_criacao`.

### `metrica_diaria`

Uso agregado (RF28): chave (`dia`, `tipo`), `total`. Os eventos são contados em memória e gravados em lote a cada poucos segundos (e no desligamento do servidor).

## Relacionamentos

```
usuario 1──* ponto_turistico (id_responsavel)      ponto_turistico 1──* avaliacao
usuario 1──* roteiro                                ponto_turistico 1──* sugestao_edicao
usuario 1──* ponto_salvo *──1 ponto_turistico       ponto_turistico 1──* solicitacao_verificacao
usuario 1──* notificacao                            ponto_turistico 1──* versao_ponto
usuario 1──* log_auditoria                          roteiro 1──* item_roteiro *──1 ponto_turistico
                                                    roteiro 1──* versao_roteiro
```

## Dados pessoais (LGPD)

Dados pessoais ficam em `usuario` (nome, e-mail, cidade, preferências), em `log_auditoria.detalhes` (endereço IP de tentativas de login) e nas fotos de avaliações. `GET /auth/me/dados` exporta tudo isso; `DELETE /auth/me` anonimiza a conta (a linha é mantida, sem dados pessoais, para preservar o histórico), apaga roteiros, favoritos, notificações e fotos de avaliação, e remove os rascunhos e pontos rejeitados do usuário; os pontos já publicados continuam no inventário, sem responsável. Nome e e-mail são trocados por valores neutros (`Usuário removido`, `removido-<id>@anonimo.invalid`), o 2FA é desligado e a senha vira um hash inutilizável. O endereço IP das tentativas de login falhas é apagado do log.
