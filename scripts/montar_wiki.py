#!/usr/bin/env python3
"""Monta as páginas da Wiki do GitHub a partir de docs/ (workflow .github/workflows/wiki.yml).

Uso: python scripts/montar_wiki.py <pasta-de-saida>

A Wiki é gerada, nunca editada à mão: cada página é um arquivo do repositório, com os links entre eles trocados pelos
nomes das páginas da Wiki e os links para o resto do repositório trocados por endereços absolutos.
"""
import os
import re
import shutil
import sys

REPOSITORIO = os.environ.get("GITHUB_REPOSITORY", "SandroMachiniski-SE/NomadPlan")
BLOB = f"https://github.com/{REPOSITORIO}/blob/main"

# arquivo do repositório -> nome da página da Wiki
PAGINAS = {
    "docs/requisitos.md": "Requisitos",
    "docs/arquitetura.md": "Arquitetura",
    "docs/api.md": "API",
    "docs/dicionario-de-dados.md": "Dicionario-de-Dados",
    "docs/implantacao-automatica.md": "Implantacao-Automatica",
    "docs/implantacao-web.md": "Implantacao-Web",
    "docs/operacao.md": "Operacao",
    "docs/monitoramento.md": "Monitoramento",
    "docs/analise-estatica.md": "Analise-Estatica",
    "docs/seguranca.md": "Seguranca",
    "docs/relatorio-de-carga.md": "Relatorio-de-Carga",
    "CONTRIBUTING.md": "Contribuindo",
}

LINK = re.compile(r"(\]\()([^)\s]+)(\))")


def reescrever(texto: str, origem: str) -> str:
    pasta = os.path.dirname(origem)

    def trocar(m: re.Match) -> str:
        alvo = m.group(2)
        if re.match(r"^(https?:|mailto:|#)", alvo):
            return m.group(0)
        caminho, _, ancora = alvo.partition("#")
        absoluto = os.path.normpath(os.path.join(pasta, caminho)).replace("\\", "/")
        if absoluto in PAGINAS:
            return f"{m.group(1)}{PAGINAS[absoluto]}{('#' + ancora) if ancora else ''}{m.group(3)}"
        return f"{m.group(1)}{BLOB}/{absoluto}{('#' + ancora) if ancora else ''}{m.group(3)}"

    return LINK.sub(trocar, texto)


def main() -> None:
    saida = sys.argv[1]
    os.makedirs(saida, exist_ok=True)

    for origem, pagina in PAGINAS.items():
        with open(origem, encoding="utf-8") as f:
            conteudo = f.read()
        with open(os.path.join(saida, pagina + ".md"), "w", encoding="utf-8", newline="\n") as f:
            f.write(reescrever(conteudo, origem))

    for fixa in ("Home.md", "_Sidebar.md"):
        shutil.copyfile(os.path.join("docs", "wiki", fixa), os.path.join(saida, fixa))

    print(f"{len(PAGINAS) + 2} páginas montadas em {saida}")


if __name__ == "__main__":
    main()
