"""Render the reviewed Markdown facts table as a single-page PDF."""
from pathlib import Path
from html import escape
import re
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name('01-privacy-facts-sheet.md')
OUTPUT = ROOT / 'output/pdf/cardsnap-privacy-facts-sheet.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
lines = SOURCE.read_text(encoding='utf-8').splitlines()

def rich(text):
    text = escape(text)
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    return re.sub(r'`([^`]+)`', r'\1', text)

body = ParagraphStyle('body', fontName='Helvetica', fontSize=8.1, leading=10.3, textColor=colors.HexColor('#213145'), alignment=TA_LEFT)
label = ParagraphStyle('label', parent=body, fontName='Helvetica-Bold')
title = ParagraphStyle('title', parent=body, fontName='Helvetica-Bold', fontSize=18, leading=21, spaceAfter=6)
sub = ParagraphStyle('sub', parent=body, fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.HexColor('#9b3025'))
small = ParagraphStyle('small', parent=body, fontSize=7.7, leading=9.8)
story = [Paragraph('CardSnap by Vision71', title), Paragraph('Privacy Facts Sheet', ParagraphStyle('h', parent=title, fontSize=13, leading=16)), Paragraph(rich(lines[2]), sub), Spacer(1, 8), Paragraph(rich(lines[4]), small), Spacer(1, 9)]
rows = []
for line in lines:
    if line.startswith('|') and not line.startswith('|---'):
        cells = [x.strip() for x in line.strip('|').split('|')]
        rows.append([Paragraph(rich(cells[0]), label), Paragraph(rich(cells[1]), body)])
table = Table(rows, colWidths=[124, A4[0]-72-124], hAlign='LEFT')
table.setStyle(TableStyle([
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e4edf4')),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f4f7fa')]),
    ('LINEBELOW', (0,0), (-1,-1), .3, colors.HexColor('#c8d4df')),
    ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
    ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
]))
story += [table, Spacer(1, 9), Paragraph(rich(lines[-1]), small)]

def footer(canvas, doc):
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(colors.HexColor('#607183'))
    canvas.drawString(36, 22, 'Review draft | Evidence register: docs/pilot-privacy/05-evidence-and-launch-checklist.md')
    canvas.drawRightString(A4[0]-36, 22, str(doc.page))

SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=36, leftMargin=36, topMargin=30, bottomMargin=35, title='CardSnap Privacy Facts Sheet', author='Vision71 - review draft').build(story, onFirstPage=footer, onLaterPages=footer)
pdf = PdfReader(OUTPUT)
assert len(pdf.pages) == 1, f'Expected one page, got {len(pdf.pages)}'
text = pdf.pages[0].extract_text()
normalised = ' '.join(text.split())
assert 'End-of-pilot Vision71 access' in normalised and 'Release gate' in normalised
print(f'Created {OUTPUT}: {len(pdf.pages)} page, {len(text)} extracted characters')
