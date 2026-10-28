"""Recorta as capturas de tela para caberem na página do RFC e monta as figuras compostas.

Lê rfc_telas/ e grava em rfc_figuras/ (pasta gerada, fora do git). Rode antes de rfc_secoes_8_13.py."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent
TELAS = RAIZ / "rfc_telas"
SAIDA = RAIZ / "rfc_figuras"
SAIDA.mkdir(exist_ok=True)

# nome -> (arquivo, topo, base); base None = até o fim
CORTES = {
    "busca": ("busca.png", 0, 1500),
    "ponto": ("ponto.png", 0, 1120),
    "roteiro": ("roteiro.png", 0, 1780),
    "gerar": ("gerar.png", 0, 1500),
    "cadastro_ponto": ("cadastro-ponto.png", 0, 1500),
    "moderacao": ("moderacao.png", 0, 1300),
    "admin": ("admin.png", 0, 1500),
    "perfil": ("perfil.png", 0, 1500),
    "ferramentas": ("ferramentas.png", 0, None),
    "convite": ("convite.png", 0, None),
    "planejamento": ("planejamento.png", 0, None),
    "colaboracao": ("colaboracao.png", 0, None),
    "celular": ("busca-celular.png", 0, None),
    "login": ("login.png", 0, 800),
    "registrar": ("registrar.png", 0, 1230),
}
for nome, (arq, topo, base) in CORTES.items():
    im = Image.open(TELAS / arq).convert("RGB")
    im = im.crop((0, topo, im.width, base or im.height))
    im.save(SAIDA / f"{nome}.png", optimize=True)

# sequência do fluxo principal: 4 quadros numerados
FONTE = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 34)
FONTE_P = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 30)
quadros = [
    ("1  Entrar", Image.open(TELAS / "login.png").convert("RGB"), (0, 800)),
    ("2  Buscar e filtrar", Image.open(TELAS / "busca.png").convert("RGB"), (0, 800)),
    ("3  Ver o ponto e adicionar ao roteiro", Image.open(TELAS / "ponto.png").convert("RGB"), (0, 800)),
    ("4  Organizar o roteiro por dia", Image.open(TELAS / "roteiro.png").convert("RGB"), (0, 800)),
]
LARG, ALT, TOPO_TXT, MARGEM = 1280, 800, 70, 30
grade = Image.new("RGB", (LARG * 2 + MARGEM * 3, (ALT + TOPO_TXT) * 2 + MARGEM * 3), (255, 255, 255))
d = ImageDraw.Draw(grade)
for i, (titulo, im, (t, bz)) in enumerate(quadros):
    im = im.crop((0, t, im.width, min(bz, im.height)))
    if im.width != LARG:
        im = im.resize((LARG, int(im.height * LARG / im.width)))
    im = im.crop((0, 0, LARG, ALT))
    col, lin = i % 2, i // 2
    x = MARGEM + col * (LARG + MARGEM)
    y = MARGEM + lin * (ALT + TOPO_TXT + MARGEM)
    d.ellipse((x, y + 6, x + 46, y + 52), fill=(13, 92, 99))
    d.text((x + 23, y + 29), str(i + 1), font=FONTE, fill=(255, 255, 255), anchor="mm")
    d.text((x + 62, y + 29), titulo[3:], font=FONTE, fill=(33, 43, 46), anchor="lm")
    grade.paste(im, (x, y + TOPO_TXT))
    d.rectangle((x, y + TOPO_TXT, x + LARG, y + TOPO_TXT + ALT), outline=(190, 196, 198), width=2)
grade.save(SAIDA / "sequencia_fluxo.png", optimize=True)
