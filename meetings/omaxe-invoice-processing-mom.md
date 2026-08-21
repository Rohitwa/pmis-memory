# Minutes of Meeting — Omaxe: Invoice Processing

**Project / Workstream:** Omaxe — Invoice Processing automation
**Subject:** API integration for PAN & GST compliance, vendor validation and master data
**Date:** _Not recorded in source notes — to be confirmed_
**Prepared from:** Handwritten meeting notes
**Status:** Draft for circulation

---

## 1. Attendees

| Name | Note |
|---|---|
| Raghu | |
| Sandeep | |
| Dileep | |
| Udit | Main Director of the department |

_Designations other than Udit's were not captured in the notes; please confirm before circulation._

---

## 2. Agenda

Scope discussion for automating Omaxe's invoice processing, with the first item being API-led PAN & GST compliance checks on vendors.

---

## 3. Discussion

### 3.1 API Integration for PAN & GST Compliance (Item 1)

The primary requirement is API integration to validate vendor PAN and GST compliance at the point of invoice processing. Checks identified:

- **MSME certification and its category** — the vendor's MSME status must be verified along with the category: **Manufacturing / Trading / Services**.
- **CIN number verification** — verify the vendor's Corporate Identity Number.
- **Payment due date setting** — to be derived from the above (MSME status in particular drives statutory payment timelines). *Open point — flagged with a question mark in the notes.*
- **TDS calculation logic** — deduction logic to be built and driven by the verified vendor attributes, feeding overall compliance.

**Delivery approach:** Integration to be done via a **third-party ISP / service provider** rather than built in-house. Assessed as **easy to be done** (low effort / low risk).

> Note: for GST APIs this is typically a GSP/ASP-type provider. Confirm the exact provider category intended by "ISP" before the requirement is finalised.

### 3.2 Compliance — GST Filing Checks

- **GST filing report of vendors** — obtain and track vendors' GST filing status.
  - **Validation basis:** invoice number and a copy of **GSTR-1**, matched against the invoice submitted.
- **GST filing by Omaxe** — the same discipline applies in reverse, i.e. where **Omaxe is the vendor**, Omaxe's own GST filing must be covered.

### 3.3 Master Data

- **Master creation, with real-time refresh for critical data points (API-led).** Non-critical fields can remain static; critical compliance fields must be refreshed live via API.
- **Payment terms master** — payment terms to be held in a master and validated **against the terms mentioned on the invoice / PO**.
- Data points to be sourced/reconciled across:
  - **PO**
  - **Vendor Master**
  - **MSME** status

---

## 4. Decisions Taken

| # | Decision |
|---|---|
| D1 | PAN & GST compliance validation will be delivered through **API integration**, not manual checks. |
| D2 | Integration to be routed through a **third-party service provider**; effort assessed as low. |
| D3 | Vendor validation scope to include **MSME certification + category, CIN verification, TDS logic, and payment due date derivation**. |
| D4 | Vendor GST filing to be validated using **invoice number + GSTR-1 copy**. |
| D5 | A **master** will be created, with **critical data points refreshed in real time via API**. |
| D6 | **Payment terms** will be maintained in a master and reconciled against invoice/PO terms. |

---

## 5. Action Items

| # | Action | Owner | Due |
|---|---|---|---|
| A1 | Shortlist and evaluate the third-party provider for PAN / GST / MSME / CIN verification APIs; confirm commercials and turnaround | TBC | TBC |
| A2 | Define the MSME verification flow, including capture of category (Manufacturing / Trading / Services) | TBC | TBC |
| A3 | Build CIN number verification into the vendor onboarding / invoice intake check | TBC | TBC |
| A4 | Finalise payment due date logic (statutory MSME timelines vs. contracted terms) — **open question, needs a decision** | TBC | TBC |
| A5 | Document TDS calculation logic (section-wise rates, thresholds, vendor-attribute dependencies) and map it to the compliance output | TBC | TBC |
| A6 | Set up the vendor GST filing report; define the invoice number ↔ GSTR-1 matching rule and the exception/hold treatment | TBC | TBC |
| A7 | Cover Omaxe's own GST filing for cases where Omaxe is the vendor | TBC | TBC |
| A8 | Define the master data model: field list, source of truth, and which fields are "critical" (real-time API refresh) vs. static | TBC | TBC |
| A9 | Create the payment terms master and define the validation rule against invoice/PO terms, including precedence between PO, Master and MSME status | TBC | TBC |

_Owners were not assigned in the source notes. Please allocate before circulation._

---

## 6. Open Questions

1. **Payment due date setting** — what is the rule? Statutory MSME timeline, PO terms, or vendor master terms, and which takes precedence?
2. **Precedence between PO, Vendor Master and MSME status** where payment terms conflict.
3. **"Third-party ISP"** — confirm the exact provider type/name intended (GSP/ASP for GST APIs, NSDL/Protean-type for PAN, Udyam for MSME, MCA for CIN).
4. Which data points qualify as **"critical"** and therefore need real-time API refresh?
5. What is the **exception handling** when a vendor fails a compliance check — block the invoice, hold payment, or flag and proceed?

---

## 7. Next Steps

- Assign owners and target dates against the action items above.
- Confirm the provider approach (A1) — this gates most of the API-led scope.
- Close the payment due date question (A4) before TDS and payment-terms logic is built on top of it.
