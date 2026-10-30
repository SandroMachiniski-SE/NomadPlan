"""Atualiza o sumário do RFC.docx e gera o RFC.pdf usando o Microsoft Word (precisa do Word instalado e do pywin32)."""
from pathlib import Path

import win32com.client as win32

PROJETO = Path(__file__).resolve().parents[2]
WD_EXPORT_PDF = 17
WD_MARCADORES_DOS_TITULOS = 1
WD_ESTILO_SUMARIO_1, WD_ESTILO_SUMARIO_2 = -20, -21

word = win32.Dispatch("Word.Application")
word.Visible = False
try:
    doc = word.Documents.Open(str(PROJETO / "RFC.docx"), ReadOnly=False)
    # O sumário é um campo: só o Word sabe em que página cada título caiu.
    for estilo, negrito in ((WD_ESTILO_SUMARIO_1, True), (WD_ESTILO_SUMARIO_2, False)):
        doc.Styles(estilo).Font.Name = "Arial"
        doc.Styles(estilo).Font.Bold = negrito
        doc.Styles(estilo).Font.Size = 10  # o sumário inteiro numa página
        doc.Styles(estilo).ParagraphFormat.SpaceBefore = 0
        doc.Styles(estilo).ParagraphFormat.SpaceAfter = 2
    nivel_2 = doc.Styles(WD_ESTILO_SUMARIO_2).NameLocal
    for i in range(1, doc.TablesOfContents.Count + 1):
        sumario = doc.TablesOfContents(i)
        sumario.Update()
        # As entradas copiam o negrito dos títulos; só o nível 1 fica em negrito.
        for paragrafo in sumario.Range.Paragraphs:
            if paragrafo.Style.NameLocal == nivel_2:
                paragrafo.Range.Font.Bold = False
    doc.Save()
    doc.ExportAsFixedFormat(
        OutputFileName=str(PROJETO / "RFC.pdf"),
        ExportFormat=WD_EXPORT_PDF,
        CreateBookmarks=WD_MARCADORES_DOS_TITULOS,
    )
    doc.Close(False)
finally:
    word.Quit()
print("pdf gerado")
