# -*- coding: utf-8 -*-
"""Render the Omaxe invoice-processing MOM as a formatted PDF."""
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

OUT = "/home/user/pmis-memory/meetings/omaxe-invoice-processing-mom.pdf"

NAVY = colors.HexColor("#1F3864")
SLATE = colors.HexColor("#44546A")
RULE = colors.HexColor("#C9D0DC")
BAND = colors.HexColor("#EEF1F6")
INK = colors.HexColor("#212121")

MARGIN = 0.7 * inch
PAGE_W, PAGE_H = A4
USABLE = PAGE_W - 2 * MARGIN

ss = getSampleStyleSheet()

S = {
    "title": ParagraphStyle("title", parent=ss["Normal"], fontName="Helvetica-Bold",
                            fontSize=17, leading=21, textColor=NAVY, spaceAfter=2),
    "subtitle": ParagraphStyle("subtitle", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=10.5, leading=14, textColor=SLATE),
    "h1": ParagraphStyle("h1", parent=ss["Normal"], fontName="Helvetica-Bold",
                         fontSize=12, leading=15, textColor=NAVY,
                         spaceBefore=15, spaceAfter=6),
    "h2": ParagraphStyle("h2", parent=ss["Normal"], fontName="Helvetica-Bold",
                         fontSize=10.5, leading=13.5, textColor=SLATE,
                         spaceBefore=10, spaceAfter=4),
    "body": ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=9.8, leading=13.5, textColor=INK,
                           alignment=TA_JUSTIFY, spaceAfter=5),
    "bullet": ParagraphStyle("bullet", parent=ss["Normal"], fontName="Helvetica",
                             fontSize=9.8, leading=13.5, textColor=INK,
                             leftIndent=14, bulletIndent=3, spaceAfter=4),
    "subbullet": ParagraphStyle("subbullet", parent=ss["Normal"], fontName="Helvetica",
                                fontSize=9.5, leading=13, textColor=INK,
                                leftIndent=30, bulletIndent=19, spaceAfter=3),
    "note": ParagraphStyle("note", parent=ss["Normal"], fontName="Helvetica-Oblique",
                           fontSize=8.8, leading=12, textColor=SLATE, spaceAfter=4),
    "callout": ParagraphStyle("callout", parent=ss["Normal"], fontName="Helvetica-Oblique",
                              fontSize=9.2, leading=12.5, textColor=SLATE,
                              leftIndent=10, rightIndent=8,
                              spaceBefore=4, spaceAfter=4),
    "th": ParagraphStyle("th", parent=ss["Normal"], fontName="Helvetica-Bold",
                         fontSize=9.2, leading=12, textColor=colors.white),
    "td": ParagraphStyle("td", parent=ss["Normal"], fontName="Helvetica",
                         fontSize=9.2, leading=12.2, textColor=INK),
    "tdb": ParagraphStyle("tdb", parent=ss["Normal"], fontName="Helvetica-Bold",
                          fontSize=9.2, leading=12.2, textColor=NAVY),
}


def P(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items, style="bullet"):
    return [Paragraph(t, S[style], bulletText="•") for t in items]


def grid(header, rows, widths, bold_first_col=False):
    data = [[Paragraph(h, S["th"]) for h in header]]
    for r in rows:
        cells = []
        for i, c in enumerate(r):
            st = "tdb" if (bold_first_col and i == 0) else "td"
            cells.append(Paragraph(c, S[st]))
        data.append(cells)
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), BAND))
    t.setStyle(TableStyle(style))
    return t


def callout(text):
    t = Table([[Paragraph(text, S["callout"])]], colWidths=[USABLE], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BAND),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def meta_block(pairs):
    data = [[Paragraph(k, S["tdb"]), Paragraph(v, S["td"])] for k, v in pairs]
    t = Table(data, colWidths=[1.45 * inch, USABLE - 1.45 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def decorate(canvas, doc):
    canvas.saveState()
    # header
    canvas.setFont("Helvetica", 7.8)
    canvas.setFillColor(SLATE)
    canvas.drawString(MARGIN, PAGE_H - MARGIN + 16, "MINUTES OF MEETING")
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN + 16,
                           "OMAXE — INVOICE PROCESSING")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, PAGE_H - MARGIN + 11, PAGE_W - MARGIN, PAGE_H - MARGIN + 11)
    # footer
    canvas.line(MARGIN, MARGIN - 14, PAGE_W - MARGIN, MARGIN - 14)
    canvas.setFont("Helvetica", 7.8)
    canvas.drawString(MARGIN, MARGIN - 25, "Draft for circulation — prepared from handwritten meeting notes")
    canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 25, "Page %d" % doc.page)
    canvas.restoreState()


story = []
a = story.append

a(P("Minutes of Meeting", "title"))
a(P("Omaxe — Invoice Processing", "subtitle"))
a(Spacer(1, 10))
a(meta_block([
    ("Subject", "API integration for PAN &amp; GST compliance, vendor validation and master data"),
    ("Project / Workstream", "Omaxe — Invoice Processing automation"),
    ("Date", "<i>Not recorded in source notes — to be confirmed</i>"),
    ("Prepared from", "Handwritten meeting notes"),
    ("Status", "Draft for circulation"),
]))
a(Spacer(1, 4))

# 1. Attendees
a(P("1. Attendees", "h1"))
a(grid(["Name", "Note"],
       [["Raghu", ""], ["Sandeep", ""], ["Dileep", ""],
        ["Udit", "Main Director of the department"]],
       [1.8 * inch, USABLE - 1.8 * inch], bold_first_col=True))
a(Spacer(1, 4))
a(P("Designations other than Udit’s were not captured in the notes; please confirm before circulation.", "note"))

# 2. Agenda
a(P("2. Agenda", "h1"))
a(P("Scope discussion for automating Omaxe’s invoice processing, with the first item being "
    "API-led PAN &amp; GST compliance checks on vendors."))

# 3. Discussion
a(P("3. Discussion", "h1"))

a(P("3.1&nbsp;&nbsp;API Integration for PAN &amp; GST Compliance (Item 1)", "h2"))
a(P("The primary requirement is API integration to validate vendor PAN and GST compliance at the "
    "point of invoice processing. Checks identified:"))
for b in bullets([
    "<b>MSME certification and its category</b> — the vendor’s MSME status must be verified "
    "along with the category: <b>Manufacturing / Trading / Services</b>.",
    "<b>CIN number verification</b> — verify the vendor’s Corporate Identity Number.",
    "<b>Payment due date setting</b> — to be derived from the above (MSME status in particular "
    "drives statutory payment timelines). <i>Open point — flagged with a question mark in the notes.</i>",
    "<b>TDS calculation logic</b> — deduction logic to be built and driven by the verified vendor "
    "attributes, feeding overall compliance.",
]):
    a(b)
a(Spacer(1, 3))
a(P("<b>Delivery approach:</b> integration to be done via a <b>third-party ISP / service provider</b> "
    "rather than built in-house. Assessed as <b>easy to be done</b> (low effort / low risk)."))
a(callout("Note: for GST APIs this is typically a GSP/ASP-type provider. Confirm the exact provider "
          "category intended by “ISP” before the requirement is finalised."))

a(P("3.2&nbsp;&nbsp;Compliance — GST Filing Checks", "h2"))
a(bullets(["<b>GST filing report of vendors</b> — obtain and track vendors’ GST filing status."])[0])
a(bullets(["<b>Validation basis:</b> invoice number and a copy of <b>GSTR-1</b>, matched against the "
           "invoice submitted."], "subbullet")[0])
a(bullets(["<b>GST filing by Omaxe</b> — the same discipline applies in reverse, i.e. where "
           "<b>Omaxe is the vendor</b>, Omaxe’s own GST filing must be covered."])[0])

a(P("3.3&nbsp;&nbsp;Master Data", "h2"))
for b in bullets([
    "<b>Master creation, with real-time refresh for critical data points (API-led).</b> Non-critical "
    "fields can remain static; critical compliance fields must be refreshed live via API.",
    "<b>Payment terms master</b> — payment terms to be held in a master and validated "
    "<b>against the terms mentioned on the invoice / PO</b>.",
    "Data points to be sourced and reconciled across: <b>PO</b>, <b>Vendor Master</b> and "
    "<b>MSME</b> status.",
]):
    a(b)

# 4. Decisions
a(KeepTogether([
    P("4. Decisions Taken", "h1"),
    grid(["#", "Decision"], [
        ["D1", "PAN &amp; GST compliance validation will be delivered through <b>API integration</b>, "
               "not manual checks."],
        ["D2", "Integration to be routed through a <b>third-party service provider</b>; effort assessed as low."],
        ["D3", "Vendor validation scope to include <b>MSME certification + category, CIN verification, "
               "TDS logic, and payment due date derivation</b>."],
        ["D4", "Vendor GST filing to be validated using <b>invoice number + GSTR-1 copy</b>."],
        ["D5", "A <b>master</b> will be created, with <b>critical data points refreshed in real time via API</b>."],
        ["D6", "<b>Payment terms</b> will be maintained in a master and reconciled against invoice / PO terms."],
    ], [0.42 * inch, USABLE - 0.42 * inch], bold_first_col=True),
]))

# 5. Action items
a(P("5. Action Items", "h1"))
a(grid(["#", "Action", "Owner", "Due"], [
    ["A1", "Shortlist and evaluate the third-party provider for PAN / GST / MSME / CIN verification "
           "APIs; confirm commercials and turnaround", "TBC", "TBC"],
    ["A2", "Define the MSME verification flow, including capture of category "
           "(Manufacturing / Trading / Services)", "TBC", "TBC"],
    ["A3", "Build CIN number verification into the vendor onboarding / invoice intake check", "TBC", "TBC"],
    ["A4", "Finalise payment due date logic (statutory MSME timelines vs. contracted terms) — "
           "<b>open question, needs a decision</b>", "TBC", "TBC"],
    ["A5", "Document TDS calculation logic (section-wise rates, thresholds, vendor-attribute "
           "dependencies) and map it to the compliance output", "TBC", "TBC"],
    ["A6", "Set up the vendor GST filing report; define the invoice-number-to-GSTR-1 matching rule "
           "and the exception / hold treatment", "TBC", "TBC"],
    ["A7", "Cover Omaxe’s own GST filing for cases where Omaxe is the vendor", "TBC", "TBC"],
    ["A8", "Define the master data model: field list, source of truth, and which fields are "
           "“critical” (real-time API refresh) vs. static", "TBC", "TBC"],
    ["A9", "Create the payment terms master and define the validation rule against invoice / PO terms, "
           "including precedence between PO, Master and MSME status", "TBC", "TBC"],
], [0.42 * inch, USABLE - 0.42 * inch - 1.75 * inch, 0.95 * inch, 0.8 * inch], bold_first_col=True))
a(Spacer(1, 4))
a(P("Owners were not assigned in the source notes. Please allocate before circulation.", "note"))

# 6. Open questions
a(P("6. Open Questions", "h1"))
for i, q in enumerate([
    "<b>Payment due date setting</b> — what is the rule? Statutory MSME timeline, PO terms, or "
    "vendor master terms, and which takes precedence?",
    "<b>Precedence between PO, Vendor Master and MSME status</b> where payment terms conflict.",
    "<b>“Third-party ISP”</b> — confirm the exact provider type / name intended "
    "(GSP/ASP for GST, NSDL / Protean-type for PAN, Udyam for MSME, MCA for CIN).",
    "Which data points qualify as <b>“critical”</b> and therefore need real-time API refresh?",
    "What is the <b>exception handling</b> when a vendor fails a compliance check — block the "
    "invoice, hold payment, or flag and proceed?",
], start=1):
    a(Paragraph(q, S["bullet"], bulletText="%d." % i))

# 7. Next steps
NEXT_STEPS = [
    "Assign owners and target dates against the action items above.",
    "Confirm the provider approach (A1) — this gates most of the API-led scope.",
    "Close the payment due date question (A4) before TDS and payment-terms logic is built on top of it.",
]
a(KeepTogether([P("7. Next Steps", "h1")] + bullets(NEXT_STEPS)))

doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=MARGIN, bottomMargin=MARGIN,
                      title="Minutes of Meeting — Omaxe: Invoice Processing",
                      author="", subject="Omaxe invoice processing — MOM")
frame = Frame(MARGIN, MARGIN, USABLE, PAGE_H - 2 * MARGIN, id="body",
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=decorate)])
doc.build(story)
print("built", OUT)
