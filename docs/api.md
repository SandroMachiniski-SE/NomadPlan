# API do NomadPlan

Referência das rotas da API REST (`backend/`, porta 3333 por padrão). Todas as respostas são JSON, exceto onde indicado.
Erros têm o formato `{ "erro": "mensagem em português" }`; erros de validação trazem também `detalhes`.

**Autenticação.** Rotas marcadas com 🔒 exigem o cabeçalho `Authorization: Bearer <token>`. O token vem de `POST /auth/login` ou `POST /auth/registrar`, expira em `JWT_EXPIRES_IN` (padrão 1 dia) e é conferido contra o banco a cada requisição: conta desativada ou rebaixada perde o acesso na hora. Renove-o com `POST /auth/renovar` enquanto ainda for válido.

**Papéis.** `VISITANTE`, `MORADOR`, `NEGOCIO`, `GESTOR`, `MODERADOR`, `ADMIN`. A coluna *Papel* abaixo indica o mínimo exigido; "moderação" = `MODERADOR` ou `ADMIN`.

**Dinheiro** é sempre em **centavos inteiros** (`2590` = R$ 25,90), de 0 a 100.000.000.

**Códigos comuns.** `400` dados inválidos · `401` sem login ou sessão inválida · `403` sem permissão · `404` não encontrado · `409` conflito (duplicado, versão desatualizada, estado incompatível) · `413` arquivo ou corpo grande demais · `415` formato de arquivo não aceito · `429` limite de tentativas · `500` erro interno · `504` busca excedeu o tempo limite.

## Saúde

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok", "servico": "nomadplan-api" }` — para checagem de disponibilidade. |

## Autenticação e conta — `/auth`

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| POST | `/auth/registrar` | público | Cria a conta. Corpo: `nome`, `email`, `senha` (8–72), `tipoConta?` (`VISITANTE`, `MORADOR`, `NEGOCIO` ou `GESTOR`), `cidadeBase?`, `codigoMunicipioBase?` (município de casa, código IBGE; preenche a `cidadeBase` com o nome dele), `aceitouPolitica: true` (obrigatório, LGPD). Limite: 10 contas/15 min por IP. Resposta `201`: `{ usuario, token }`. |
| POST | `/auth/login` | público | Corpo: `email`, `senha`, `codigoMfa?`. Se a conta tem 2FA e o código não veio, responde `{ "mfaNecessario": true }` (sem token). Bloqueio: 3 falhas por e-mail e 10 por IP em 15 min → `429` com `tentarNovamenteEmMinutos`. |
| POST | `/auth/renovar` 🔒 | qualquer | Emite um token novo (e o usuário atualizado). |
| GET | `/auth/me` 🔒 | qualquer | Perfil do usuário logado, com `municipioBase` (`{ codigoIbge, cidade, uf }` ou `null`) e `consumoKmPorLitro`. |
| PUT | `/auth/me` 🔒 | qualquer | Atualiza `nome`, `cidadeBase`, `codigoMunicipioBase` (`null` limpa; código inexistente → `400`), `consumoKmPorLitro` (3 a 40, `null` limpa), `interesses`, `idioma` (`pt-BR`, `en`, `es`) e `preferenciasAcessibilidade` (`mobilidade_reduzida`, `deficiencia_visual`, `deficiencia_auditiva`, `banheiro_adaptado`, `estacionamento_reservado`). |
| POST | `/auth/consentimento` 🔒 | qualquer | Registra o aceite da Política de Privacidade (contas anteriores a ela). |
| GET | `/auth/me/dados` 🔒 | qualquer | Baixa um JSON com todos os dados pessoais (LGPD, portabilidade). |
| DELETE | `/auth/me` 🔒 | qualquer | Exclui (anonimiza) a conta. Corpo: `senha` e, com 2FA, `codigoMfa`. O único administrador não pode se excluir (`409`). |
| POST | `/auth/mfa/configurar` 🔒 | qualquer | Inicia o 2FA: devolve `segredo` (base32) e `otpauthUrl` (para QR code). |
| POST | `/auth/mfa/ativar` 🔒 | qualquer | Corpo: `codigo` de 6 dígitos do aplicativo autenticador. |
| POST | `/auth/mfa/desativar` 🔒 | qualquer | Corpo: `senha` e `codigoMfa`. |
| POST | `/auth/esqueci-senha` | público | Corpo: `email`. Resposta genérica (não revela se a conta existe); envia o link por e-mail. Limite: 10/15 min por IP. |
| POST | `/auth/redefinir-senha` | público | Corpo: `token`, `novaSenha`. O token vale 15 min e uma única vez. |

## Pontos turísticos — `/pontos`

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| GET | `/pontos` | público | Busca pontos **publicados**. Filtros: `cidade` (sem acento, com ou sem a UF; um trecho do nome também vale), `categoria`, `busca` (nome/descrição), `acessibilidade`, `faixaPreco`, `lat`+`lng`+`raioKm` (padrão 10, máx. 200), `notaMinima` (1–5), `abertoAgora` (`true`), `ordenar` (`relevancia`, `distancia`, `nome`, `avaliacao`; padrão `distancia` quando há `lat/lng` e `relevancia` nos demais casos: termo buscado no começo do nome, selo de verificado, nota e cadastro mais completo, com foto, horário, site e acessibilidade), `limite` (1–100, padrão 20). Resposta: `{ total, dados[] }`, cada ponto com `mediaAvaliacao`, `totalAvaliacoes` e, se houve `lat/lng`, `distanciaMetros`. Se o banco demorar mais que `BUSCA_TIMEOUT_MS`, responde o último resultado igual em cache com `desatualizado: true`, ou `504`. |
| GET | `/pontos/cidades` | público | Cidades com pontos publicados e quantos pontos cada uma tem: `{ dados: [{ cidade, pontos }] }`. Alimenta as sugestões do campo de cidade. Variações do mesmo nome ("Joinville" e "joinville") aparecem uma vez. |
| GET | `/pontos/recomendados` 🔒 | qualquer | Recomendações para o usuário: pontos salvos/bem avaliados/em roteiros de pessoas com gosto parecido e, para completar, pontos dos interesses do perfil (priorizando acessibilidade e, depois, o cadastro mais completo: foto, horário, site). Cada item traz `motivoRecomendacao` (`usuarios_semelhantes` ou `interesses`). |
| GET | `/pontos/meus` 🔒 | qualquer | Pontos dos quais o usuário é responsável (qualquer status). |
| GET | `/pontos/moderacao` 🔒 | moderação | Pontos aguardando aprovação. |
| GET | `/pontos/exportar?formato=csv\|geojson` 🔒 | gestor+ | Exporta o inventário publicado, com `origem` e `idOsm` de cada ponto. Pontos vindos do OpenStreetMap seguem a licença ODbL: quem redistribuir a base precisa manter a atribuição e a mesma licença. |
| GET | `/pontos/importar/modelo?formato=csv\|geojson` 🔒 | gestor+ | Baixa um arquivo-modelo para importação. |
| POST | `/pontos/importar?confirmarDuplicidade=` 🔒 | gestor+ | Importa CSV ou GeoJSON (`multipart`, campo `arquivo`, até 2 MB). Os pontos entram como rascunho, com `origem` `IMPORTACAO`. Resposta: `{ total, sucesso, falhas[{ linha, motivo }] }`. |
| POST | `/pontos` 🔒 | qualquer | Cria um ponto (rascunho), que só é publicado depois da moderação. Quem não é moderador nem administrador pode ter até 20 pontos em rascunho ou esperando revisão (`429` além disso; vale também ao corrigir um rejeitado, que volta ao rascunho). Limite: 30 cadastros e envios para aprovação por IP em 15 min. Se houver outro com o mesmo nome na cidade ou a menos de 150 m, responde `409` com `possiveisDuplicados`; reenvie com `confirmarDuplicidade: true` para confirmar. |
| GET | `/pontos/:id` | público | Detalhe. Pontos não publicados só aparecem para o responsável e a moderação. Para quem está logado inclui `salvo`. Traz também `origem`, `idOsm`, `sincronizadoEm`, `imagemCredito` e `imagemFonte` (ver o dicionário de dados); a busca e as recomendações trazem `imagemCredito`. |
| GET | `/pontos/:id/google` | público | O que o Google Maps sabe do ponto, consultado na hora e nunca gravado: `{ disponivel, horario, nota, totalAvaliacoes, telefone, site, urlGoogleMaps, acessibilidade, foto: { url, autor, urlAutor } }`. Sem `GOOGLE_MAPS_API_KEY` configurada, ou se o Google não conhecer o lugar, responde `{ disponivel: false }`. Guarda só o `place_id`. Limite: 60 consultas por IP em 15 min. |
| PUT | `/pontos/:id` 🔒 | dono/admin | Edita um rascunho ou rejeitado. `versaoEsperada` ativa o bloqueio otimista: se mudou, `409` com `pontoAtual`. |
| POST | `/pontos/:id/imagem` 🔒 | dono/admin | Envia a imagem (`multipart`, campo `imagem`; JPG/PNG/WebP até 5 MB; `413`/`415` com mensagem específica). Substitui a foto importada e apaga o crédito dela. O dono só troca a imagem de rascunhos e pontos rejeitados; em pontos publicados, apenas o admin. |
| POST | `/pontos/:id/publicar` 🔒 | dono/admin | Envia para aprovação. Exige nome, categoria, cidade, coordenadas e horário. Divide com o cadastro o limite de 30 por IP em 15 min. |
| POST | `/pontos/:id/aprovar` 🔒 | moderação | Publica. |
| POST | `/pontos/:id/rejeitar` 🔒 | moderação | Corpo: `motivo`. |
| GET | `/pontos/:id/sugestoes` 🔒 | dono/moderação | Sugestões de edição do ponto. |
| POST | `/pontos/:id/sugestoes` 🔒 | qualquer | Sugere uma correção: `camposPropostos` (`nome`, `descricao`, `categoria`, `cidade`, `endereco`, `faixaPreco`, `acessibilidade`, `siteOficial`, `telefoneContato`, `horarioFuncionamento`) e `mensagem?`. Aplicada na hora para o dono verificado ou usuário com reputação ≥ 5, ou quando duas pessoas diferentes propõem a mesma mudança; conteúdo suspeito fica retido. Limite: 20 contribuições/15 min. |
| POST | `/pontos/:id/solicitar-verificacao` 🔒 | dono (negócio ou gestor) | Pede o selo de verificado (`comprovacao?`). Quem cadastrou um lugar da comunidade com outro tipo de conta recebe `403`. |
| GET | `/pontos/:id/versoes` 🔒 | dono/moderação | Histórico de versões. |
| POST | `/pontos/:id/versoes/:versaoId/restaurar` 🔒 | dono/admin | Volta o ponto a uma versão anterior. |
| GET | `/pontos/:id/avaliacoes` | público | Avaliações aprovadas: `{ total, media, dados[] }`. |
| POST | `/pontos/:id/avaliacoes` 🔒 | qualquer | `nota` (1–5), `comentario?` e, opcionalmente, foto (`multipart`, campo `foto`). Uma avaliação por pessoa e ponto (`409`). Com foto ou texto suspeito, fica em análise (`retidaParaModeracao: true`). |

## Cidades — `/cidades`

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| GET | `/cidades/buscar?q=` | público | Municípios do Brasil pelo nome (Nominatim), cada um com `codigoIbge` (ou `null`), `pontos`, `disponivel` e o andamento do preparo. Sem o Nominatim (`semServidorDeMapas: true`), procura nos municípios do IBGE gravados no banco. Limite: 20/min por IP. |
| POST | `/cidades/perto` | público | Município cuja sede é a mais próxima das coordenadas. Corpo: `latitude`, `longitude` (o front arredonda para 2 casas). É `POST` para as coordenadas não irem na URL nem no log; nada é gravado. Resposta: `{ codigoIbge, cidade, uf, latitude, longitude }`; sede a mais de 50 km → `404` "Não encontramos um município do Brasil perto de você." |
| POST / GET | `/cidades/preparar` | 🔒 / público | Prepara uma cidade nova sob demanda (lugares do OpenStreetMap) e consulta o andamento. |

## Roteiros — `/roteiros` 🔒

**Participantes e papéis.** Um roteiro tem um dono e, opcionalmente, convidados: `EDITOR` (altera paradas, dias, custos, notas, checklist, dados do roteiro e restaura versões) e `LEITOR` (só consulta). Só o **dono** exclui o roteiro, ativa o link público e gerencia convidados. Quem não participa recebe `404` (como se o roteiro não existisse); quem participa sem permissão recebe `403`. Notas, orçamento e checklist são visíveis a todos os participantes, mas nunca no link público.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/roteiros/publico/:slug` (público) | Roteiro compartilhado por link, com `dia` e `deslocamento` em cada parada. |
| GET | `/roteiros` | Roteiros do usuário **e os compartilhados com ele**, cada um com `meuPapel` (`DONO`, `EDITOR` ou `LEITOR`), `usuario` (o dono) e `cidades` (as cidades das paradas, na ordem da viagem). |
| POST | `/roteiros/gerar` | Gera um roteiro sugerido: `cidade` **ou** `etapas: [{ cidade, dias }]` (até 6 cidades e 14 dias, como "Joinville, 2 dias → Blumenau, 1 dia"), `horasDisponiveis?` (por dia), `interesses?`, `dataHoraInicio?`, `latitude?`, `longitude?`. Resposta: `{ dias[], pontos[], avisos[], inicio, fallbackUsado }`; cada dia traz `cidade`, `inicio` e `viagem` (`{ de, metros, minutos }` quando a cidade muda; o tempo de estrada sai das horas do dia), e cada ponto traz `dia`, `chegadaEstimada`, `saidaEstimada`, `deslocamentoMin`, `esperaMin`, `duracaoVisitaMin`. Considera horário de funcionamento, distância, interesses e acessibilidade; varia as categorias (cada parada repetida da mesma categoria perde pontos) e, entre opções equivalentes, prefere pontos com foto e horário conhecidos. Os avisos de pontos fechados vêm ordenados pelos que mais combinavam com a pessoa. A cidade é reconhecida sem acento e com a UF ("Florianopolis", "Joinville, SC"); se ela não tiver pontos, `avisos` diz quais cidades existem. Localização a mais de 30 km dos pontos é ignorada (com aviso). Com a chave do Google, o horário dos pontos mais relevantes que não têm horário é consultado na hora (`GOOGLE_PONTOS_POR_ROTEIRO`, padrão 8) e esses pontos vêm com `horarioDoGoogle: true`. |
| POST | `/roteiros` | Cria. Aceita `pontos: [{ idPonto, dia?, observacao? }]` para gravar o roteiro e as paradas de uma só vez (`dia` de 1 a 30, padrão 1; `custoCentavos` opcional) e o bloco `viagemDeCarro` (ver "Viagem de carro" abaixo). |
| GET | `/roteiros/:id` | Detalhe com paradas, ordenadas por dia e, dentro do dia, pela ordem (a pernoite sempre por último). Uma parada é um ponto (`ponto`) ou uma atividade livre (`ponto: null` e `titulo`); cada uma traz `dia`, `periodo` (`MANHA`, `TARDE`, `NOITE`, `DIA_INTEIRO` ou `null`), `pernoite`, `custoCentavos` e `deslocamento` (`{ metros, minutos }` desde o último ponto com coordenadas do mesmo dia; até ~8 km em linha reta a 25 km/h, acima disso pela estrada; `null` na primeira de cada dia ou sem coordenadas). Traz também `cidades[]` e `viagensEntreDias[]` (`{ dia, de, para, metros, minutos }`, a estrada entre dias de cidades diferentes). Traz ainda `meuPapel`, `usuario` (dono), `colaboradores[]` (`{ idUsuario, nome, papel }`, sem e-mails), `notas`, `checklist[]` e `orcamento` (`{ totalCentavos, porDia, orcamentoCentavos, restanteCentavos, paradasSemCusto }`). |
| PUT | `/roteiros/:id` | Edita nome, descrição, cidade e datas. |
| DELETE | `/roteiros/:id` | Exclui. |
| PATCH | `/roteiros/:id/compartilhar` | Corpo: `publico`. Gera ou desativa o link público. |
| POST | `/roteiros/:id/itens` | Adiciona parada: `idPonto` (ponto cadastrado) **ou** `titulo` (atividade livre, como "Rolê pelo centro"), `dia?`, `periodo?`, `pernoite?` (onde dormir naquela noite: uma por dia, a nova substitui a anterior; o mesmo hotel pode valer para várias noites), `ordem?`, `observacao?`, `custoCentavos?`. Sem `dia`, entra no dia da última parada. Como visita, cada ponto entra uma vez só (`409`). |
| POST | `/roteiros/:id/itens/reordenar` | Corpo: `idsItensEmOrdem`. |
| PUT | `/roteiros/:id/itens/organizar` | Organiza o roteiro de uma vez. Corpo: `itens: [{ id, dia }]` com **todas** as paradas atuais, na ordem desejada; serve para mover uma parada de dia e reordenar. `204`. |
| PATCH | `/roteiros/:id/itens/:idItem` | Detalhes de uma parada: `observacao`, `custoCentavos`, `periodo`, `pernoite` e, só para atividades livres, `titulo` (`null` limpa; o que não vier não muda). `:idItem` é o `id` do item no roteiro. Não gera versão no histórico. |
| PATCH | `/roteiros/:id/anotacoes` | Notas livres (`notas`, até 5.000 caracteres) e teto de gastos (`orcamentoCentavos`) do roteiro; `null` limpa. Só o dono vê; não aparecem no link público. Não gera versão. |
| POST | `/roteiros/:id/checklist` | Novo item da checklist (`texto`, até 200 caracteres; máx. 100 itens, `409` além disso). |
| PATCH | `/roteiros/:id/checklist/:idItem` | Altera `texto` e/ou `feito`. |
| DELETE | `/roteiros/:id/checklist/:idItem` | Remove o item. |
| GET | `/roteiros/:id/convites` | Convites pendentes, com o e-mail de cada pessoa. **Dono.** |
| POST | `/roteiros/:id/convites` | Convida por e-mail. Corpo: `email`, `papel` (`EDITOR` ou `LEITOR`). **Dono.** Até 10 participantes + convites (`409` além disso); `409` se já há convite pendente ou a pessoa já participa; `400` se for o próprio dono. A pessoa é avisada no sino (se tiver conta) e por e-mail. O convite vale para a conta que usar aquele e-mail, inclusive uma criada depois. |
| DELETE | `/roteiros/:id/convites/:idConvite` | Cancela um convite pendente. **Dono.** |
| PATCH | `/roteiros/:id/colaboradores/:idUsuario` | Muda o papel de um participante (`papel`); vale na hora. **Dono.** |
| DELETE | `/roteiros/:id/colaboradores/:idUsuario` | Remove um participante. O dono remove qualquer um; cada participante pode remover a si mesmo (sair). |
| POST | `/roteiros/:id/otimizar` | Reordena as paradas para encurtar o percurso (vizinho mais próximo + 2-opt; a primeira parada de cada dia é a partida). Corpo: `dia?` (sem ele, todos os dias). Só grava, com uma versão no histórico, se algum dia melhorar. Resposta: `{ alterado, dias: [{ dia, alterado, metrosAntes, metrosDepois }] }`. |
| DELETE | `/roteiros/:id/paradas/:idItem` | Remove uma parada pelo `id` dela (vale para atividades e pernoites). |
| DELETE | `/roteiros/:id/itens/:idPonto` | Remove a parada de um ponto (mantida para compatibilidade). |
| GET | `/roteiros/:id/versoes` | Histórico de versões (RF26), com o nome de quem fez cada alteração (`autor`). |
| POST | `/roteiros/:id/versoes/:versaoId/restaurar` | Restaura uma versão (com os trechos e os campos da viagem de carro, quando a versão os tem). |

### Viagem de carro

Saindo de casa (ou de outro município), a estrada de cada perna — casa → 1ª cidade, entre as cidades e, com volta, última → casa — é dividida em dias com pernoite. O alvo é de `kmPorDia` (150 a 1.000; padrão 500) e, se informado, de `horasPorDia` ao volante (2 a 14; vale o que chegar primeiro). O pernoite é procurado entre alvo − 50 e alvo + 50 km a partir do pernoite anterior (faixa alargada para ± 100 quando não há hospedagem), em municípios a até 20 km da estrada, e as cidades são ordenadas por proximidade do alvo (40%), hospedagens (35%) e atrações (25%). Quando o fim da perna está perto (até 30% do alvo além da faixa), a perna traz `decisao` e o padrão é esticar e chegar. Se depois de um trecho curto sobram 2 horas de passeio, ele é descontado do dia na cidade; senão vira um dia só de estrada. A viagem inteira tem até 21 dias.

`POST /roteiros/gerar` aceita `etapas[].codigoIbge?` e o bloco:

```json
"viagemDeCarro": {
  "origem": 4209102, "kmPorDia": 500, "horasPorDia": 7, "comVolta": true,
  "consumoKmPorLitro": 12, "precoLitroCentavos": 629,
  "escolhas": [{ "perna": 0, "noite": 1, "codigoIbge": 3509502 }],
  "decisoes": [{ "perna": 0, "esticar": false }]
}
```

Sem `origem`, vale o município de casa (`400` "Informe de onde você sai." se não houver). A resposta ganha `viagemDeCarro: { origem, etapas[], kmPorDia, horasPorDia, comVolta, consumoKmPorLitro, precoLitroCentavos, pernas[], combustivel, avisos[] }`. Cada perna tem `perna`, `de`, `para`, `metros`, `segundos`, `decisao` (`{ esticar, metrosEsticando, metrosNoDiaSeguinte }` ou `null`) e `trechos[]` com `dia`, `noite` (nula no trecho que chega ao fim da perna), `de`, `para`, `metros`, `segundos`, `ocupaODia`, `noFimDoDia`, `litros`, `custoCentavos`, `tracado` (`[lat, lon][]`), `pernoite` e até 3 `alternativas` (cada cidade com `codigoIbge`, `cidade`, `uf`, `km`, `distanciaDoAlvoKm`, `totalHospedagens`, `totalAtracoes`, até 40 `hospedagens` e 5 `atracoes`). Com consumo e preço, `combustivel` traz `{ litros, custoCentavos }` da viagem; com só um deles, um aviso. `preparos` lista as cidades de destino com menos de 3 pontos para visitar, cujo preparo sob demanda a geração disparou (`{ cidade, uf, estado, pontos }`, com `pontos` os que a cidade já tem e `estado` `preparando`, `pronta` ou `ocupado`; `poucos` ou `erro` quando um preparo dos últimos 30 minutos já terminou assim e não é refeito), e os avisos dizem o que fazer. Erros: `422` sem estrada entre duas cidades, `503` quando o OSRM não responde e a rota não está no cache. Limite: 60 gerações com viagem de carro por IP em 15 min (as sem viagem não contam).

`POST /roteiros` aceita `viagemDeCarro` com as mesmas entradas (`origem`, `etapas: [{ codigoIbge, dias }]`, `horasDisponiveis`, `kmPorDia`, `comVolta`, ...) e `noites: [{ perna, noite, codigoIbge, idOsm? }]` (a cidade e o hotel de cada noite, como a pessoa viu; sem `idOsm`, "hotel a definir"). O servidor recalcula a viagem pelo cache: noites diferentes → `409` "A rota mudou desde a geração; gere de novo."; hotel fora das hospedagens da cidade → `400`. Grava os trechos, um pernoite por noite e coloca no catálogo as hospedagens das cidades de pernoite.

`GET /roteiros/:id` traz `viagemDeCarro` e `trechosDeEstrada[]`; em `viagensEntreDias`, os dias de estrada vêm com os km e o tempo reais (`estrada: true`; `noFimDoDia: true` na volta curta) e `orcamento.combustivelCentavos` soma o combustível. O link público traz os trechos sem consumo, preço, litros nem custo.

## Convites recebidos — `/convites` 🔒

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/convites` | Convites pendentes para o e-mail da conta: `{ total, dados[{ id, papel, roteiro, convidante }] }`. |
| POST | `/convites/:id/aceitar` | Aceita: a pessoa passa a participar com o papel do convite; o convidante é avisado. Resposta: `{ aceito, idRoteiro }`. |
| POST | `/convites/:id/recusar` | Recusa e apaga o convite; o convidante é avisado. |

## Pontos salvos (favoritos) — `/salvos` 🔒

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/salvos` | Pontos salvos (publicados), do mais recente ao mais antigo. |
| GET | `/salvos/ids` | Só os identificadores: `{ ids: number[] }`. |
| POST | `/salvos/:idPonto` | Salva (idempotente). |
| DELETE | `/salvos/:idPonto` | Remove (idempotente). |

## Notificações — `/notificacoes` 🔒

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/notificacoes` | `{ total, naoLidas, dados[] }`. |
| PATCH | `/notificacoes/:id/lida` | Marca uma como lida. |
| POST | `/notificacoes/marcar-todas-lidas` | Marca todas. |

## Moderação — `/sugestoes`, `/verificacoes`, `/avaliacoes` 🔒 (moderação)

Cada uma tem `GET /` (itens pendentes), `POST /:id/aprovar` e `POST /:id/rejeitar` (corpo: `motivo`). Aprovar uma sugestão aplica as mudanças ao ponto; aprovar uma verificação concede o selo; aprovar uma avaliação a publica e soma reputação ao autor.

## Administração — `/admin` 🔒

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| GET | `/admin/usuarios` | admin | Lista as contas. |
| PATCH | `/admin/usuarios/:id/papel` | admin | Corpo: `tipoConta`. Vale na hora; não se aplica à própria conta. |
| PATCH | `/admin/usuarios/:id/ativo` | admin | Corpo: `ativo`. Desativar derruba a sessão; não se aplica à própria conta. |
| GET | `/admin/auditoria?limite=` | admin | Log de auditoria (`limite` de 1 a 200, padrão 50). |
| GET | `/admin/metricas` | moderação | Totais, usuários ativos em 7 e 30 dias, pendências. |
| GET | `/admin/metricas/uso?dias=` | moderação | Série diária de uso (`busca`, `roteiro_gerado`, `roteiro_criado`, `cadastro`, `login`, `avaliacao`, `ponto_cadastrado`, `ponto_salvo`). |
| GET | `/admin/metricas/uso.csv?dias=` | moderação | A mesma série em CSV. |

## Arquivos enviados

Imagens ficam em `UPLOADS_DIR` e são servidas em `GET /uploads/<pasta>/<arquivo>` (somente leitura).
