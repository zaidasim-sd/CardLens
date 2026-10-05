from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

root = Path(__file__).resolve().parents[2]
doc = Document(root / 'output/documents/CardSnap Privacy and Pilot Documents.docx')
body = doc.element.body
cut = False
for element in list(body):
    if element.tag == qn('w:sectPr'):
        continue
    if any(br.get(qn('w:type')) == 'page' for br in element.iter(qn('w:br'))):
        cut = True
    if cut:
        body.remove(element)
doc.core_properties.title = 'CardSnap Privacy Facts Sheet'
output = root / 'output/documents/CardSnap Privacy Facts Sheet.docx'
doc.save(output)
print(output)
