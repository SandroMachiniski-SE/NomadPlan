"""Converte o RFC.docx em RFC.pdf usando o Microsoft Word (precisa do Word instalado e do pywin32)."""
from pathlib import Path

import win32com.client as win32

PROJETO = Path(__file__).resolve().parents[2]

word = win32.Dispatch("Word.Application")
word.Visible = False
try:
    doc = word.Documents.Open(str(PROJETO / "RFC.docx"), ReadOnly=True)
    doc.SaveAs(str(PROJETO / "RFC.pdf"), FileFormat=17)  # wdFormatPDF
    doc.Close(False)
finally:
    word.Quit()
print("pdf gerado")
