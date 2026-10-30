"""Substitui o texto-modelo das seções 8 a 13 do RFC.docx pelo conteúdo real do NomadPlan.

Uso: python rfc_preparar_figuras.py && python rfc_secoes_8_13.py [cobertura] [testes] [testes_e2e]
Depois: python rfc_capa_sumario.py && python rfc_para_pdf.py. Refaz as seções 8 a 13 a cada execução (pode rodar de novo sobre o RFC.docx já preenchido)."""
import copy
import re
import shutil
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

RAIZ = Path(__file__).resolve().parent
RFC = RAIZ.parents[1] / "RFC.docx"
FIGS = RAIZ / "rfc_figuras"
DIAG = RAIZ / "rfc_diagramas"
COBERTURA = sys.argv[1] if len(sys.argv) > 1 else "92%"
TESTES = sys.argv[2] if len(sys.argv) > 2 else "421"
TESTES_E2E = sys.argv[3] if len(sys.argv) > 3 else "74"

doc = Document(RFC)
ps = doc.paragraphs
ini = next(i for i, p in enumerate(ps) if p.text.strip().startswith("8 Mockups e Experi"))
fim = next(i for i, p in enumerate(ps) if re.match(r"#? ?14\.? Parecer", p.text.strip()))
ancora = ps[fim]._p  # novos blocos entram antes do parecer do comitê

# remove tudo entre o título 8 e a seção 14: o texto-modelo (ou o que uma execução anterior inseriu),
# incluindo tabelas e quebras de seção, que não aparecem em doc.paragraphs
elemento = ps[ini]._p
while elemento is not ancora:
    proximo = elemento.getnext()
    elemento.getparent().remove(elemento)
    elemento = proximo

corpo = doc.element.body
fig_n = [0]
tab_n = [0]


def _fonte(run, negrito=False, italico=False, tam=None, cor=None):
    run.font.name = "Arial"
    rpr = run._r.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    for a in ("w:ascii", "w:hAnsi", "w:cs"):
        rf.set(qn(a), "Arial")
    run.bold = negrito or None
    run.italic = italico or None
    if tam:
        run.font.size = Pt(tam)
    if cor:
        run.font.color.rgb = RGBColor.from_string(cor)


def _novo():
    p = doc.add_paragraph()
    ancora.addprevious(p._p)
    return p


def _runs(p, texto, negrito=False, italico=False, tam=None):
    """Aceita **negrito**, *itálico* e `código` no meio do texto."""
    for parte in re.split(r"(\*\*.+?\*\*|`.+?`|(?<![\w*])\*[^*\s][^*]*?\*(?![\w*]))", texto):
        if not parte:
            continue
        if parte.startswith("**"):
            _fonte(p.add_run(parte[2:-2]), True, italico, tam)
        elif parte.startswith("`"):
            r = p.add_run(parte[1:-1])
            _fonte(r, negrito, italico, (tam or 11) - 1)
            r.font.name = "Consolas"
            rf = r._r.get_or_add_rPr().find(qn("w:rFonts"))
            for a in ("w:ascii", "w:hAnsi", "w:cs"):
                rf.set(qn(a), "Consolas")
        elif parte.startswith("*"):
            _fonte(p.add_run(parte[1:-1]), negrito, True, tam)
        else:
            _fonte(p.add_run(parte), negrito, italico, tam)


def h1(texto):
    p = _novo()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    _runs(p, texto, negrito=True, tam=16)


def h2(texto):
    p = _novo()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    _runs(p, texto, negrito=True)


def h3(texto):
    p = _novo()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    _runs(p, texto, negrito=True, italico=False)


def par(texto, manter=False):
    p = _novo()
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = manter
    _runs(p, texto)
    return p


def lista(itens, num_id=4):
    for t in itens:
        p = _novo()
        p.paragraph_format.space_after = Pt(2)
        ppr = p._p.get_or_add_pPr()
        numpr = OxmlElement("w:numPr")
        il = OxmlElement("w:ilvl")
        il.set(qn("w:val"), "0")
        ni = OxmlElement("w:numId")
        ni.set(qn("w:val"), str(num_id))
        numpr.append(il)
        numpr.append(ni)
        ppr.append(numpr)
        _runs(p, t)
    esp = _novo()
    esp.paragraph_format.space_after = Pt(2)


def _sect(paisagem):
    """Cópia do sectPr final do documento, em retrato ou paisagem."""
    sp = copy.deepcopy(doc.sections[0]._sectPr)
    for filho in list(sp):
        if filho.tag == qn("w:type"):
            sp.remove(filho)
    pg = sp.find(qn("w:pgSz"))
    larg, alt = int(pg.get(qn("w:w"))), int(pg.get(qn("w:h")))
    if paisagem:
        pg.set(qn("w:w"), str(max(larg, alt)))
        pg.set(qn("w:h"), str(min(larg, alt)))
        pg.set(qn("w:orient"), "landscape")
    else:
        pg.set(qn("w:w"), str(min(larg, alt)))
        pg.set(qn("w:h"), str(max(larg, alt)))
        if pg.get(qn("w:orient")):
            del pg.attrib[qn("w:orient")]
    return sp


def _quebra_secao(paisagem):
    p = _novo()
    p.paragraph_format.space_after = Pt(0)
    p._p.get_or_add_pPr().append(_sect(paisagem))


def figura(arquivo, legenda, largura_cm=14.0, paisagem=False):
    fig_n[0] += 1
    if paisagem:
        from PIL import Image

        _quebra_secao(False)  # encerra a parte em retrato
        w, h = Image.open(arquivo).size
        largura_cm = min(23.6, 14.8 * w / h)
    p = _novo()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(6)
    p.add_run().add_picture(str(arquivo), width=Cm(largura_cm))
    c = _novo()
    c.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c.paragraph_format.space_after = Pt(10)
    _runs(c, f"Figura {fig_n[0]} — {legenda}", italico=True, tam=9)
    if paisagem:
        _quebra_secao(True)  # a página da figura fica em paisagem


def _borda(celula, cor="9AA5A8"):
    tcpr = celula._tc.get_or_add_tcPr()
    b = OxmlElement("w:tcBorders")
    for lado in ("top", "left", "bottom", "right"):
        e = OxmlElement(f"w:{lado}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "4")
        e.set(qn("w:color"), cor)
        b.append(e)
    tcpr.append(b)


def _fundo(celula, cor):
    tcpr = celula._tc.get_or_add_tcPr()
    s = OxmlElement("w:shd")
    s.set(qn("w:val"), "clear")
    s.set(qn("w:color"), "auto")
    s.set(qn("w:fill"), cor)
    tcpr.append(s)


def tabela(cabecalho, linhas, larguras_cm, legenda=None, tam=9):
    if legenda:
        tab_n[0] += 1
        c = _novo()
        c.paragraph_format.keep_with_next = True
        c.paragraph_format.space_before = Pt(6)
        _runs(c, f"Tabela {tab_n[0]} — {legenda}", italico=True, tam=9)
    t = doc.add_table(rows=1 + len(linhas), cols=len(cabecalho))
    ancora.addprevious(t._tbl)
    t.autofit = False
    tblpr = t._tbl.tblPr
    lay = OxmlElement("w:tblLayout")
    lay.set(qn("w:type"), "fixed")
    tblpr.append(lay)
    for r, dados in enumerate([cabecalho] + linhas):
        row = t.rows[r]
        trpr = row._tr.get_or_add_trPr()
        cant = OxmlElement("w:cantSplit")
        trpr.append(cant)
        if r == 0:
            th = OxmlElement("w:tblHeader")
            trpr.append(th)
        for j, texto in enumerate(dados):
            cel = row.cells[j]
            cel.width = Cm(larguras_cm[j])
            _borda(cel)
            if r == 0:
                _fundo(cel, "D6EAEC")
            p = cel.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            _runs(p, texto, negrito=(r == 0), tam=tam)
    esp = _novo()
    esp.paragraph_format.space_after = Pt(4)


# ============================================================ 8
h1("8 Mockups e Experiência do Usuário (UX)")
par(
    "As imagens desta seção são **capturas do sistema implementado**, não desenhos feitos antes do código: "
    "as telas foram prototipadas diretamente em React, sobre um conjunto de componentes e uma paleta próprios "
    "(verde-petróleo para ação principal, coral para destaque e confirmação). A interface é responsiva e funciona "
    "no computador e no celular. As telas de busca e de detalhe mostram **pontos reais**, importados do "
    "OpenStreetMap (seção 9.5); os roteiros e os nomes de usuários das demais telas são de demonstração, criados "
    "pelos testes de ponta a ponta."
)
par("Princípios de experiência que orientaram o desenho das telas:", manter=True)
lista(
    [
        "**Descoberta sem cadastro:** busca, mapa e detalhes de pontos são públicos; o login só é exigido para salvar, avaliar ou montar roteiros.",
        "**Feedback imediato:** mensagens de sucesso e de erro em português, estados de carregamento e confirmação antes de ações destrutivas.",
        "**Um caminho principal curto:** da busca ao roteiro organizado em quatro passos (seção 8.3).",
        "**Funcionalidades por papel:** cada perfil (visitante, morador, negócio, gestor, moderador, administrador) só vê os menus que pode usar.",
        "**Acessibilidade e privacidade como dado de primeira classe:** o perfil guarda necessidades de acessibilidade, e a LGPD é tratada no próprio Perfil.",
    ]
)

h2("8.1 Fluxo de Navegação")
par(
    "O diagrama abaixo mostra como a pessoa navega entre as telas. Ele está organizado em três faixas: o que qualquer "
    "visitante acessa sem login; o que fica disponível após o login; e as áreas reservadas a negócios, gestores, "
    "moderadores e administradores. As setas tracejadas indicam o compartilhamento de um roteiro por link público."
)
figura(DIAG / "fluxo_navegacao.png", "Fluxo de navegação do NomadPlan, por tipo de acesso.", paisagem=True)

h2("8.2 Wireframes ou Mockups das Telas")
par(
    "Para cada tela estão a imagem, a funcionalidade e as principais ações do usuário. A numeração entre parênteses "
    "indica os requisitos funcionais da seção 6.3 atendidos."
)

h3("Tela inicial e busca (RF08, RF09)")
par(
    "Página de entrada do sistema. Reúne a busca por cidade e termo, os atalhos por categoria, a opção de filtros "
    "adicionais e a alternância entre lista e mapa. Para quem está logado, exibe recomendações calculadas a partir "
    "dos interesses declarados e do que usuários de gosto parecido salvaram."
)
lista(
    [
        "Buscar por cidade, nome ou descrição e filtrar por categoria, faixa de preço, acessibilidade, nota, horário (“aberto agora”) e distância.",
        "Alternar entre **Lista** e **Mapa** e salvar um ponto nos favoritos pelo coração do cartão.",
        "Abrir o detalhe de um ponto.",
    ]
)
figura(FIGS / "busca.png", "Tela inicial com busca, categorias, recomendações e resultados.", 10.0)

h3("Tela inicial no celular (RNF, uso em dispositivos móveis)")
par("A mesma página em tela de 390 px de largura: os campos empilham e o menu colapsa, mantendo todas as funções.")
figura(FIGS / "celular.png", "Versão para celular da tela inicial.", 5.2)

h3("Detalhe do ponto turístico (RF10, RF05)")
par(
    "Ficha completa do ponto: imagem, categoria, selo de verificação (quando concedido), endereço, horário, faixa de "
    "preço, acessibilidade, mapa com o local e avaliações de outros usuários. Nos pontos importados, a ficha mostra o "
    "crédito da foto (autor e licença) e a fonte dos dados, e convida quem está logado a informar o que falta, como o horário."
)
lista(
    [
        "Ver a localização no mapa e abrir a rota (“Como chegar”).",
        "Quando logado: salvar nos favoritos, adicionar a um roteiro, avaliar com nota e comentário e **sugerir edição** de dados desatualizados.",
    ]
)
figura(FIGS / "ponto.png", "Detalhe de um ponto turístico importado do OpenStreetMap, com foto do Wikimedia Commons e mapa.", 10.0)

h3("Entrar (RF02)")
par(
    "Formulário de e-mail e senha, com link para recuperação de senha (um e-mail com link de uso único e 15 minutos "
    "de validade) e para o cadastro. Se a conta tem verificação em duas etapas, o sistema pede em seguida o código de 6 dígitos."
)
figura(FIGS / "login.png", "Tela de login.", 11.5)

h3("Criar conta (RF01)")
par(
    "Cadastro com nome, e-mail, senha (mínimo de 8 caracteres), cidade base opcional e o tipo de uso — visitante/turista, "
    "morador, negócio turístico ou gestor/pesquisador. O cadastro só é concluído com o **aceite da Política de Privacidade** (LGPD)."
)
figura(FIGS / "registrar.png", "Tela de cadastro.", 9.5)

h3("Roteiro por dia (RF11, RF13)")
par(
    "Tela central do planejamento. Mostra o roteiro dividido por dia, com o mapa de cada dia, o tempo e a distância "
    "estimados entre as paradas e o custo previsto. As paradas podem ser reordenadas, movidas entre dias, removidas, ou "
    "reorganizadas automaticamente pelo botão **Otimizar ordem**, que calcula um trajeto curto entre os pontos do dia."
)
lista(
    [
        "Alternar o mapa entre todos os dias ou um dia específico.",
        "Adicionar pontos, escolher o dia e anotar custo e observação por parada.",
        "Compartilhar o roteiro por link público (somente leitura) ou revisar o histórico de versões.",
    ]
)
figura(FIGS / "roteiro.png", "Roteiro de dois dias com mapa, paradas e tempos de deslocamento.", 9.8)

h3("Orçamento, checklist e notas (RF11)")
par(
    "Abaixo do roteiro, três cartões ajudam a preparar a viagem: o **orçamento** soma os custos informados por dia e "
    "compara com um teto opcional; o **checklist** guarda tarefas como “reservar hotel”; as **notas** ficam visíveis "
    "apenas para quem participa do roteiro (não aparecem no link público)."
)
figura(FIGS / "planejamento.png", "Orçamento, checklist e notas da viagem.", 14.5)

h3("Roteiro colaborativo e convites (RF13)")
par(
    "O dono convida pessoas por e-mail, escolhendo o papel: **editor** (altera paradas, dias e orçamento) ou **leitor** "
    "(apenas acompanha). Enquanto o convite não é aceito, ele aparece como pendente e pode ser cancelado. Quem recebe o "
    "convite o encontra na tela *Convites*, onde aceita ou recusa."
)
figura(FIGS / "colaboracao.png", "Seção “Quem participa” de um roteiro, com convite pendente.", 14.0)
figura(FIGS / "convite.png", "Convites recebidos, com as ações Aceitar e Recusar.", 11.0)

h3("Gerar roteiro sugerido (RF12)")
par(
    "O usuário informa a cidade, o tempo disponível, o horário de início, um ponto de partida (opcionalmente a "
    "localização atual) e seus interesses. O motor de recomendação monta uma sequência de visitas que respeita o "
    "horário de funcionamento de cada local e a distância entre eles, e o resultado pode ser salvo como roteiro."
)
figura(FIGS / "gerar.png", "Geração de um roteiro sugerido, com horários de cada visita.", 10.0)

h3("Cadastro de ponto turístico (RF04)")
par(
    "Formulário usado por negócios, gestores e moderadores para cadastrar e editar pontos: informações básicas, "
    "localização por latitude e longitude, horário de funcionamento, faixa de preço, acessibilidade, contatos e imagem. "
    "O ponto é salvo como rascunho e **enviado para publicação**, passando pela moderação."
)
figura(FIGS / "cadastro_ponto.png", "Formulário de cadastro e edição de ponto.", 10.0)

h3("Ferramentas de inventário (RF04)")
par(
    "Exportação do inventário em CSV ou GeoJSON e importação em lote (até 2 MB) a partir de modelos oferecidos pelo "
    "próprio sistema. Os pontos importados entram como rascunho e seguem o fluxo normal de publicação; há uma opção para "
    "ignorar a detecção de duplicados."
)
figura(FIGS / "ferramentas.png", "Exportação e importação de pontos em CSV e GeoJSON.", 11.5)

h3("Moderação (RF06, RF07)")
par(
    "Painel do moderador, com a fila de pontos aguardando publicação, sugestões de edição (mostrando o campo alterado), "
    "solicitações de selo verificado e avaliações pendentes."
)
lista(["Aprovar ou rejeitar cada item; ao rejeitar, o motivo é registrado e o autor é notificado."])
figura(FIGS / "moderacao.png", "Painel de moderação.", 10.5)

h3("Administração (RF20)")
par(
    "Métricas de uso (usuários, pontos, roteiros, avaliações), gráfico de uso diário com exportação em CSV, gestão de "
    "usuários e papéis (alterar papel, desativar conta) e consulta ao log de auditoria."
)
figura(FIGS / "admin.png", "Painel administrativo com métricas e gestão de usuários.", 10.0)

h3("Perfil, preferências e privacidade (RF03)")
par(
    "O usuário edita nome, cidade, idioma, interesses e necessidades de acessibilidade, ativa a **verificação em duas "
    "etapas** lendo um QR code no aplicativo autenticador e, na parte inferior, baixa seus dados em JSON ou "
    "anonimiza a própria conta (seção 10.1)."
)
figura(FIGS / "perfil.png", "Perfil, preferências e verificação em duas etapas.", 10.0)

h2("8.3 Fluxo de Interação do Usuário")
par(
    "O fluxo mais importante do sistema leva uma pessoa de turismo da entrada no sistema a um roteiro organizado por dia. "
    "A sequência abaixo resume as telas percorridas:"
)
lista(
    [
        "**Entrar** — a pessoa cria uma conta ou entra com e-mail e senha (e código de 2 etapas, se ativado).",
        "**Buscar e filtrar** — escolhe a cidade, aplica categorias e filtros e alterna entre lista e mapa.",
        "**Ver o ponto e adicionar ao roteiro** — abre a ficha do local, confere horário, mapa e avaliações e adiciona o ponto a um roteiro novo ou existente.",
        "**Organizar o roteiro** — distribui as paradas pelos dias, ajusta a ordem (manualmente ou pela otimização), confere tempos e custos e, se quiser, compartilha por link ou convida colaboradores.",
    ],
    num_id=4,
)
figura(FIGS / "sequencia_fluxo.png", "Sequência de telas do fluxo principal: entrar, buscar, ver o ponto e organizar o roteiro.", 15.0)
par(
    "Alternativa de atalho: na tela **Gerar roteiro**, o usuário informa cidade, tempo e interesses e recebe um roteiro "
    "pronto, que pode ser salvo e depois ajustado na mesma tela de organização."
)

h2("8.4 Feedback Inicial de Usuários (Opcional)")
par(
    "Até a entrega do RFC não houve pesquisa formal de usabilidade com usuários externos; por isso esta subseção não "
    f"apresenta depoimentos. A validação das telas foi feita de duas formas: (i) **{TESTES_E2E} testes de ponta a ponta** em "
    "navegador real, que percorrem os fluxos descritos nesta seção (cadastro, busca, moderação, roteiros por dia, "
    "planejamento, colaboração, dados importados, perfil e administração) e conferem as mensagens exibidas; e (ii) revisões internas "
    "da equipe a cada módulo entregue. A apresentação final será usada para coletar comentários da banca e de "
    "convidados, que alimentarão a próxima iteração."
)

# ============================================================ 9
h1("9 Arquitetura do Sistema")
par(
    "Esta seção descreve como o sistema foi construído: contexto, containers e componentes (modelo C4), modelo de "
    "dados, módulos principais e as tecnologias escolhidas."
)

h2("9.1 Diagrama C4")
h3("Nível 1 — Diagrama de Contexto")
par(
    "O NomadPlan é uma plataforma web única, usada por seis perfis de pessoas: visitante/turista, morador, negócio/gestor "
    "de pontos, gestor de turismo, moderador e administrador. Ele depende de quatro sistemas externos: um **servidor "
    "SMTP** (e-mails de recuperação de senha e de convites); o **OpenStreetMap**, que fornece as imagens do mapa, "
    "carregadas direto pelo navegador, e a base aberta de onde vêm os pontos turísticos, baixada pela Overpass API; o "
    "**Wikimedia Commons**, de onde vêm as fotos dos pontos importados; e um **aplicativo autenticador** do próprio "
    "usuário, que gera os códigos TOTP da verificação em duas etapas."
)
figura(DIAG / "c4_contexto.png", "Diagrama de contexto (C4, nível 1).", paisagem=True)

h3("Nível 2 — Diagrama de Containers")
par(
    "Dentro do sistema há quatro containers: a **aplicação web** (SPA em React, entregue como arquivos estáticos), a "
    "**API REST** (Node.js/Express), o **banco de dados** (PostgreSQL com a extensão PostGIS) e a pasta de **arquivos "
    "enviados** (imagens de pontos e fotos de avaliações), servida pela própria API em modo somente leitura. O navegador "
    "fala com a API em JSON sobre HTTPS, com o token de sessão (JWT) no cabeçalho; a API acessa o banco por SQL via Prisma."
)
figura(DIAG / "c4_containers.png", "Diagrama de containers (C4, nível 2).", paisagem=True)

h3("Nível 3 — Diagrama de Componentes (API REST)")
par(
    "A API é organizada em três camadas. Todo pedido atravessa os **middlewares** (cabeçalhos de segurança e CORS, "
    "autenticação conferida no banco, autorização por papel, limites de taxa, acesso ao roteiro por papel de participante e "
    "validação de upload pelo conteúdo do arquivo). Em seguida, as **rotas** tratam cada área funcional. As regras de "
    "negócio ficam em **serviços** reutilizáveis (`src/lib`), independentes do Express e cobertos por testes unitários; só "
    "eles e as rotas conversam com o Prisma Client."
)
figura(DIAG / "c4_componentes.png", "Componentes da API REST (C4, nível 3).", paisagem=True)

h2("9.2 Modelo de Dados")
par(
    "O banco tem **16 tabelas**. As entidades centrais são o `usuario`, o `ponto_turistico` (com uma coluna geográfica "
    "`geom`, gerada a partir de latitude e longitude e indexada por GiST, usada nas buscas por raio) e o `roteiro`, que se "
    "liga aos pontos pelos `item_roteiro` (dia, ordem, custo e observação). Em volta delas ficam as tabelas de "
    "participação social (`avaliacao`, `sugestao_edicao`, `solicitacao_verificacao`, `ponto_salvo`), de colaboração "
    "(`colaborador_roteiro`, `convite_roteiro`), de planejamento (`item_checklist`), de histórico (`versao_ponto`, "
    "`versao_roteiro`) e de governança (`notificacao`, `log_auditoria`, `metrica_diaria`). O esquema é versionado em "
    "13 migrações SQL escritas à mão; o dicionário de dados completo está em `docs/dicionario-de-dados.md`."
)
figura(DIAG / "modelo_de_dados.png", "Diagrama entidade-relacionamento (DER) do NomadPlan.", paisagem=True)
par("Principais decisões de modelagem:", manter=True)
lista(
    [
        "**Bloqueio otimista:** `ponto_turistico.versao` impede que duas edições simultâneas se sobrescrevam.",
        "**Avaliação única:** índice único em (usuário, ponto) garante uma avaliação por pessoa por local.",
        "**Histórico:** edições aprovadas e mudanças de roteiro geram versões consultáveis e restauráveis.",
        "**Anonimização em vez de exclusão:** a linha do usuário é mantida sem dados pessoais para preservar o histórico (seção 10.1).",
        "**Origem de cada ponto (RNF19):** `ponto_turistico.origem` registra se o ponto veio do cadastro de um usuário, de um arquivo importado ou da API do OpenStreetMap, e `id_osm` liga o ponto ao elemento original, o que impede duplicar numa nova importação. Com a data de criação, a de atualização, a versão e o histórico, cada registro é rastreável.",
    ]
)

h2("9.3 Principais Componentes")
tabela(
    ["Componente", "Responsabilidade"],
    [
        ["Aplicação web (SPA)", "Telas em React 19 e TypeScript, rotas protegidas por papel, mapas com Leaflet, estado de sessão e de favoritos em contexto."],
        ["Autenticação e contas", "Cadastro, login com bloqueio por tentativas, token JWT conferido no banco a cada requisição, renovação de sessão, recuperação de senha e verificação em duas etapas (TOTP, RFC 6238)."],
        ["Pontos turísticos", "Cadastro com moderação, edição com bloqueio otimista, selo de verificação, importação e exportação CSV/GeoJSON, upload de imagens validado pelo conteúdo e importação do OpenStreetMap, com fotos do Wikimedia Commons e a origem de cada ponto registrada."],
        ["Busca", "Consulta única em SQL com filtros (categoria, preço, acessibilidade, nota, “aberto agora”, distância), ordenação, limite de tempo e resposta em cache quando a consulta demora (AF02)."],
        ["Recomendação e roteiros", "Planejador que monta o dia respeitando horários e distâncias, otimização do trajeto (vizinho mais próximo seguido de 2-opt), recomendações por similaridade entre usuários, orçamento e checklist."],
        ["Colaboração", "Convites por e-mail, papéis de dono, editor e leitor, conferidos por middleware antes de qualquer rota do roteiro."],
        ["Moderação e governança", "Fila de pontos, sugestões, selos e avaliações; reputação do usuário; retenção automática de conteúdo suspeito; notificações."],
        ["Privacidade (LGPD)", "Aceite da política, exportação dos dados do usuário e anonimização da conta."],
        ["Auditoria e métricas", "Log de ações sensíveis, alerta de possível força bruta aos administradores e métricas diárias de uso gravadas em lote."],
        ["Persistência", "PostgreSQL 16 com PostGIS, acesso via Prisma 6 e SQL parametrizado para consultas geográficas."],
    ],
    [4.2, 10.8],
    legenda="Principais componentes e responsabilidades.",
)

h2("9.4 Stack Tecnológica")
tabela(
    ["Tecnologia", "Uso", "Por que foi escolhida"],
    [
        ["Node.js 22 + Express 4", "API REST", "Ecossistema único (TypeScript) no servidor e no navegador; bom desempenho em operações de E/S; o relatório de carga (seção 11) mostrou 100 usuários simultâneos sem nenhum erro em um único processo."],
        ["TypeScript", "Backend e frontend", "Tipagem estática reduz erros de contrato entre telas e API e facilita refatorar."],
        ["PostgreSQL 16 + PostGIS", "Banco de dados", "Consultas geográficas (raio, distância) com índice espacial, integridade relacional e transações; evita servir mapas e buscas por proximidade em memória."],
        ["Prisma 6", "Acesso ao banco", "Consultas tipadas e parametrizadas (proteção contra injeção de SQL); migrações versionadas, mantidas em SQL por causa da coluna geográfica gerada."],
        ["Zod", "Validação de entrada", "Esquemas declarativos validam tipos, tamanhos e listas em toda rota, com mensagens de erro claras."],
        ["JWT + bcrypt + TOTP", "Autenticação", "Sessão sem estado no servidor (escala por instâncias), senhas com hash lento e verificação em duas etapas aberta (RFC 6238), sem depender de serviço externo."],
        ["helmet, CORS, rate limit", "Proteção da API", "Cabeçalhos de segurança, origem restrita ao frontend e limite de tentativas por IP e por conta."],
        ["React 19 + Vite + React Router", "Aplicação web", "Componentização, carregamento sob demanda por rota e desenvolvimento rápido; SPA entregue como arquivos estáticos simples de hospedar."],
        ["Leaflet + OpenStreetMap", "Mapas", "Biblioteca leve e livre, sem chave de API nem custo por uso."],
        ["OpenStreetMap (Overpass API) + Wikimedia Commons", "Dados dos pontos", "Base aberta e gratuita que pode ser guardada no próprio banco, com atribuição (licença ODbL), ao contrário de serviços pagos como o Google Places, cujos termos não permitem isso; as fotos têm licenças livres, e o autor e a licença aparecem junto de cada uma."],
        ["Docker Compose", "Ambiente", "Sobe o banco com PostGIS em um comando e torna o ambiente reproduzível entre as máquinas da equipe."],
        ["node:test, Playwright e GitHub Actions", "Testes e CI", f"{TESTES} testes automatizados no backend (unitários e de integração, cobertura de linhas de {COBERTURA}), {TESTES_E2E} testes de ponta a ponta em navegador real e pipeline de integração contínua a cada alteração."],
    ],
    [3.6, 3.0, 8.4],
    legenda="Tecnologias utilizadas e justificativas.",
)

h2("9.5 Origem dos Dados")
par(
    "Os pontos turísticos da demonstração são reais: **2.025 lugares de Joinville, Florianópolis e Blumenau** vindos do "
    "**OpenStreetMap**, uma base aberta mantida por voluntários, que pode ser guardada e reutilizada desde que se dê o "
    "crédito (licença ODbL). Um script (`npm run osm:baixar`) faz uma consulta à Overpass API por cidade, escolhe os "
    "lugares de interesse turístico, como museus, patrimônio histórico, mirantes, praias, parques, restaurantes, cafés, "
    "hotéis e shoppings, classifica cada um nas sete categorias do sistema e converte endereço, telefone, site e "
    "acessibilidade. Ficam de fora lanchonetes de rede, praças de bairro e residências. O script também busca no "
    "Wikidata e no **Wikimedia Commons** as fotos e descrições curtas, com autor e licença. O resultado fica salvo no "
    "repositório, e assim o seed e os testes não dependem de um serviço externo."
)
par(
    "O horário de funcionamento no OpenStreetMap tem sintaxe própria (por exemplo, `Mo-Fr 09:00-18:00; Sa 09:00-13:00`) "
    "e é convertido para o formato do sistema (`Seg-Sex 9h-18h; Sáb 9h-13h`). Foram convertidos 94% dos horários "
    "encontrados; os demais usam recursos raros, como variação por mês, e ficam como não informados para não gerar um "
    "horário errado. Uma nova importação não duplica pontos e só preenche campos vazios, sem nunca sobrescrever o que a "
    "comunidade editou. Um ponto rejeitado pela moderação também não volta."
)
par(
    "A base aberta é boa em nomes, localização e categorias, mas tem poucos horários (370 dos 2.025 pontos, 18%) e "
    "quase nenhuma informação de acessibilidade. É essa lacuna que a parte colaborativa do NomadPlan preenche: a ficha "
    "do ponto mostra a fonte dos dados e convida quem está logado a informar o que falta, e as sugestões passam pelas "
    "regras de reputação e moderação (seção 6.5). Os 370 pontos com todos os campos obrigatórios, inclusive o horário, "
    "superam a meta de cobertura mínima de 100 pontos (seção 5.3)."
)

# ============================================================ 10
h1("10 Segurança e Privacidade")
par(
    "Os controles de segurança foram organizados segundo o OWASP Top 10 (2021). O documento completo, com os riscos "
    "aceitos de forma consciente para o escopo acadêmico, está em `docs/seguranca.md`."
)
tabela(
    ["Categoria OWASP", "Como o NomadPlan trata"],
    [
        ["A01 Controle de acesso", "Cada rota declara o papel mínimo; nos roteiros, um middleware confere se a pessoa participa e se o papel (dono, editor, leitor) basta. O token é conferido no banco a cada requisição: conta desativada ou rebaixada perde o acesso na hora. Recursos pessoais são sempre filtrados pelo usuário logado."],
        ["A02 Falhas criptográficas", "Senhas com bcrypt; segredo do 2FA cifrado com AES-256-GCM; JWT assinado, e a API recusa iniciar em produção com segredo curto ou de exemplo; link de redefinição de senha de uso único e 15 minutos."],
        ["A03 Injeção", "Acesso ao banco por Prisma e SQL parametrizado; caracteres curinga das buscas escapados; entradas validadas com Zod; o React escapa o conteúdo exibido e não há HTML injetado."],
        ["A04 Projeto inseguro", "Limites de taxa por IP e por conta; moderação obrigatória para publicar; filtro de conteúdo suspeito; bloqueio otimista contra edições simultâneas; avaliação única garantida por índice no banco."],
        ["A05 Configuração incorreta", "helmet, CORS restrito, corpo JSON limitado, erros internos com mensagem genérica, `.env` fora do repositório e imagens servidas somente leitura."],
        ["A06 Componentes vulneráveis", "`npm audit` sem vulnerabilidades no frontend e nos testes; no backend restam apenas alertas documentados em ferramenta de linha de comando; versões travadas por lockfile e CI com `npm ci`."],
        ["A07 Identificação e autenticação", "Bloqueio após 3 senhas erradas por conta e 10 por IP em 15 minutos, com alerta aos administradores; 2FA com proteção contra reutilização do código; tempo de resposta do login igual para e-mails existentes e inexistentes."],
        ["A08 Integridade", "Uploads validados pelo conteúdo (assinatura do arquivo), com limites de 5 MB (imagens) e 2 MB (importações)."],
        ["A09 Registro e monitoramento", "Log de auditoria de ações sensíveis (login, falhas, mudança de papel, importação, moderação); o e-mail digitado em tentativas falhas não é gravado; alerta de força bruta."],
        ["A10 SSRF", "O servidor nunca busca URLs informadas por usuários; o site oficial de um ponto é apenas armazenado e exibido como link. Só o script de importação do OpenStreetMap acessa a internet, e apenas endereços fixos."],
    ],
    [4.0, 11.0],
    legenda="Controles de segurança por categoria do OWASP Top 10.",
    tam=8.5,
)
par(
    "**Riscos aceitos e recomendações para produção:** token de sessão no `localStorage` (recomenda-se cookie `HttpOnly` "
    "com proteção CSRF e Content-Security-Policy); limite de taxa em memória por instância (usar Redis com várias "
    "instâncias); TLS delegado a um proxy reverso; 2FA sem códigos de recuperação; e e-mail não verificado no cadastro. "
    "Todos estão listados com mitigação atual em `docs/seguranca.md`."
)

h2("10.1 Privacidade e LGPD")
par("**Dados coletados.** Nome, e-mail, cidade base, idioma, interesses, necessidades de acessibilidade e, opcionalmente, "
    "fotos enviadas em avaliações. O endereço IP de tentativas de login falhas fica no log de auditoria por segurança. A "
    "localização usada em buscas “perto de mim” não é gravada.")
par("**Como são armazenados.** No PostgreSQL; senhas somente como hash bcrypt; o segredo do 2FA cifrado; o e-mail nunca é "
    "exibido a outros usuários. O acesso é restrito por papel e as ações administrativas são registradas em auditoria.")
par("**Direitos do titular, exercidos pelo próprio Perfil:**", manter=True)
lista(
    [
        "**Consentimento:** aceite explícito da Política de Privacidade (`/privacidade`) no cadastro, registrado com data; contas antigas veem um aviso até aceitarem.",
        "**Portabilidade e acesso:** botão “Baixar meus dados” gera um arquivo JSON com todos os dados do usuário.",
        "**Exclusão:** o usuário anonimiza a conta confirmando a senha (e o código do 2FA, se ativo). Nome e e-mail são trocados por valores neutros, roteiros, favoritos, notificações e fotos são apagados, rascunhos e pontos rejeitados são removidos e o IP é apagado do log. Pontos já publicados permanecem no inventário, sem responsável.",
        "**Minimização:** só se coleta o necessário; o cadastro exige apenas nome, e-mail e senha.",
    ]
)

# ============================================================ 11
h1("11 Planejamento do Projeto")
par(
    "O projeto seguiu entregas incrementais por módulo, publicadas por pull requests no repositório. A tabela registra "
    "os marcos cumpridos e o que falta até a entrega final, em 05/11/2026."
)
tabela(
    ["Marco", "Descrição", "Prazo"],
    [
        ["M1", "Definição do problema, requisitos e protótipo inicial; primeira versão do RFC (entrega N1) e identidade visual", "Abril/2026 (até 12/04)"],
        ["M2", "Estrutura do sistema (backend, frontend, banco com PostGIS e Docker) e roteiros básicos", "27/08 a 02/09/2026"],
        ["M3", "Módulos 1 a 5: autenticação e perfis, pontos com moderação, busca por proximidade e mapa, recomendação e roteiros completos, social e governança", "09 a 10/09/2026"],
        ["M4", "Endurecimento e identidade visual: limite de tentativas de login, correção do histórico de credenciais, redesenho da interface com a marca NomadPlan, recuperação de senha por e-mail e ajustes a partir das revisões dos colegas", "15 a 20/09/2026"],
        ["M5", "Conformidade com o RFC: 2FA, bloqueio de login, LGPD, validação de upload, importação, busca unificada, roteiros por dia, orçamento, checklist, versões e roteiro colaborativo; testes de integração, de ponta a ponta e de carga; CI e backup", "26 a 27/10/2026"],
        ["M6", "Dados reais: importação de cerca de 2 mil pontos do OpenStreetMap (Joinville, Florianópolis e Blumenau) com fotos do Wikimedia Commons, conversão de horários e registro da origem de cada ponto (RNF19)", "27 a 28/10/2026"],
        ["M7", "Finalização do RFC (seções 8 a 13), nomenclatura NomadPlan, revisão geral e ensaio da demonstração", "até 04/11/2026"],
        ["Entrega", "Entrega final e apresentação (02/11 é feriado)", "05/11/2026"],
    ],
    [2.0, 9.5, 3.5],
    legenda="Marcos do projeto.",
)
par(
    "**Verificação da qualidade antes da entrega.** O backend tem "
    f"{TESTES} testes automatizados (unitários e de integração, contra um banco de testes real), com cobertura de linhas "
    f"de {COBERTURA}; o frontend é validado por lint e build; e {TESTES_E2E} testes de ponta a ponta rodam em navegador real. "
    "O teste de carga com 100 usuários simultâneos (26/10/2026, um único processo da API, base sintética de 5.113 pontos) não registrou "
    "nenhum erro: a latência média das buscas ficou entre 9 e 18 ms em uso normal e abaixo de 150 ms mesmo sem pausa "
    "entre as requisições, e a geração de roteiro ficou em 0,5 s de média com a base grande — dentro das metas RNF01, "
    "RNF02 e RNF04 (detalhes em `docs/relatorio-de-carga.md`)."
)

# ============================================================ 12
h1("12 Referências")
h3("Documentação técnica e padrões")
lista(
    [
        "OWASP. *OWASP Top 10:2021*. https://owasp.org/Top10/",
        "BRASIL. *Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD)*. http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
        "M'RAIHI, D. et al. *RFC 6238 — TOTP: Time-Based One-Time Password Algorithm*. IETF, 2011. https://datatracker.ietf.org/doc/html/rfc6238",
        "BROWN, S. *The C4 model for visualising software architecture*. https://c4model.com/",
        "NIST. *SP 800-63B — Digital Identity Guidelines: Authentication and Lifecycle Management*. https://pages.nist.gov/800-63-3/sp800-63b.html",
        "PostGIS. *PostGIS Documentation*. https://postgis.net/documentation/",
        "OpenStreetMap Foundation. *OpenStreetMap* e política de uso de tiles. https://www.openstreetmap.org/",
        "OpenStreetMap Foundation. *Copyright and License* (Open Database License e atribuição). https://www.openstreetmap.org/copyright",
        "OpenStreetMap Wiki. *Overpass API*. https://wiki.openstreetmap.org/wiki/Overpass_API",
        "OpenStreetMap Wiki. *Key:opening_hours* (especificação do horário de funcionamento). https://wiki.openstreetmap.org/wiki/Key:opening_hours",
        "Wikimedia Commons. *Reusing content outside Wikimedia*. https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
    ]
)
h3("Ferramentas e bibliotecas")
lista(
    [
        "Node.js, Express, TypeScript, Prisma, Zod, bcryptjs, jsonwebtoken, helmet, multer e nodemailer (backend).",
        "React, Vite, React Router, Axios e Leaflet (frontend).",
        "PostgreSQL e PostGIS; Docker e Docker Compose.",
        "node:test, tsx e Playwright (testes); GitHub Actions (integração contínua).",
    ]
)
h3("Repositório e documentação do projeto")
lista(
    [
        "Repositório: https://github.com/SandroMachiniski-SE/NomadPlan",
        "`README.md` — instalação e execução; `docs/api.md` — rotas da API; `docs/dicionario-de-dados.md` — modelo de dados; "
        "`docs/seguranca.md` — controles e riscos aceitos; `docs/operacao.md` — implantação, backup e recuperação; "
        "`docs/relatorio-de-carga.md` — teste de carga.",
    ]
)

# ============================================================ 13
h1("13 Apêndices")
h3("Apêndice A — Documentação de apoio no repositório")
tabela(
    ["Documento", "Conteúdo"],
    [
        ["README.md", "Visão geral, requisitos, instalação, variáveis de ambiente e como executar o sistema e os testes."],
        ["docs/api.md", "Referência das rotas da API REST, com papéis exigidos e exemplos."],
        ["docs/dicionario-de-dados.md", "Tabelas, colunas, relacionamentos e dados pessoais (LGPD)."],
        ["docs/seguranca.md", "Controles por categoria do OWASP, privacidade e riscos aceitos."],
        ["docs/operacao.md", "Implantação, rollback, backup diário, restauração (RNF08), monitoramento e importação dos dados do OpenStreetMap."],
        ["docs/relatorio-de-carga.md", "Método e resultados do teste de carga com 100 usuários."],
    ],
    [5.0, 10.0],
    legenda="Documentos que acompanham o código.",
)
h3("Apêndice B — Contas de demonstração")
par(
    "O comando de seed do backend (`npm run prisma:seed`) cria contas de demonstração para cada perfil — administrador, "
    "moderador, negócio e morador, todas com o domínio `@nomadplan.local` — e carrega os 2.025 pontos reais de Joinville, "
    "Florianópolis e Blumenau baixados do OpenStreetMap (arquivos em `backend/prisma/dados/osm/`). O seed recusa rodar em "
    "produção; lá, os pontos entram com `npm run osm:importar`. Para atualizar os dados ou incluir outra cidade: "
    "`npm run osm:baixar -- <cidade>` seguido de `npm run osm:importar`. As senhas estão no README do repositório."
)
h3("Apêndice C — Como executar e testar")
lista(
    [
        "Banco: `docker compose up -d postgres`.",
        "Backend: `cd backend && npm ci && npx prisma migrate deploy && npm run prisma:seed && npm run dev` (porta 3333).",
        "Frontend: `cd frontend && npm ci && npm run dev` (porta 5173).",
        "Testes do backend: `npm run test:cobertura` (unitários e de integração, com limite mínimo de 60% de cobertura de linhas).",
        "Testes de ponta a ponta: `cd e2e && npm ci && npx playwright test`.",
        "Teste de carga: `node e2e/carga/carga.mjs` (instruções em `docs/relatorio-de-carga.md`).",
    ]
)

# ---- seção 14: tira os restos de markdown do modelo (###, **, ---)
apos = False
for p in list(doc.paragraphs):
    t = p.text.strip()
    if re.match(r"#? ?14\.? Parecer", t):
        apos = True
        for r in list(p.runs)[1:]:
            r._r.getparent().remove(r._r)
        p.runs[0].text = "14 Parecer do Comitê de Avaliação"
        _fonte(p.runs[0], True, False, 16)
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.page_break_before = True
        continue
    if not apos:
        continue
    if t == "---":
        p._p.getparent().remove(p._p)
    elif "**" in t:
        texto = p.text
        for r in list(p.runs):
            r._r.getparent().remove(r._r)
        _runs(p, texto)

# separador visual antes do parecer do comitê
doc.save(RFC)
print("ok", fig_n[0], "figuras", tab_n[0], "tabelas")
