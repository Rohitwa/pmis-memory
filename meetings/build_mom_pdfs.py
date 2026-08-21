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
SUB_TIGHT = ParagraphStyle("subtight", parent=SUB, spaceAfter=5)
HEAD = ParagraphStyle("head", parent=ss["Normal"], fontName="Helvetica-Bold",
                      fontSize=11.5, leading=15, textColor=NAVY,
                      spaceBefore=12, spaceAfter=8)
POINT = ParagraphStyle("point", parent=ss["Normal"], fontName="Helvetica",
                       fontSize=10.5, leading=15.5, textColor=INK,
                       leftIndent=15, bulletIndent=2, spaceAfter=8)
SUBPOINT = ParagraphStyle("subpoint", parent=ss["Normal"], fontName="Helvetica",
                          fontSize=10, leading=14.5, textColor=INK,
                          leftIndent=33, bulletIndent=20, spaceAfter=5)

# Each meeting: (filename, workstream, date label, intro line(s), sections)
# A section is (heading or None, [(text, level), ...]); level 0 = bullet, 1 = sub-bullet.
MEETINGS = [
    (
        "omaxe-invoice-processing-mom-2026-08-20.pdf",
        "Invoice Processing",
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
        "Invoice Processing",
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
    (
        "omaxe-perfo-processing-mom-2026-08-09.pdf",
        "Perfo Processing",
        "9th August, 2026",
        ["Discussed with Kapil",
         "<b>Scope</b> — Kapil’s work on Perfo processing, covering interest waiver, assured return "
         "and its calculations from the term sheet, refund adjustment via affidavit processing, and "
         "dealer commission and invoicing."],
        [
            ("Points discussed -", [
                ("<b>No. of cases</b> — closed, open and pending, and <b>pending on whose head</b>", 0),
                ("<b>Project wise, region wise</b> and overall views", 0),
                ("<b>Date wise</b> view", 0),
                ("<b>TAT breaches</b>, and the amount of breach in days", 0),
                ("<b>Interest amount input</b>", 0),
                ("<b>Report download with attachment</b>", 0),
                ("Region wise / project wise <b>amount, waiver amount and discount</b>", 0),
                ("<b>Drill down</b> — overall &gt; region &gt; project &gt; date", 0),
                ("<b>TAT breaches</b>", 0),
                ("<b>Project wise policy doc</b> — including interest rates, RERA and payment plan", 0),
                ("<b>CRM reverts</b> in case of any findings based on policy", 0),
                ("<b>Approved / rejected</b> after checks and balances", 0),
                ("<b>Reduction rights</b> are there, but <b>increase rights are not</b> there", 0),
                ("Where a <b>Perfo issue</b> is found, rights currently allow the case to be sent "
                 "back only to the sender", 0),
                ("User wants <b>forwarding rights</b> to the id", 1),
                ("<b>Mail builder</b> based on the observation, so that the information can be "
                 "shared with the users", 1),
                ("<b>Case closure mail</b> and post approval analysis", 0),
                ("Approval should be <b>on the go on phone</b> — preferred; print is not preferred, "
                 "<b>paperless is the need</b>", 0),
                ("User wants a <b>Gmail like interface</b> — multi select, click, and a detailed "
                 "view appears to analyse and check", 0),
                ("<b>Interest, penalty</b>", 0),
                ("<b>Input type</b> — Excel with attachment", 0),
            ]),
            ("Product capabilities to be built -", [
                ("<b>Dashboard and reporting</b> -", 0),
                ("Case status — closed / open / pending, with pendency mapped to the owner it is "
                 "pending on", 1),
                ("Drill down — overall &gt; region &gt; project &gt; date, with project wise, "
                 "region wise, date wise and overall views", 1),
                ("TAT breach tracking, with the extent of breach in days", 1),
                ("Region wise / project wise amount, waiver amount and discount", 1),
                ("Report download with attachments", 1),
                ("Post approval analysis", 1),
                ("<b>Calculations and inputs</b> -", 0),
                ("Interest amount input", 1),
                ("Interest and penalty computation", 1),
                ("Assured return calculation from the term sheet", 1),
                ("Input via Excel with attachment", 1),
                ("<b>Policy and controls</b> -", 0),
                ("Project wise policy document — interest rates, RERA, payment plan", 1),
                ("Validation of cases against the policy, with CRM revert on findings", 1),
                ("Approve / reject after checks and balances", 1),
                ("Rights — reduction allowed, increase not allowed", 1),
                ("<b>Workflow and communication</b> -", 0),
                ("Forwarding rights to another id, in addition to the current send back to sender", 1),
                ("Mail builder driven by the observation recorded on the case", 1),
                ("Case closure mail", 1),
                ("<b>User experience</b> -", 0),
                ("Approval on the go on mobile; paperless, no print", 1),
                ("Gmail like case list — multi select, click through to a detailed view for analysis", 1),
            ]),
        ],
    ),
]


def make_decorator(footer):
    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, MARGIN - 16, PAGE_W - MARGIN, MARGIN - 16)
        canvas.setFont("Helvetica", 7.8)
        canvas.setFillColor(SLATE)
        canvas.drawString(MARGIN, MARGIN - 27, footer)
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 27, "Page %d" % doc.page)
        canvas.restoreState()
    return decorate


def build(filename, workstream, date_label, attendees, sections):
    path = "%s/%s" % (OUT_DIR, filename)
    title = "MOM — Omaxe: %s, %s" % (workstream, date_label)
    intro = attendees if isinstance(attendees, (list, tuple)) else [attendees]
    story = [Paragraph(title, TITLE)]
    for i, line in enumerate(intro):
        story.append(Paragraph(line, SUB if i == len(intro) - 1 else SUB_TIGHT))
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
                                       onPage=make_decorator(title))])
    doc.build(story)
    print("built", path)


for meeting in MEETINGS:
    build(*meeting)
