# Metal Cost Ledger — Concept Note (for industry discussion)

**Part-level metal cost traceability for auto component manufacturers — so market-linked input costs stop leaking through index-linked selling prices.**

## The problem
Auto component makers buy steel, aluminium and other metals at prices that move with the market, but are reimbursed through raw-material price adjustment clauses that reset quarterly against a published index. Metal is typically 55–70% of cost, and the gap between what is actually paid for metal and what is actually recovered through part prices quietly compresses margins — in volatile years, often 1–3% of revenue, against EBITDA margins of 4–8%.

## Where the money leaks
- **Timing lag** — prices reset next quarter on last quarter's reference; during a spike you buy high and are paid at the old benchmark.
- **Basis mismatch** — the index tracks benchmark grades; you buy specific grades whose premiums move independently.
- **Incomplete pass-through** — recovery factors of 70–90%, scrap credits at assumed rather than actual prices, yield assumptions frozen at quotation.
- **No traceability** — nobody can prove, per part number, what metal at what actual price went in, so claims become quarterly spreadsheet negotiations, settled late and partially.

## The proposed solution
An AI-agent-driven **metal cost ledger**, maintained per part number. Agents read the documents where this data already lives — mill invoices, test certificates, BOMs and drawings, goods receipts, customer price circulars, index publications — and reconstruct the genealogy from each part shipped back to the actual metal lots and prices behind it.

From that single source of truth, the system continuously computes actual versus reimbursed metal cost per part, decomposes the leakage into the four gaps above, and **auto-assembles evidence-backed price adjustment claims** in each customer's own format — invoice to certificate to part to shipment.

## What it delivers
A live, defensible leakage number per part and per customer; faster and fuller settlement of claims already owed under existing contracts; and negotiation intelligence — a back-tested view of what each clause (index choice, reset frequency, recovery factor) actually costs per year, in hand before the next contract renewal.

## Where we are
We are validating this with industry practitioners and looking for one or two partners for a short **metal margin audit**: one quarter of invoices, BOMs and price letters in — a documented, per-part leakage number out. No system integration required.

*Prepared for discussion · August 2026*
