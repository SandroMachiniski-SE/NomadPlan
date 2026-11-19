# Requisitos, histórias de usuário e fluxos de negócio

Este documento resume o que o NomadPlan faz e **onde cada fluxo é verificado por teste**. A especificação completa (personas,
casos de uso, RF01–RF28, RNF01–RNF28 e regras de negócio RB01–RB10) está no [RFC](../RFC.pdf), seções 6.1 a 6.5; os dados estão
descritos em [dicionario-de-dados.md](dicionario-de-dados.md) e a API em [api.md](api.md).

## Requisitos funcionais (resumo)

| Grupo | Requisitos | O que o sistema faz |
| --- | --- | --- |
| Conta e perfil | RF01, RF02, RF03, RF21 | Cadastro, login, recuperação de senha por e-mail, perfil com interesses e acessibilidade, verificação em duas etapas (TOTP) |
| Cadastro de pontos | RF04, RF05, RF06, RF07, RF23 | Cadastro com rascunho, sugestões de edição, moderação (aprovar/rejeitar), selo de verificado, confirmações entre usuários |
| Exploração | RF08, RF09, RF10, RF24 | Busca por cidade, texto, categoria, acessibilidade, preço, "aberto agora" e proximidade; lista e mapa; ficha do ponto; recomendações por gosto parecido |
| Roteiros | RF11, RF12, RF13, RF25, RF26 | Roteiros de vários dias, geração automática respeitando horários, otimização da ordem, compartilhamento por link, histórico de versões |
| Comunidade | RF14, RF15, RF16 | Avaliações com foto, moderação, reputação |
| Gestão e dados | RF17, RF18, RF19, RF20, RF22, RF27, RF28 | Exportação e importação (CSV/GeoJSON), papéis, log de auditoria, notificações, painel administrativo, métricas de uso |

Requisitos não funcionais acompanhados em produção: desempenho de busca e geração (RNF01, RNF02), 100 usuários simultâneos
(RNF04, [relatório de carga](relatorio-de-carga.md)), backup e recuperação (RNF07, RNF08, [operação](operacao.md)), segurança
(RNF09 a RNF13, [segurança](seguranca.md)), cobertura de testes (RNF22), deploy com volta automática (RNF24,
[implantação automática](implantacao-automatica.md)) e monitoramento (RNF25, [monitoramento](monitoramento.md)).

## Histórias de usuário

Formato: *como [papel], quero [ação], para [benefício]*. A coluna "Verificação" aponta o teste de ponta a ponta (Playwright,
pasta `e2e/testes/`) que percorre a história no navegador.

| # | História | RF | Verificação |
| --- | --- | --- | --- |
| H1 | Como visitante, quero criar uma conta aceitando a política de privacidade, para guardar meus roteiros. | RF01 | `01-autenticacao` |
| H2 | Como usuária, quero recuperar a senha por e-mail, para voltar a entrar quando a esquecer. | RF02 | `01-autenticacao`, `auth.itest.ts` |
| H3 | Como turista, quero buscar pontos por cidade e categoria e ver o resultado na lista e no mapa, para escolher o que visitar. | RF08, RF09 | `02-exploracao` |
| H4 | Como turista, quero abrir a ficha de um ponto com horário, fotos e avaliações, para decidir se vale a visita. | RF10 | `02-exploracao` |
| H5 | Como turista, quero que o sistema gere um roteiro com horários de chegada e saída que respeitem o funcionamento dos lugares, para não chegar com tudo fechado. | RF12, RF25 | `04-roteiros`, `07-roteiro-por-dia` |
| H6 | Como viajante, quero um roteiro de vários dias com orçamento, checklist e notas, para organizar a viagem toda. | RF11 | `07-roteiro-por-dia`, `08-planejamento`, `11-caderno-de-viagem` |
| H7 | Como viajante de carro, quero que a estrada seja dividida em dias e que o pernoite longe do alvo só entre com o meu aceite, para não ser surpreendido por uma etapa longa demais. | RF12, RF25 | `12-viagem-de-carro` |
| H8 | Como dono de roteiro, quero convidar alguém como editor ou leitor e ver as alterações dela, para planejar em conjunto. | RF13 | `09-colaboracao` |
| H9 | Como morador, quero cadastrar um lugar que falta (até marcando no mapa), para ajudar a comunidade. | RF04 | `03-cadastro-e-moderacao`, `13-lugar-novo-no-mapa` |
| H10 | Como moderador, quero revisar, aprovar ou rejeitar (com motivo) os cadastros e as sugestões, para manter a qualidade dos dados. | RF06, RF15 | `03-cadastro-e-moderacao` |
| H11 | Como administrador, quero ver o log de auditoria e as métricas de uso, para acompanhar o sistema. | RF19, RF20, RF28 | `06-administracao` |
| H12 | Como usuária, quero baixar meus dados e excluir a minha conta, para exercer os direitos da LGPD. | RNF13 | `05-perfil-e-privacidade` |

## Fluxos de negócio completos

Cada fluxo vai de uma ação inicial até um resultado persistido e visível, atravessando tela, API e banco. Os três primeiros são os
**fluxos de negócio principais** da linha Web Apps; os demais complementam.

### Fluxo 1 — Do interesse ao roteiro pronto (gerar e planejar)

1. A pessoa entra, escolhe cidades, dias, horas por dia e interesses (H5, H6).
2. O motor de recomendação monta cada dia respeitando horários, distâncias e acessibilidade (RB07) e devolve as paradas com
   chegada e saída estimadas.
3. Ela ajusta a ordem, define custos por parada e um teto de gastos (campos que só aceitam números bem digitados), anota e
   salva.
4. O roteiro fica no banco com histórico de versões (RF26) e pode ser compartilhado por link público (RF13), que mostra o roteiro
   mas não as notas nem o orçamento.

Verificação: `04-roteiros`, `07-roteiro-por-dia`, `08-planejamento`; integração em `roteirosPlanejamento.itest.ts` e `roteiros.itest.ts`.

### Fluxo 2 — Da contribuição ao ponto publicado (cadastrar e moderar)

1. Uma conta cadastra um lugar novo (formulário ou marcando no mapa da busca); o sistema avisa de possíveis duplicados (RB05).
2. O ponto entra como rascunho, é enviado para revisão e só é publicado quando cumpre os campos mínimos (RB06).
3. O moderador aprova ou rejeita com motivo; o autor é notificado (RF22) e a alteração fica no histórico e no log de auditoria.
4. Publicado, o ponto passa a aparecer na busca e nos roteiros.

Verificação: `03-cadastro-e-moderacao`, `13-lugar-novo-no-mapa`; integração em `pontos.itest.ts`, `contribuicoes.itest.ts` e `social.itest.ts`.

### Fluxo 3 — Viagem de carro de ponta a ponta

1. A pessoa informa a cidade de casa, o destino e o alvo de quilômetros por dia.
2. A estrada é dividida em dias. Se não há hospedagem até 100 km do alvo, o sistema **propõe** a próxima cidade com hospedagem e
   espera o aceite; nada é decidido sozinho.
3. O consumo do carro e o preço do combustível entram no orçamento.
4. A viagem é salva como roteiro de vários dias, com a estrada, os pernoites e o combustível, e pode ser compartilhada.

Verificação: `12-viagem-de-carro`; integração em `viagemDeCarro.itest.ts` e `viagemDeCarroSalvar.itest.ts`; unitários em
`divisaoEmDias.test.ts`.

### Fluxo 4 — Planejamento em conjunto (colaboração)

Convite por e-mail com papel de editor ou leitor, atualização automática entre os participantes, proteção contra gravação
simultânea das notas (conflito `409` e `428` para páginas antigas) e bloqueio de quem só lê. Verificação: `09-colaboracao`.

### Fluxo 5 — Conta, segurança e privacidade

Cadastro com aceite da política, login com bloqueio por tentativas, verificação em duas etapas, recuperação de senha, download
dos dados e exclusão da conta (LGPD). Verificação: `01-autenticacao`, `05-perfil-e-privacidade`.

## Como rodar as verificações

Ver "Testes" no [README](../README.pt-BR.md): `npm test` (backend), `npm test` (frontend) e `npx playwright test` (ponta a
ponta). Cobertura: `npm run test:cobertura` em cada pasta.
