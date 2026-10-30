"""Baixa do Overture Maps os lugares de cada cidade e grava backend/prisma/dados/overture/<cidade>.json.

Uso (na raiz do projeto, com Python 3 e `pip install duckdb`):
    python scripts/dados/baixar_overture.py Joinville Florianópolis Blumenau

O Overture Maps (Meta, Microsoft, AWS e outros) publica os lugares em arquivos GeoParquet abertos;
o DuckDB lê direto do armazenamento público e baixa só a região pedida (de 3 a 5 minutos por cidade).
A área de cada cidade é a dos pontos do OpenStreetMap já baixados (prisma/dados/osm/<cidade>.json),
com uma margem. Licença dos dados: CDLA Permissive 2.0 (e Apache 2.0 / CC0 em algumas fontes),
que permite guardar e redistribuir desde que a licença acompanhe os dados.

Depois rode `npm run overture:importar` no backend."""
import json
import math
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parents[2]
DADOS = RAIZ / "backend" / "prisma" / "dados"
RELEASE = "2026-10-21.0"
MARGEM_GRAUS = 0.02  # ~2 km
CONFIANCA_MINIMA = 0.6
DISTANCIA_MESMO_LUGAR_M = 250
# Categorias do Overture que viram hospedagem nova (o OpenStreetMap tem poucos hotéis); motel fica de fora.
HOSPEDAGEM = {"hotel", "inn", "bed_and_breakfast", "hostel", "resort", "guest_house", "cottage", "holiday_rental_home"}


def slug(texto):
    s = unicodedata.normalize("NFD", texto.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return "-".join(p for p in "".join(c if c.isalnum() else " " for c in s).split())


def area_da_cidade(cidade):
    pontos = json.loads((DADOS / "osm" / f"{slug(cidade)}.json").read_text(encoding="utf-8"))["pontos"]
    lats = [p["latitude"] for p in pontos]
    lons = [p["longitude"] for p in pontos]
    return min(lons) - MARGEM_GRAUS, max(lons) + MARGEM_GRAUS, min(lats) - MARGEM_GRAUS, max(lats) + MARGEM_GRAUS


def sem_acento(texto):
    s = unicodedata.normalize("NFD", (texto or "").lower())
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").split())


def distancia_m(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    x = (lon2 - lon1) * p * math.cos((lat1 + lat2) / 2 * p)
    return 6371000 * math.hypot(x, (lat2 - lat1) * p)


def nomes_parecidos(a, b):
    a, b = sem_acento(a), sem_acento(b)
    return a == b or (min(len(a), len(b)) >= 5 and (a in b or b in a))


CELULA_GRAUS = 0.005  # ~500 m: os vizinhos de um lugar estão na célula dele ou nas oito ao redor


def celula(lat, lon):
    return (math.floor(lat / CELULA_GRAUS), math.floor(lon / CELULA_GRAUS))


def indexar(pontos):
    grade = {}
    for p in pontos:
        grade.setdefault(celula(p["latitude"], p["longitude"]), []).append(p)
    return grade


def util(lugar, grade, cidade):
    """Só guarda o que o importador usa: o que corresponde a um ponto nosso e as hospedagens."""
    if (
        lugar["categoriaOverture"] in HOSPEDAGEM
        and lugar["confianca"] >= 0.85
        and sem_acento(lugar["localidade"]) == sem_acento(cidade)
    ):
        return True
    i, j = celula(lugar["latitude"], lugar["longitude"])
    vizinhos = (p for di in (-1, 0, 1) for dj in (-1, 0, 1) for p in grade.get((i + di, j + dj), []))
    return any(
        distancia_m(p["latitude"], p["longitude"], lugar["latitude"], lugar["longitude"]) <= DISTANCIA_MESMO_LUGAR_M
        and nomes_parecidos(p["nome"], lugar["nome"])
        for p in vizinhos
    )


def baixar(con, cidade):
    xmin, xmax, ymin, ymax = area_da_cidade(cidade)
    linhas = con.execute(
        f"""
        SELECT id, names.primary, taxonomy.primary, confidence, websites, phones, socials,
               addresses[1].freeform, addresses[1].locality, ST_Y(geometry), ST_X(geometry),
               list_transform(sources, s -> s.dataset || ' (' || s.license || ')')
        FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN ? AND ? AND bbox.ymin BETWEEN ? AND ?
          AND names.primary IS NOT NULL AND confidence >= ?
          AND (operating_status IS NULL OR operating_status = 'open')
        """,
        [xmin, xmax, ymin, ymax, CONFIANCA_MINIMA],
    ).fetchall()

    nossos = json.loads((DADOS / "osm" / f"{slug(cidade)}.json").read_text(encoding="utf-8"))["pontos"]
    lugares = [
        {
            "idOverture": r[0],
            "nome": r[1],
            "categoriaOverture": r[2],
            "confianca": round(r[3], 3),
            "sites": r[4] or [],
            "telefones": r[5] or [],
            "redesSociais": r[6] or [],
            "endereco": r[7],
            "localidade": r[8],
            "latitude": r[9],
            "longitude": r[10],
            "fontes": r[11] or [],
        }
        for r in linhas
    ]
    print(f"  {len(lugares)} lugares na região; filtrando os que interessam...", flush=True)

    grade = indexar(nossos)
    return [lugar for lugar in lugares if util(lugar, grade, cidade)]


def main():
    cidades = sys.argv[1:]
    if not cidades:
        sys.exit("Uso: python scripts/dados/baixar_overture.py Joinville Florianópolis")

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    pasta = DADOS / "overture"
    pasta.mkdir(parents=True, exist_ok=True)

    for cidade in cidades:
        print(f"{cidade}: consultando o Overture Maps ({RELEASE})...", flush=True)
        lugares = baixar(con, cidade)
        destino = pasta / f"{slug(cidade)}.json"
        destino.write_text(
            json.dumps(
                {
                    "fonte": f"Overture Maps Foundation, tema places, versão {RELEASE}",
                    "licenca": "CDLA Permissive 2.0 (https://cdla.dev/permissive-2-0/); algumas fontes em Apache 2.0 ou CC0, indicadas em cada lugar",
                    "cidade": cidade,
                    "baixadoEm": datetime.now(timezone.utc).isoformat(),
                    "lugares": lugares,
                },
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"  {len(lugares)} lugares → {destino.relative_to(RAIZ)}", flush=True)


if __name__ == "__main__":
    main()
