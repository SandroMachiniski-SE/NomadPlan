# Segurança no NomadPlan

Este documento resume os controles de segurança do sistema, organizados pelo OWASP Top 10 (2021), e registra os riscos que foram conscientemente aceitos. Quem implanta o sistema deve ler também [operacao.md](operacao.md).

## Controles por categoria do OWASP Top 10

| # | Categoria | Como o NomadPlan trata |
| --- | --- | --- |
| A01 | Controle de acesso quebrado | Cada rota declara o papel mínimo (`autorizar`); nos roteiros, um middleware confere se a pessoa participa e se o papel dela (dono, editor, leitor) basta para a operação, antes de qualquer rota. O token é conferido **no banco a cada requisição**: conta desativada ou rebaixada perde o acesso na hora. Recursos pessoais (roteiros, favoritos, notificações) são sempre filtrados pelo usuário logado; pontos não publicados só aparecem para o dono e a moderação. Testes de integração cobrem acesso indevido a recursos de outra pessoa. |
| A02 | Falhas criptográficas | Senhas com bcrypt (10 rodadas). Segredo do 2FA cifrado com AES-256-GCM (`CHAVE_CRIPTOGRAFIA`). Tokens JWT assinados com `JWT_SECRET`; em produção a API **recusa iniciar** com segredo curto ou de exemplo. Link de redefinição de senha vale 15 min e é de uso único. HTTPS é responsabilidade do proxy reverso (ver *Riscos aceitos*). |
| A03 | Injeção | Acesso ao banco só por Prisma; as consultas SQL manuais usam *tagged templates* parametrizados, e os caracteres `%` e `_` das buscas são escapados. Entradas validadas com Zod (tipos, tamanhos, listas limitadas). O React escapa o conteúdo exibido; não há `dangerouslySetInnerHTML`. |
| A04 | Projeto inseguro | Limites de taxa por IP e por conta (login, cadastro, contribuições, recuperação de senha); moderação obrigatória para publicar; filtro automático de conteúdo suspeito; bloqueio otimista contra edições simultâneas; avaliação única por pessoa garantida por índice único no banco. |
| A05 | Configuração incorreta | `helmet` com cabeçalhos de segurança; CORS restrito ao endereço do frontend (`FRONTEND_URL`); corpo JSON limitado a 100 KB; erros internos devolvem mensagem genérica e vão para o log; `.env` fora do git; imagens enviadas servidas somente leitura, sem listar diretório. |
| A06 | Componentes vulneráveis | `npm audit` sem vulnerabilidades no frontend e no e2e; no backend restam apenas as listadas em *Riscos aceitos*. Os `package-lock.json` fixam versões; o CI roda com `npm ci`. |
| A07 | Falhas de identificação e autenticação | Bloqueio após 3 senhas erradas por e-mail e 10 por IP (janela de 15 min) com alerta aos administradores quando há sequência de bloqueios; verificação em duas etapas (TOTP, RFC 6238) com proteção contra reutilização do código; tempo de resposta do login igual para e-mails existentes e inexistentes; recuperação de senha sem revelar quais e-mails existem; sessão expira e é renovada enquanto válida. |
| A08 | Falhas de integridade | Uploads validados pelo **conteúdo** (assinatura do arquivo), não só pelo nome ou tipo informado; extensão gravada derivada do tipo real; limite de 5 MB (imagens) e 2 MB (importações). Nenhuma desserialização de dados não confiáveis; dependências travadas pelos arquivos de lock. |
| A09 | Falhas de registro e monitoramento | Log de auditoria (RF20) para ações sensíveis: login, falhas e bloqueios, mudança de papel, desativação de conta, importação e exportação, moderação. O e-mail digitado em tentativas falhas **não** é gravado. Alerta automático de possível força bruta. Métricas de uso agregadas. |
| A10 | SSRF | O servidor nunca busca URLs informadas por usuários (o campo "site oficial" é apenas armazenado e exibido como link). Os scripts de importação (`osm:baixar` e `baixar_overture.py`) e a integração opcional com o Google Places só acessam endereços fixos (Overpass API, Wikidata, Wikimedia Commons, armazenamento público do Overture e `places.googleapis.com`). Sites vindos dessas fontes só são aceitos com `http(s)`. |

## Privacidade (LGPD)

- Aceite explícito da Política de Privacidade no cadastro (`/privacidade`), registrado com data; contas antigas veem um aviso até aceitarem.
- Portabilidade: o próprio usuário baixa seus dados em JSON (Perfil → *Baixar meus dados*).
- Exclusão: o usuário anonimiza a conta pelo Perfil, confirmando com a senha (e o código do 2FA). Detalhes no [dicionário de dados](dicionario-de-dados.md#dados-pessoais-lgpd).
- Minimização: o e-mail nunca é exibido a outros usuários; a localização usada em buscas "perto de mim" não é gravada.
- Serviços de terceiros carregados pelo navegador: as imagens do mapa (OpenStreetMap), as fotos importadas do Wikimedia Commons e, com a integração ligada, as fotos do Google vêm direto desses servidores, que recebem o endereço IP de quem visualiza a página, como em qualquer site que usa esses serviços. Nenhum dado da conta é enviado a eles.

## Riscos aceitos

Decisões tomadas por serem adequadas ao escopo acadêmico ou por dependerem da infraestrutura de implantação. Todas devem ser revistas antes de um uso em produção real.

| Risco | Situação | Mitigação atual / recomendação |
| --- | --- | --- |
| **Token de sessão no `localStorage`** do navegador | Um XSS bem-sucedido poderia roubar o token. | O React escapa o conteúdo, não há HTML injetado e o `helmet` está ativo. Para produção real, migrar para cookie `HttpOnly` + proteção CSRF e definir uma Content-Security-Policy no servidor do frontend. |
| **Limite de taxa em memória** | Cada instância da API tem seus contadores; com várias instâncias o limite efetivo se multiplica, e reiniciar zera a contagem. | Suficiente para uma instância. Com mais de uma, usar um repositório compartilhado (Redis). Atrás de proxy, definir `TRUST_PROXY`. |
| **HTTPS fora da aplicação** | A API fala HTTP; sem TLS, senhas e tokens trafegam em claro. | Em produção, sempre atrás de um proxy reverso com TLS (Nginx, Caddy, balanceador da nuvem). |
| **Política de senha mínima** | Exige 8 a 72 caracteres, sem regras de composição ou verificação em listas de senhas vazadas. | Alinhado às recomendações atuais do NIST (tamanho acima de complexidade); o 2FA e o bloqueio por tentativas complementam. |
| **2FA sem códigos de recuperação** | Quem perde o aplicativo autenticador depende de um administrador para reaver a conta. | A recuperação é manual: após confirmar a identidade da pessoa, um administrador desativa o 2FA da conta direto no banco. Códigos de uso único são a evolução natural. |
| **Imagens enviadas não são reprocessadas** | O conteúdo é validado pela assinatura do arquivo, mas a imagem é guardada como veio (sem remover metadados EXIF nem passar antivírus). | Fotos de avaliações passam por moderação humana. Para produção, reprocessar com uma biblioteca de imagem. |
| **`prisma` (CLI) → `deepmerge-ts` com alerta no `npm audit`** | Vulnerabilidade de esgotamento de pilha ao mesclar objetos recursivos, apenas na ferramenta de linha de comando. | Só é executada em desenvolvimento e na implantação (`migrate deploy`), nunca em requisições, e sem entrada de usuários. A correção exige Prisma 7 (mudança de versão maior); revisar quando for planejada a atualização. |
| **Chave do 2FA derivada do `JWT_SECRET`** | Sem `CHAVE_CRIPTOGRAFIA`, trocar o `JWT_SECRET` torna ilegíveis os segredos de 2FA já gravados. | Em produção, definir `CHAVE_CRIPTOGRAFIA` própria e guardá-la com o mesmo cuidado. |
| **E-mail não verificado no cadastro** | Os convites de roteiro valem para quem usa o e-mail convidado, e a plataforma não confirma que o e-mail pertence a quem cadastra: alguém poderia criar uma conta com o e-mail de outra pessoa que ainda não tem conta e aceitar um convite feito a ela. | O convite só dá acesso ao roteiro daquele convite, nunca à conta; o dono vê quem aceitou e pode remover a pessoa na hora. Para produção, enviar um link de confirmação de e-mail no cadastro. |
| **Chave do Google Places** | Com `GOOGLE_MAPS_API_KEY` configurada, quem abusar da página do ponto gasta a cota da conta do projeto. | A chave fica só no backend (nunca vai ao navegador; a foto é entregue por um endereço sem a chave), a rota tem limite por IP e a chave deve ser restrita à Places API (New) no console do Google, com alerta de orçamento. |
| **Contas de demonstração do seed** | `npm run prisma:seed` cria `admin@`, `moderador@`, `negocio@` e `morador@nomadplan.local` com senha conhecida. | O seed **recusa rodar** com `NODE_ENV=production`. Se o banco de demonstração for reaproveitado, troque a senha ou remova essas contas antes de qualquer uso real. |

## Como reportar um problema de segurança

Abra uma *issue* privada no repositório ou contate diretamente a equipe do projeto. Não publique detalhes de uma vulnerabilidade antes da correção.
