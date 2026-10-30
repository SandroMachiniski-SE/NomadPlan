"""Diagramas do RFC do NomadPlan (fluxo de navegação, C4 e modelo de dados)."""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

PASTA = os.path.join(os.path.dirname(__file__), "rfc_diagramas")
os.makedirs(PASTA, exist_ok=True)

AUMENTO_TEXTO = 1.35
plt.rcParams["font.family"] = "Arial"

TEAL = "#075963"
TEAL_CLARO = "#d7ecec"
CORAL = "#c2512f"
CORAL_CLARO = "#fbe4dc"
CINZA = "#566468"
CINZA_CLARO = "#eef0ef"
TEXTO = "#1c2b31"
ROXO = "#5b4a9e"
ROXO_CLARO = "#e7e2f6"


def novo(largura, altura):
    # a tela é encolhida e o dpi sobe na mesma proporção: o texto fica maior em relação às caixas e legível no papel
    fig, ax = plt.subplots(figsize=(largura / AUMENTO_TEXTO, altura / AUMENTO_TEXTO), dpi=200 * AUMENTO_TEXTO)
    ax.set_xlim(-2, largura * 10 + 2)
    ax.set_ylim(-2, altura * 10 + 2)
    ax.axis("off")
    return fig, ax


def caixa(ax, x, y, w, h, titulo, sub=None, cor=TEAL, fundo=TEAL_CLARO, tam=9, estilo="round,pad=0.02,rounding_size=1.2", tracejada=False):
    ax.add_patch(
        FancyBboxPatch(
            (x, y), w, h, boxstyle=estilo, linewidth=1.4, edgecolor=cor, facecolor=fundo,
            linestyle="--" if tracejada else "-",
        )
    )
    if sub:
        ax.text(x + w / 2, y + h * 0.62, titulo, ha="center", va="center", fontsize=tam, fontweight="bold", color=TEXTO, wrap=True)
        ax.text(x + w / 2, y + h * 0.3, sub, ha="center", va="center", fontsize=tam - 2.2, color=CINZA, linespacing=1.25)
    else:
        ax.text(x + w / 2, y + h / 2, titulo, ha="center", va="center", fontsize=tam, fontweight="bold", color=TEXTO, linespacing=1.2)


def seta(ax, origem, destino, rotulo=None, cor=CINZA, curva=0.0, tam=6.3, pos=0.5, desloc=(0, 0)):
    ax.add_patch(
        FancyArrowPatch(
            origem, destino, arrowstyle="-|>", mutation_scale=9, linewidth=1.1, color=cor,
            connectionstyle=f"arc3,rad={curva}", shrinkA=2, shrinkB=2,
        )
    )
    if rotulo:
        x = origem[0] + (destino[0] - origem[0]) * pos + desloc[0]
        y = origem[1] + (destino[1] - origem[1]) * pos + desloc[1]
        ax.text(x, y, rotulo, ha="center", va="center", fontsize=tam, color=CINZA,
                bbox=dict(boxstyle="round,pad=0.25", facecolor="white", edgecolor="none"))


def salvar(fig, nome):
    fig.savefig(os.path.join(PASTA, nome), bbox_inches="tight", facecolor="white", pad_inches=0.15)
    plt.close(fig)


# ---------------------------------------------------------------- fluxo de navegação
def fluxo_navegacao():
    fig, ax = novo(17, 10)

    def no(x, y, texto, cor=TEAL, fundo=TEAL_CLARO, w=26, h=9):
        caixa(ax, x, y, w, h, texto, cor=cor, fundo=fundo, tam=8)
        return (x, y, w, h)

    def d(n):  # direita
        return (n[0] + n[2], n[1] + n[3] / 2)

    def e(n):  # esquerda
        return (n[0], n[1] + n[3] / 2)

    def c(n):  # cima
        return (n[0] + n[2] / 2, n[1] + n[3])

    def b(n):  # baixo
        return (n[0] + n[2] / 2, n[1])

    def faixa(y0, y1, titulo, cor):
        ax.add_patch(FancyBboxPatch((1, y0), 168, y1 - y0, boxstyle="round,pad=0.02,rounding_size=1.2",
                                    linewidth=0.8, edgecolor=cor, facecolor="none", linestyle=":"))
        ax.text(3, y1 - 3, titulo, fontsize=9, color=cor, fontweight="bold")

    faixa(60, 98, "Público (sem login)", CORAL)
    faixa(29, 58, "Usuário logado", TEAL)
    faixa(3, 27, "Papéis especiais", ROXO)

    # Público
    inicio = no(4, 78, "Início\nbusca e filtros", CORAL, CORAL_CLARO)
    ponto = no(38, 78, "Detalhe do ponto\nmapa · avaliações\nsalvar · adicionar ao roteiro", CORAL, CORAL_CLARO, w=32, h=11)
    publico = no(110, 78, "Roteiro público\n(aberto por link)", CORAL, CORAL_CLARO)
    recuperar = no(4, 63, "Recuperar senha\n(link por e-mail)", CORAL, CORAL_CLARO)
    login = no(38, 63, "Login\n(+ código 2FA)", CORAL, CORAL_CLARO, w=32)
    cadastro = no(86, 63, "Cadastro\n(aceite da LGPD)", CORAL, CORAL_CLARO)

    # Logado
    meus = no(38, 41, "Meus roteiros\n(próprios e compartilhados)", w=32, h=10)
    favoritos = no(4, 44, "Favoritos")
    perfil = no(4, 31, "Perfil\npreferências · 2FA · LGPD", h=10)
    novo_r = no(78, 46, "Novo roteiro")
    gerar = no(78, 33, "Gerar roteiro\nsugerido")
    roteiro = no(116, 38, "Roteiro\ndias · mapa · orçamento\nchecklist · participantes", w=34, h=13)
    convites = no(154, 38, "Convites\naceitar\n/ recusar", w=14, h=13)

    # Papéis especiais
    ferr = no(4, 8, "Importar / exportar\nCSV e GeoJSON", ROXO, ROXO_CLARO, w=30)
    meus_pontos = no(42, 8, "Meus pontos", ROXO, ROXO_CLARO, w=24)
    cad_ponto = no(74, 8, "Cadastro de ponto\nimagem · publicação", ROXO, ROXO_CLARO, w=30)
    moderacao = no(112, 6, "Moderação\npontos · sugestões\nselos · avaliações", ROXO, ROXO_CLARO, w=30, h=12)
    admin = no(146, 8, "Administração\nmétricas · auditoria", ROXO, ROXO_CLARO, w=21)

    seta(ax, d(inicio), e(ponto), "abrir")
    seta(ax, (inicio[0] + 20, inicio[1]), (login[0] + 8, login[1] + 9), "entrar", pos=0.5, desloc=(-2, 0))
    seta(ax, e(login), d(recuperar), "esqueci", pos=0.5)
    seta(ax, d(login), e(cadastro), "criar conta", pos=0.5)
    seta(ax, b(login), c(meus), "após entrar", pos=0.5, desloc=(7, 0))
    seta(ax, e(meus), d(favoritos), None)
    seta(ax, e(meus), d(perfil), None)
    seta(ax, d(meus), e(novo_r))
    seta(ax, d(meus), e(gerar))
    seta(ax, d(novo_r), (roteiro[0], roteiro[1] + 10))
    seta(ax, d(gerar), (roteiro[0], roteiro[1] + 3), "salvar", pos=0.5, desloc=(0, -2.5))
    ax.add_patch(FancyArrowPatch((roteiro[0] + 17, roteiro[1] + 13), (publico[0] + 13, publico[1]),
                                 arrowstyle="-|>", mutation_scale=9, linewidth=1.1, color=CINZA, linestyle="--", shrinkA=2, shrinkB=2))
    ax.text(roteiro[0] + 17, 62, "compartilhar", fontsize=6.3, color=CINZA, va="center",
            bbox=dict(boxstyle="round,pad=0.25", facecolor="white", edgecolor="none"))
    seta(ax, e(convites), d(roteiro), "aceitar", pos=0.5, desloc=(0, 4))

    seta(ax, b(meus), (meus_pontos[0] + 12, meus_pontos[1] + 9), "negócio / gestor", pos=0.3, desloc=(8, 0))
    seta(ax, e(meus_pontos), d(ferr))
    seta(ax, d(meus_pontos), e(cad_ponto))
    seta(ax, d(cad_ponto), e(moderacao), "enviar")
    seta(ax, d(moderacao), e(admin))
    salvar(fig, "fluxo_navegacao.png")


# ---------------------------------------------------------------- C4 nível 1
def c4_contexto():
    fig, ax = novo(14, 8)

    atores = [
        ("Visitante / turista", "busca, favorita, avalia\ne monta roteiros"),
        ("Morador", "contribui com avaliações\ne sugestões de edição"),
        ("Negócio / gestor", "cadastra pontos, importa\ne exporta inventário"),
        ("Moderador", "aprova pontos, sugestões,\nselos e avaliações"),
        ("Administrador", "gerencia papéis, contas,\nmétricas e auditoria"),
    ]
    for i, (nome, desc) in enumerate(atores):
        caixa(ax, 2, 64 - i * 15, 30, 11, nome, desc, CORAL, CORAL_CLARO, tam=8.5)
        seta(ax, (32, 69.5 - i * 15), (52, 40 + (2 - i) * 4))

    caixa(ax, 52, 26, 38, 28, "NomadPlan", "Plataforma de turismo inteligente:\ninventário turístico colaborativo,\nbusca, recomendações e roteiros\npersonalizados e compartilháveis", TEAL, TEAL_CLARO, tam=12)

    externos = [
        ("Servidor SMTP", "e-mails de recuperação\nde senha e de convites", 67),
        ("OpenStreetMap", "mapas (tiles) e dados dos\npontos (Overpass API)", 50),
        ("Wikimedia Commons", "fotos dos pontos importados,\ncom autor e licença", 33),
        ("Aplicativo autenticador", "gera os códigos TOTP\nda verificação em 2 etapas", 16),
    ]
    for nome, desc, y in externos:
        caixa(ax, 108, y - 5, 30, 11, nome, desc, CINZA, CINZA_CLARO, tam=8.5, tracejada=True)
    seta(ax, (90, 48), (108, 67.5), "envia e-mails", pos=0.5)
    seta(ax, (90, 43), (108, 50.5), "mapas e\nimportação", pos=0.5)
    seta(ax, (90, 37), (108, 33.5), "fotos", pos=0.5)
    seta(ax, (108, 16.5), (90, 30), "código de 6 dígitos\n(digitado pelo usuário)", pos=0.45)

    ax.text(70, 76, "Diagrama de contexto (C4 — nível 1)", ha="center", fontsize=11, fontweight="bold", color=TEXTO)
    salvar(fig, "c4_contexto.png")


# ---------------------------------------------------------------- C4 nível 2
def c4_containers():
    fig, ax = novo(15, 9.5)

    caixa(ax, 2, 40, 22, 14, "Usuário", "no navegador\n(desktop ou celular)", CORAL, CORAL_CLARO, tam=9)

    ax.add_patch(FancyBboxPatch((32, 4), 80, 72, boxstyle="round,pad=0.02,rounding_size=1.5", linewidth=1.2, edgecolor=TEAL, facecolor="none", linestyle="--"))
    ax.text(34, 72.5, "NomadPlan", fontsize=10, fontweight="bold", color=TEAL)

    caixa(ax, 38, 46, 28, 18, "Aplicação web (SPA)", "React 19 + TypeScript + Vite\nReact Router · Leaflet · Axios\nservida como arquivos estáticos", TEAL, TEAL_CLARO, tam=9)
    caixa(ax, 80, 46, 28, 18, "API REST", "Node.js 22 + Express + TypeScript\nZod · JWT · bcrypt · Prisma\nrate limit · auditoria · métricas\nserve as imagens em /uploads", TEAL, TEAL_CLARO, tam=9)
    caixa(ax, 80, 10, 28, 18, "Banco de dados", "PostgreSQL 16 + PostGIS\n(índice geográfico GiST)\n16 tabelas", TEAL, TEAL_CLARO, tam=9)
    caixa(ax, 38, 10, 28, 18, "Arquivos enviados", "imagens de pontos e\nfotos de avaliações\n(pasta UPLOADS_DIR)", TEAL, TEAL_CLARO, tam=9)

    caixa(ax, 122, 54, 26, 14, "Servidor SMTP", "Gmail, Brevo, Mailpit...", CINZA, CINZA_CLARO, tam=9, tracejada=True)
    caixa(ax, 122, 20, 26, 14, "OpenStreetMap", "tiles do mapa · dados dos\npontos · fotos (Wikimedia)", CINZA, CINZA_CLARO, tam=9, tracejada=True)

    seta(ax, (24, 49), (38, 55), "HTTPS", pos=0.5, desloc=(0, 3))
    seta(ax, (66, 55), (80, 55), None)
    ax.text(73, 59.5, "JSON / HTTPS\nBearer JWT", ha="center", fontsize=6.3, color=CINZA)
    seta(ax, (94, 46), (94, 28), "SQL (Prisma)", pos=0.5, desloc=(8, 0))
    seta(ax, (80, 50), (66, 24), "grava / lê", pos=0.45, desloc=(-5, 1.5))
    seta(ax, (108, 58), (122, 60), "SMTP", pos=0.5, desloc=(0, 2.5))
    # Os pontos vêm de um script da própria API, rodado pela equipe (não a cada requisição).
    seta(ax, (108, 49), (122, 30), "importação\n(npm run osm:baixar)", pos=0.5, desloc=(10, 0.5))

    # O mapa é desenhado no navegador: os tiles vêm do OpenStreetMap direto para o usuário.
    ax.plot([13, 13, 135], [40, 0.5, 0.5], color=CINZA, linewidth=1.1, linestyle="--", solid_capstyle="butt")
    ax.add_patch(FancyArrowPatch((135, 0.5), (135, 20), arrowstyle="-|>", mutation_scale=9, linewidth=1.1, color=CINZA,
                                 linestyle="--", shrinkA=0, shrinkB=2))
    ax.text(74, 0.5, "tiles do mapa e fotos (HTTPS, direto do navegador)", fontsize=6.3, color=CINZA, ha="center", va="center",
            bbox=dict(boxstyle="round,pad=0.25", facecolor="white", edgecolor="none"))

    ax.text(74, 81, "Diagrama de containers (C4 — nível 2)", ha="center", fontsize=11, fontweight="bold", color=TEXTO)
    salvar(fig, "c4_containers.png")


# ---------------------------------------------------------------- C4 nível 3
def c4_componentes():
    fig, ax = novo(16, 10)
    ax.text(80, 97, "Componentes da API REST (C4 — nível 3)", ha="center", fontsize=11, fontweight="bold", color=TEXTO)

    def grupo(x, y, w, h, titulo, cor):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=1.2", linewidth=1.1, edgecolor=cor, facecolor="none", linestyle="--"))
        ax.text(x + 1.5, y + h - 3.2, titulo, fontsize=8.5, fontweight="bold", color=cor)

    caixa(ax, 2, 74, 22, 12, "Aplicação web", "requisições\nJSON / HTTPS", CORAL, CORAL_CLARO, tam=8.5)

    grupo(30, 66, 128, 26, "Middlewares (toda requisição)", CORAL)
    mids = [
        ("Segurança HTTP", "helmet · CORS ·\nlimite de corpo"),
        ("Autenticação", "JWT conferido\nno banco"),
        ("Autorização", "papel mínimo\npor rota"),
        ("Limites de taxa", "login · cadastro ·\ncontribuições"),
        ("Acesso ao roteiro", "dono · editor ·\nleitor"),
        ("Upload", "tipo real do arquivo\ne tamanho"),
    ]
    for i, (t, s) in enumerate(mids):
        caixa(ax, 32 + i * 21, 68, 19.5, 16, t, s, CORAL, CORAL_CLARO, tam=7.5)

    grupo(30, 37, 128, 25, "Rotas (controladores)", TEAL)
    rotas = ["/auth", "/pontos", "/roteiros", "/convites", "/salvos", "/sugestoes\n/verificacoes\n/avaliacoes", "/notificacoes", "/admin"]
    for i, t in enumerate(rotas):
        caixa(ax, 32 + i * 15.75, 39, 14.5, 17, t, None, TEAL, TEAL_CLARO, tam=7.5)

    grupo(30, 3, 128, 30, "Serviços e regras de negócio (src/lib)", ROXO)
    libs = [
        ("Busca", "filtros · cache de\ncontingência · timeout"),
        ("Recomendação", "planejador com\nhorários e distância"),
        ("Horários", "interpreta o texto de\nfuncionamento"),
        ("Trajeto", "trechos e otimização\n(vizinho + 2-opt)"),
        ("Similaridade", "usuários de\ngosto parecido"),
        ("Orçamento", "custos por dia\ne teto"),
        ("Versionamento", "histórico de pontos\ne roteiros"),
        ("Privacidade", "exportar dados ·\nanonimizar conta"),
        ("TOTP + cripto", "2FA · AES-256-GCM"),
        ("E-mail", "senha e convites"),
        ("Auditoria", "log de ações\nsensíveis"),
        ("Métricas", "uso diário em lote"),
    ]
    for i, (t, s) in enumerate(libs):
        col, lin = i % 6, i // 6
        caixa(ax, 32 + col * 21, 18 - lin * 13, 19.5, 11, t, s, ROXO, ROXO_CLARO, tam=7.3)

    caixa(ax, 2, 10, 22, 14, "Prisma Client", "→ PostgreSQL\n+ PostGIS", CINZA, CINZA_CLARO, tam=8.5)

    seta(ax, (24, 80), (30, 80))
    seta(ax, (94, 66), (94, 62))
    seta(ax, (94, 37), (94, 33))
    seta(ax, (30, 17), (24, 17))
    salvar(fig, "c4_componentes.png")


# ---------------------------------------------------------------- modelo de dados
def der():
    fig, ax = novo(18, 13)
    ax.text(90, 126, "Modelo de dados (PostgreSQL) — 16 tabelas", ha="center", fontsize=12, fontweight="bold", color=TEXTO)

    tabelas = {}

    def tabela(nome, x, y, campos, cor=TEAL, fundo=TEAL_CLARO, w=34):
        h = 4.2 + 2.9 * len(campos)
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.8", linewidth=1.2, edgecolor=cor, facecolor="white", zorder=3))
        ax.add_patch(FancyBboxPatch((x, y + h - 4.2), w, 4.2, boxstyle="round,pad=0.02,rounding_size=0.8", linewidth=0, facecolor=fundo, zorder=4))
        ax.text(x + w / 2, y + h - 2.1, nome, ha="center", va="center", fontsize=7.6, fontweight="bold", color=cor, zorder=5)
        for i, campo in enumerate(campos):
            chave = campo.startswith(("PK", "FK"))
            ax.text(x + 1.2, y + h - 6 - i * 2.9, campo, fontsize=6.1, color=TEXTO if chave else CINZA, va="center", zorder=5,
                    fontweight="bold" if campo.startswith("PK") else "normal")
        tabelas[nome] = (x, y, w, h)

    # coluna central: conta e inventário
    tabela("log_auditoria", 48, 112, ["PK id", "FK id_usuario (opcional)", "acao · entidade · detalhes"], CINZA, CINZA_CLARO, w=36)
    tabela("usuario", 48, 78, ["PK id", "email (único)", "senha_hash", "tipo_conta", "interesses[] · idioma", "preferencias_acessibilidade[]", "mfa_ativo · mfa_segredo (cifrado)", "consentimento_em · removido_em", "reputacao · ativo"], CORAL, CORAL_CLARO, w=36)
    tabela("ponto_turistico", 48, 34, ["PK id", "FK id_responsavel → usuario", "nome · categoria · cidade", "latitude · longitude", "geom (PostGIS, gerada)", "horario_funcionamento", "status · selo_verificado", "versao (bloqueio otimista)"], w=36)
    tabela("versao_ponto", 48, 8, ["PK id", "FK id_ponto", "dados (JSON) · motivo"], w=36)

    # coluna esquerda
    tabela("notificacao", 4, 100, ["PK id", "FK id_usuario", "mensagem · link · lida"], CINZA, CINZA_CLARO, w=34)
    tabela("ponto_salvo", 4, 80, ["PK id", "FK id_usuario · FK id_ponto", "único (usuário, ponto)"], w=34)
    tabela("avaliacao", 4, 52, ["PK id", "FK id_ponto · FK id_autor", "nota · comentario · foto_url", "status · motivo_retencao", "único (ponto, autor)"], w=34)
    tabela("sugestao_edicao", 4, 30, ["PK id", "FK id_ponto · FK id_autor", "campos_propostos (JSON)", "status · motivo_retencao"], w=34)
    tabela("solicitacao_verificacao", 4, 10, ["PK id", "FK id_ponto · FK id_solicitante", "comprovacao · status"], w=34)

    # coluna dos roteiros
    tabela("roteiro", 98, 84, ["PK id", "FK id_usuario → usuario (dono)", "nome · cidade · datas", "publico · slug_publico", "notas · orcamento_centavos"], w=38)
    tabela("item_roteiro", 98, 50, ["PK id", "FK id_roteiro · FK id_ponto", "dia · ordem", "observacao · custo_centavos"], w=38)

    # coluna da colaboração e apoio ao roteiro
    tabela("colaborador_roteiro", 146, 108, ["PK id", "FK id_roteiro · FK id_usuario", "papel (EDITOR | LEITOR)"], ROXO, ROXO_CLARO, w=34)
    tabela("convite_roteiro", 146, 92, ["PK id", "FK id_roteiro · id_convidante", "email · papel"], ROXO, ROXO_CLARO, w=34)
    tabela("versao_roteiro", 146, 70, ["PK id", "FK id_roteiro", "dados (JSON) · motivo"], w=34)
    tabela("item_checklist", 146, 54, ["PK id", "FK id_roteiro", "texto · feito · ordem"], w=34)
    tabela("metrica_diaria", 146, 10, ["PK (dia, tipo)", "total"], CINZA, CINZA_CLARO, w=34)

    def ponto_de(nome, lado, frac=0.5):
        x, y, w, h = tabelas[nome]
        return {"e": (x, y + h * frac), "d": (x + w, y + h * frac), "c": (x + w * frac, y + h), "b": (x + w * frac, y)}[lado]

    def rel(a, la, fa, b, lb, fb):
        pa, pb = ponto_de(a, la, fa), ponto_de(b, lb, fb)
        ax.add_patch(FancyArrowPatch(pa, pb, arrowstyle="-", linewidth=0.9, color=CINZA, zorder=1))
        for ponto, lado, texto in ((pa, la, "1"), (pb, lb, "N")):
            deslocamento_x = 1 if lado == "d" else -1 if lado == "e" else 0
            deslocamento_y = 1.4 if lado == "c" else -1.4 if lado == "b" else 0.8
            ax.text(ponto[0] + deslocamento_x, ponto[1] + deslocamento_y, texto, fontsize=6.4, color=CORAL, fontweight="bold",
                    ha="left" if lado == "d" else "right" if lado == "e" else "center", va="center", zorder=6)

    rel("usuario", "c", 0.5, "log_auditoria", "b", 0.5)
    rel("usuario", "e", 0.85, "notificacao", "d", 0.5)
    rel("usuario", "e", 0.6, "ponto_salvo", "d", 0.5)
    rel("ponto_turistico", "e", 0.95, "ponto_salvo", "d", 0.2)
    rel("usuario", "b", 0.5, "ponto_turistico", "c", 0.5)
    rel("ponto_turistico", "e", 0.8, "avaliacao", "d", 0.5)
    rel("ponto_turistico", "e", 0.5, "sugestao_edicao", "d", 0.5)
    rel("ponto_turistico", "e", 0.2, "solicitacao_verificacao", "d", 0.5)
    rel("ponto_turistico", "b", 0.5, "versao_ponto", "c", 0.5)
    rel("usuario", "d", 0.6, "roteiro", "e", 0.6)
    rel("ponto_turistico", "d", 0.6, "item_roteiro", "e", 0.5)
    rel("roteiro", "b", 0.5, "item_roteiro", "c", 0.5)
    rel("roteiro", "d", 0.9, "colaborador_roteiro", "e", 0.5)
    rel("roteiro", "d", 0.7, "convite_roteiro", "e", 0.5)
    rel("roteiro", "d", 0.4, "versao_roteiro", "e", 0.5)
    rel("roteiro", "d", 0.1, "item_checklist", "e", 0.5)

    ax.text(4, 2, "Linhas: relação 1 → N. Laranja = conta; verde = inventário e roteiros; roxo = colaboração; cinza = apoio (notificações, auditoria, métricas).\n"
                  "Além do mostrado, colaborador_roteiro e convite_roteiro também apontam para usuario (participante e convidante).",
            fontsize=6.6, color=CINZA, va="bottom")
    salvar(fig, "modelo_de_dados.png")


fluxo_navegacao()
c4_contexto()
c4_containers()
c4_componentes()
der()
print("ok", sorted(os.listdir(PASTA)))
