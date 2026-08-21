# -*- coding: utf-8 -*-
"""Render the Omaxe invoice-processing MOM as a PDF: a flat list of pointers discussed."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer)

OUT = "/home/user/pmis-memory/meetings/omaxe-invoice-processing-mom.pdf"

NAVY = colors.HexColor("#1F3864")
SLATE = colors.HexColor("#44546A")
RULE = colors.HexColor("#C9D0DC")
INK = colors.HexColor("#212121")

MARGIN = 0.8 * inch
PAGE_W, PAGE_H = A4
USABLE = PAGE_W - 2 * MARGIN

ss = getSampleStyleSheet()
TITLE = ParagraphStyle("title", parent=ss["Normal"], fontName="Helvetica-Bold",
                       fontSize=15, leading=19, textColor=NAVY, spaceAfter=3)
SUB = ParagraphStyle("sub", parent=ss["Normal"], fontName="Helvetica",
                     fontSize=9.5, leading=13, textColor=SLATE, spaceAfter=14)
POINT = ParagraphStyle("point", parent=ss["Normal"], fontName="Helvetica",
                       fontSize=10.5, leading=15.5, textColor=INK,
                       leftIndent=15, bulletIndent=2, spaceAfter=8)
SUBPOINT = ParagraphStyle("subpoint", parent=ss["Normal"], fontName="Helvetica",
                          fontSize=10, leading=14.5, textColor=INK,
                          leftIndent=33, bulletIndent=20, spaceAfter=5)

# (text, is_sub_point)
POINTS = [
    ("Omaxe — invoice processing. Discussed with <b>Raghu</b>, <b>Sandeep</b>, "
     "<b>Dileep</b> and <b>Udit</b> (main director of the department).", False),
    ("Point 1: <b>API integration for PAN &amp; GST compliance</b>.", False),
    ("Integration to be done through a <b>3rd party ISP</b> — easy to be done.", False),
    ("<b>MSME certification and its category</b> — manufacturing / trading / services.", False),
    ("<b>CIN number verification</b>.", False),
    ("<b>Payment due date setting</b> (?).", False),
    ("<b>TDS calculation logic</b> — for compliance.", False),
    ("<b>GST filing report of vendors</b>.", False),
    ("Validation on <b>invoice number</b> and <b>GSTR-1 copy</b>.", True),
    ("<b>GST filing by Omaxe</b>, for cases where Omaxe is the vendor.", False),
    ("<b>Master creation</b>, plus <b>real time for critical data points</b> (API led).", False),
    ("<b>Payment terms master</b> — against the terms mentioned in the invoice / PO.", False),
    ("PO", True),
    ("Master", True),
    ("MSME", True),
]


def decorate(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, MARGIN - 16, PAGE_W - MARGIN, MARGIN - 16)
    canvas.setFont("Helvetica", 7.8)
    canvas.setFillColor(SLATE)
    canvas.drawString(MARGIN, MARGIN - 27, "MOM — Omaxe: Invoice Processing")
    canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 27, "Page %d" % doc.page)
    canvas.restoreState()


story = [
    Paragraph("MOM — Omaxe: Invoice Processing", TITLE),
    Paragraph("Points discussed", SUB),
]
for text, is_sub in POINTS:
    story.append(Paragraph(text, SUBPOINT if is_sub else POINT,
                           bulletText="–" if is_sub else "•"))
story.append(Spacer(1, 2))

doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=MARGIN, bottomMargin=MARGIN,
                      title="MOM — Omaxe: Invoice Processing",
                      author="", subject="Omaxe invoice processing — points discussed")
frame = Frame(MARGIN, MARGIN, USABLE, PAGE_H - 2 * MARGIN, id="body",
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=decorate)])
doc.build(story)
print("built", OUT)
