# -*- coding: utf-8 -*-
"""Render the Omaxe invoice-processing MOMs as PDFs (one file per meeting)."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph

OUT_DIR = "/home/user/pmis-memory/meetings"

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
HEAD = ParagraphStyle("head", parent=ss["Normal"], fontName="Helvetica-Bold",
                      fontSize=11.5, leading=15, textColor=NAVY,
                      spaceBefore=12, spaceAfter=8)
POINT = ParagraphStyle("point", parent=ss["Normal"], fontName="Helvetica",
                       fontSize=10.5, leading=15.5, textColor=INK,
                       leftIndent=15, bulletIndent=2, spaceAfter=8)
SUBPOINT = ParagraphStyle("subpoint", parent=ss["Normal"], fontName="Helvetica",
                          fontSize=10, leading=14.5, textColor=INK,
                          leftIndent=33, bulletIndent=20, spaceAfter=5)

# Each meeting: (filename, date label, "discussed with" line, sections)
# A section is (heading or None, [(text, level), ...]); level 0 = bullet, 1 = sub-bullet.
MEETINGS = [
    (
        "omaxe-invoice-processing-mom-2026-08-20.pdf",
        "20th August, 2026",
        "Discussed with Raghu, Sandeep, Dileep and Udit",
        [(None, [
            ("Omaxe — invoice processing. Discussed with <b>Raghu</b>, <b>Sandeep</b>, "
             "<b>Dileep</b> and <b>Udit</b> (main director of the department).", 0),
            ("Point 1: <b>API integration for PAN &amp; GST compliance</b>.", 0),
            ("Integration to be done through a <b>3rd party ISP</b> — easy to be done.", 0),
            ("<b>MSME certification and its category</b> — manufacturing / trading / services.", 0),
            ("<b>CIN number verification</b>.", 0),
            ("<b>Payment due date setting</b> (?).", 0),
            ("<b>TDS calculation logic</b> — for compliance.", 0),
            ("<b>GST filing report of vendors</b>.", 0),
            ("Validation on <b>invoice number</b> and <b>GSTR-1 copy</b>.", 1),
            ("<b>GST filing by Omaxe</b>, for cases where Omaxe is the vendor.", 0),
            ("<b>Master creation</b>, plus <b>real time for critical data points</b> (API led).", 0),
            ("<b>Payment terms master</b> — against the terms mentioned in the invoice / PO.", 0),
            ("PO", 1),
            ("Master", 1),
            ("MSME", 1),
        ])],
    ),
    (
        "omaxe-invoice-processing-mom-2026-08-14.pdf",
        "14th August, 2026",
        "Discussed with — to be confirmed",
        [
            ("Points discussed -", [
                ("<b>Later on option</b> -", 0),
                ("GST no. of vendor to be verified directly from the <b>GST website</b>", 1),
                ("<b>Address of vendor</b> to be verified from the GST website", 1),
                ("<b>PAN operative &amp; inoperative</b> status to be checked", 0),
                ("<b>GST input</b> — GST not deposited by the vendor", 0),
                ("<b>Unpaid invoice ageing</b>", 0),
                ("<b>Favouritism in payments</b> to be checked", 0),
                ("<b>MSME payment timelines</b>", 0),
                ("<b>Payment status</b> to be updated — Paid / Partly paid / Unpaid", 0),
                ("<b>Sign</b> (like Adobe Sign)", 0),
                ("<b>LIFO, FIFO</b>", 0),
                ("<b>Rules break report</b>", 0),
                ("<b>Scanner option</b> — attachment input", 0),
                ("Original scan attached at <b>Level 1</b>", 1),
                ("Second scan done by the auditor at <b>Level 2</b>", 1),
                ("Verify both attachments and ensure they are true", 1),
            ]),
            ("Product capabilities to be built -", [
                ("<b>API integration and real time validation</b> -", 0),
                ("GST no. verification directly from the GST portal (later on option)", 1),
                ("Vendor address verification from the GST portal (later on option)", 1),
                ("PAN operative / inoperative status check", 1),
                ("<b>Compliance</b> -", 0),
                ("GST input tracking — flag invoices where GST has not been deposited by the vendor", 1),
                ("MSME payment timeline tracking", 1),
                ("<b>Payment processing</b> -", 0),
                ("Payment status — Paid / Partly paid / Unpaid", 1),
                ("Payment sequencing — LIFO / FIFO", 1),
                ("Favouritism check on the payment order", 1),
                ("<b>Reports</b> -", 0),
                ("Unpaid invoice ageing", 1),
                ("Rules break report", 1),
                ("<b>Document management</b> -", 0),
                ("Scanner option for attachment input", 1),
                ("Two level scan — Level 1 original scan, Level 2 auditor scan, "
                 "with verification of both", 1),
                ("<b>E-sign integration</b> (Adobe Sign or similar)", 0),
            ]),
        ],
    ),
]


def make_decorator(date_label):
    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, MARGIN - 16, PAGE_W - MARGIN, MARGIN - 16)
        canvas.setFont("Helvetica", 7.8)
        canvas.setFillColor(SLATE)
        canvas.drawString(MARGIN, MARGIN - 27,
                          "MOM — Omaxe: Invoice Processing, %s" % date_label)
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 27, "Page %d" % doc.page)
        canvas.restoreState()
    return decorate


def build(filename, date_label, attendees, sections):
    path = "%s/%s" % (OUT_DIR, filename)
    title = "MOM — Omaxe: Invoice Processing, %s" % date_label
    story = [Paragraph(title, TITLE), Paragraph(attendees, SUB)]
    for heading, points in sections:
        if heading:
            story.append(Paragraph(heading, HEAD))
        for text, level in points:
            style = SUBPOINT if level else POINT
            story.append(Paragraph(text, style, bulletText="–" if level else "•"))

    doc = BaseDocTemplate(path, pagesize=A4,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=MARGIN,
                          title=title, author="",
                          subject="Omaxe invoice processing — points discussed")
    frame = Frame(MARGIN, MARGIN, USABLE, PAGE_H - 2 * MARGIN, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame],
                                       onPage=make_decorator(date_label))])
    doc.build(story)
    print("built", path)


for meeting in MEETINGS:
    build(*meeting)
