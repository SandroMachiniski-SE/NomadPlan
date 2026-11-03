# Preparo automático do destino e lugares novos pela comunidade — especificação

Data: 02/11/2026 · Entrega do projeto: 20/11/2026 · Base: branch `feat/fontes-de-dados-e-multicidade`

## 1. Objetivo

1. Numa viagem de carro para uma cidade que ainda não tem pontos (ex.: Rio de Janeiro), o sistema já
   começa a preparar a cidade sozinho, em vez de só mostrar os dias de estrada e um aviso.
2. O OpenStreetMap tem poucos lugares em muitas cidades: qualquer pessoa com conta pode marcar no
   mapa da busca um lugar que não existe e cadastrá-lo, para os próximos planejamentos.

## 2. Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Destino sem pontos | O preparo sob demanda que já existe é disparado na geração; a tela mostra o andamento e "Gerar de novo" quando a cidade fica pronta. |
| Lugar novo | **Público com moderação**: o cadastro atual é aberto a todas as contas (inclusive visitante e morador). O lugar nasce rascunho, vai para revisão e só entra em roteiros depois de aprovado. |
| Onde marcar | **Só no mapa da busca** (Explorar): clicar num lugar vazio abre "Cadastrar um lugar aqui". O formulário continua com latitude e longitude, que já chegam preenchidas. |

## 3. Fora do escopo

- Mapa dentro do formulário e "cadastrar aqui" no mapa do roteiro.
- Lugares particulares (só do autor) e uso de um lugar em revisão nos roteiros do autor.
- Mudanças na moderação (continua como está, com a notificação de aprovação que já existe).

## 4. Preparo automático do destino

### 4.1 Backend

- `prepararDestinosSemPontos(etapas, idUsuario)` em `backend/src/lib/viagemDeCarro.ts`: para cada
  etapa da viagem de carro (município com nome, UF e sede) com menos de `PONTOS_PARA_CIDADE_PRONTA`
  pontos para visitar (`pontosDaCidade`), chama `prepararCidade(cidade, uf, latitude, longitude,
  idUsuario)` de `cidadesSobDemanda.ts`. Devolve `{ cidade, uf, estado }[]`, com `estado` igual a
  `preparando`, `pronta` ou `ocupado` (o limite de preparos simultâneos foi atingido).
- `POST /roteiros/gerar` com `viagemDeCarro` chama a função depois de planejar a viagem. A resposta
  ganha `viagemDeCarro.preparos` (lista acima; vazia quando todas as cidades têm pontos). Para cada
  cidade em preparo, o aviso do gerador "Ainda não há pontos cadastrados em …" é trocado por
  "Ainda não há pontos em {cidade}: começamos a preparar a cidade. Gere de novo em alguns minutos
  para ver os dias de passeio."; para `ocupado`, por "Ainda não há pontos em {cidade} e outras
  cidades estão sendo preparadas agora; tente de novo em alguns minutos.".
- Sem viagem de carro, nada muda (o gerador continua só avisando).

### 4.2 Front

- `GerarRoteiro.tsx`: para cada item de `viagemDeCarro.preparos` em `preparando`, consulta o
  andamento a cada 3 s (`consultarPreparoDaCidade`) e mostra "Preparando {cidade}… ({etapa})". Quando
  fica pronta, mostra "{cidade} está pronta." e o botão "Gerar de novo" (refaz a geração com as
  mesmas escolhas). Em erro, mostra a mensagem do preparo.

## 5. Lugares novos pela comunidade

### 5.1 Backend

- `POST /pontos` passa a aceitar qualquer conta autenticada (sai o `autorizar(...TIPOS_CADASTRADORES)`).
  O resto do fluxo não muda: rascunho → `POST /pontos/:id/publicar` (envia para revisão) → moderação.
- Limite contra abuso: quem não é moderador nem administrador pode ter no máximo **20** pontos em
  `RASCUNHO` ou `PENDENTE_VERIFICACAO`; o 21º recebe `429` "Você já tem 20 lugares esperando revisão.
  Aguarde a moderação ou apague um rascunho.".

### 5.2 Front

- `MapaPontos.tsx` (modo de exploração, quando há `aoBuscarNestaArea`): clicar num lugar vazio do
  mapa abre um balão na posição com o link "Cadastrar um lugar aqui" para
  `/pontos/novo?latitude={lat}&longitude={lon}` (6 casas); sem login, o balão diz "Entre para cadastrar
  um lugar" com link para `/login`. Novo prop `autenticado?: boolean` (o Home passa o do contexto).
- `PontoFormulario.tsx` (cadastro novo): lê `latitude` e `longitude` da URL, preenche os campos e,
  com a cidade vazia, preenche a cidade pelo município mais próximo (`cidadePerto`); mostra
  "Posição marcada no mapa; confira antes de salvar.". O aviso de duplicado (150 m) que já existe
  continua valendo.
- `Layout.tsx`: "Meus pontos" para todas as contas logadas.

## 6. Testes

- Integração: geração de carro para destino sem pontos dispara o preparo (`preparos` com
  `preparando`, aviso trocado, `GET /cidades/preparar` acompanha até `pronta` com o Overpass falso);
  destino com pontos não dispara nada; preparo ocupado dá `ocupado` e o outro aviso.
- Integração: visitante e morador cadastram (`201`; os testes que esperavam `403` mudam); o 21º
  rascunho dá `429`; moderador não tem limite.
- E2E (`13-lugar-novo-no-mapa.spec.ts`): visitante busca Joinville, clica num lugar vazio do mapa,
  "Cadastrar um lugar aqui", o formulário chega com a posição e "Joinville", salva e envia para
  revisão; o moderador aprova; o lugar aparece na busca. E2E da viagem: Joinville → Itajaí (rota
  sintética no cache, Itajaí sem pontos) mostra o aviso de preparo.
- O E2E passa a usar `OVERPASS_URL` inacessível, como já faz com o Nominatim e o OSRM.

## 7. Documentação

`docs/api.md` (quem cadastra, limite de 20, `viagemDeCarro.preparos`). O RFC precisa registrar que
visitante e morador passam a cadastrar pontos (com moderação) — está no PR do RFC da outra sessão.
