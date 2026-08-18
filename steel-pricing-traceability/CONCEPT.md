# Metal Cost Traceability for Auto Component Makers — Concept Note

**Status:** Draft v1 · 2026-08-18
**One-liner:** An agentic "metal cost ledger" that traces actual metal cost per part number across the value chain, quantifies pricing leakage against index-linked payment mechanisms, and auto-generates evidence-backed price adjustment claims — so component makers stop losing margin they are contractually owed.

---

## 1. The problem, stated precisely

The original observation: sourcing prices of steel and other metals for auto industries are market-linked, but the payment mechanism for value-added products is hedged against an index, because there is no mechanism to link pricing to the product in real time. Large companies operate on thin margins or losses because a high share of their cost is metal.

That is correct, but to make it fundable and buildable it needs to be decomposed. The margin loss is not one problem — it is **four distinct, measurable gaps** between what a component maker pays for metal and what it gets reimbursed:

1. **Timing lag.** OEM contracts carry a Raw Material Price Adjustment / Price Variance Clause (PVC) that resets part prices quarterly (sometimes semi-annually), based on the *previous* period's reference price. During a price spike the supplier buys high and is paid at last quarter's reference. Even when eventually "recovered", the working-capital and P&L hit inside the lag window is real.

2. **Basis mismatch.** The reference index (CRU, Platts, MEPS, BigMint/SteelMint in India, LME for aluminium/copper) tracks a benchmark grade and geography — e.g., commodity HRC ex-Mumbai. The supplier actually buys specific grades — boron-alloyed CRCA, spring steel, forging-quality bar — whose premiums over the benchmark move independently. Index-linked recovery ≠ actual cost movement.

3. **Incomplete pass-through.** Negotiated recovery factors are typically 70–90% of the index delta. Scrap credits are netted at assumed (not actual) scrap prices. Yield/input-weight assumptions are frozen at quotation time; actual yields drift.

4. **The traceability gap (root cause).** Nobody can *prove*, per part number, how much metal of which grade at what actual purchase price went into the parts shipped in a given month. So price adjustment becomes a quarterly negotiation over spreadsheets, claims get disputed, settled late and partially — and Tier-2/3 suppliers, who often have no PVC at all with their Tier-1 customers, absorb the residual.

For a typical auto ancillary with 55–70% raw material cost and 4–8% EBITDA margin, total leakage across these four gaps in a volatile year is commonly 1–3% of revenue. That is the prize.

**Why hedging doesn't solve it:** steel derivatives liquidity is thin (LME HRC/scrap; NCDEX in India), contract grades don't match purchased grades (basis risk again), and mid-size component makers lack treasury capability. Hedging treats the symptom at the company level; the disease is at the part level.

---

## 2. The reframe (the most important improvement)

**Do not pitch "real-time pricing across the value chain" — that requires changing how OEMs contract, which a startup cannot force on day one.**

Pitch instead: **"Recover the money you are already contractually owed — fully, faster, and with evidence."** Maximizing recovery under *existing* PVC clauses is a bottom-line number a CFO will sign for, requires no OEM cooperation to start, and builds exactly the traceability asset that later enables the bigger vision (real-time, multi-tier, contract redesign).

Traceability is the *means*. Recovered margin is the *product*.

---

## 3. What the agentic system actually does

### The Metal Cost Ledger (core asset)
A continuously maintained, per-part-number genealogy:

```
Part number → BOM metal content (gross weight × grade, from drawings/routings)
           → actual purchase lots consumed (mill invoices, test certificates, heat numbers, GRNs)
           → actual landed cost per kg, net of actual scrap realization
           → actual metal cost per part shipped, per month
   vs.
OEM price amendment letters + reference index publications
           → reimbursed metal cost per part, per month
   =
Leakage per part per month, decomposed into: lag / basis / recovery-factor / yield components
```

### Agent roles
- **Document ingestion agents** — extract structured data from what is today trapped in PDFs, emails, and Excel annexures: mill invoices, mill test certificates (grade + heat number), POs, GRNs, BOMs, engineering drawings (net/gross weight), OEM price circulars and amendment letters, index publications, scrap sale invoices.
- **Reconciliation agent** — maps purchase lots to parts via BOM + consumption records; flags gaps and anomalies (yield drift, grade substitutions) for human review rather than guessing.
- **Leakage analytics agent** — computes the decomposed leakage number above; maintains it live.
- **Claim generation agent** — assembles the quarterly PVC claim in *each OEM's own format*, with a full evidence trail (invoice → certificate → part → shipment), and drafts dispute responses. This is where the money is collected.
- **Negotiation intelligence agent** — back-tests contract terms (index choice, reset frequency, recovery %, scrap credit convention) against price history to show what each clause costs in ₹/year; arms the sales team at the next contract renewal.
- **(Later) Exposure advisor** — quantifies residual unhedgeable exposure and suggests instrument overlays. Advisory only; execution has regulatory weight.

### Why agentic, specifically (the honest answer)
The data is unstructured, cross-system, and judgment-laden: every OEM's PVC format differs, BOM-to-lot mapping needs reasoning, claims need narrative plus evidence assembly. That is document-understanding + reasoning work, not classic ETL — which is exactly why 20 years of ERP price-amendment modules haven't solved it. "Agentic" is the enabler here, not the pitch.

---

## 4. Go-to-market phasing

- **Phase 1 — Metal Margin Audit (services-led wedge).** 4–6 week diagnostic for a single Tier-1: one year of invoices, BOMs, price letters → a documented "you leaked ₹X crore last year, here's the per-part evidence." Charge for the audit; it de-risks the sale and trains the system on real documents.
- **Phase 2 — Continuous ledger + claim automation (SaaS).** Live leakage dashboard, auto-generated claim packages, dispute support. Pricing: platform fee + success fee on incremental recovery (aligns incentives, but cap it — CFOs distrust open-ended success fees).
- **Phase 3 — Network.** The Tier-1 extends the same mechanics to its Tier-2s (who suffer worse and have zero tooling); eventually OEMs adopt the ledger as a neutral settlement rail because it cuts *their* quarterly dispute burden too. This is where "pricing traceability across the value chain" is actually achieved — earned, not assumed.

---

## 5. Sizing sanity check (illustrative)

Supplier with ₹1,000 cr revenue, 60% RM cost (₹600 cr metal spend), steel moves 15% in a year:
- Lag gap alone ≈ one quarter's delta on RM spend ≈ ₹600 cr × 15% × ¼ ≈ **₹22 cr** timing exposure.
- Basis + recovery-factor + yield gaps typically add a comparable amount.
- Against a 6% EBITDA (₹60 cr), even recovering half the leakage moves earnings 15–25%.

(Numbers to be validated in Phase-1 audits; these are the shape, not the claim.)

---

## 6. Risks and honest unknowns

| Risk | Reality check |
|---|---|
| OEMs benefit from opacity | True — which is why the entry point is supplier-side, using data the supplier already owns. OEM adoption comes later, sold as dispute-cost reduction. |
| Data sensitivity across tiers | Per-company deployment first; multi-tier sharing only with contractual guardrails. |
| Index data licensing | CRU/Platts are expensive; in India, BigMint/SteelMint are more accessible. Budget for it. |
| ERP integration effort | Phase 1 deliberately avoids it — documents in, analysis out. Integration only after the value is proven. |
| Claims still settle by negotiation | The tool improves the position and speed; it cannot guarantee recovery. Never promise a recovery number upfront. |
| Accuracy bar | One wrong claim destroys trust. Human-in-the-loop review on every claim; agents propose, people submit. |

---

## 7. Immediate validation plan (next 4–8 weeks)

1. 8–10 interviews with CFOs / supply-chain heads at auto ancillaries (Pune, Chennai, Gurgaon clusters). Key questions: current PVC mechanics per OEM, who assembles the quarterly claim today, last year's disputed/unrecovered amount, would they pay for an audit.
2. Land 2–3 design partners for a paid/discounted Metal Margin Audit on one quarter of real documents.
3. Success gate: at least one audit where documented leakage > 10× the audit fee **and** the resulting claim (or renegotiation argument) is accepted by an OEM.
4. Only then commit to building the continuous platform.

---

## 8. Open decisions

- **Which side first?** This note assumes supplier-side (Tier-1) entry. An OEM-side or neutral-platform entry changes the product and sales motion entirely — decide before interviews.
- Which metal first: flat steel (largest spend, best indices) vs aluminium (cleaner LME linkage, simpler basis)?
- Geography: India-first (accessible indices, dense ancillary clusters, acute pain) vs global?
- Success-fee vs pure-SaaS pricing.
