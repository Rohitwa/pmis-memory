# Brainstorm 01 — The Cash Flow Problem

**Trigger:** Discussion with the CEO of Jindal Steel: "the problem is not only traceability of stock but also cash flow."
**Date:** 2026-08-19 · working notes, not external-facing

---

## Why a mill CEO says "cash flow"

A mill sits at the *strong* end of the chain — advances, LCs, short credit. If its CEO volunteers cash flow as the problem, he is most likely seeing it from three angles:

1. **Credit risk on his own receivables** — downstream processors and component makers get squeezed in volatile quarters, and their distress travels up as delayed payments and defaults.
2. **Demand instability** — cash-starved buyers defer lifting contracted tonnage in down-cycles, whipsawing the mill's own planning.
3. **Channel finance burden** — mills already quasi-finance their channel (distributor credit, price protection asks) without the tooling to do it well.

Read: even if traceability fixes *who owes what*, the money still moves too slowly through the chain — someone must finance the gap, and today it defaults to whoever has the least bargaining power.

---

## Decomposition — four cash-flow sub-problems

**CF-1. The unbilled escalation receivable.**
Between a metal price rise and the OEM's price amendment, the supplier accrues a claim that is economically real but not yet invoiced. No bank can discount it — TReDS and bill discounting require an accepted invoice. It sits as pure negative cash flow for 3–6 months. Size ≈ one to two quarters' price delta on metal spend.

**CF-2. Inventory revaluation ballooning.**
The same tonnage of mandated buffer stock (often 4–8 weeks, OEM-imposed) needs 15–30% more cash during a spike. Working-capital limits were sized on last year's prices; banks re-appraise slowly. Firms hit their drawing-power ceiling exactly when they need headroom most.

**CF-3. Payment-term asymmetry across tiers.**
Mills collect at advance/LC/15–30 days; OEMs pay at 45–90 days plus the PVC lag. Tier-2s are crushed twice: paid by Tier-1s at 60–90 days while buying near-cash from stockists at spot premiums.

**CF-4. Credit is mispriced because exposure is invisible.**
Lenders cannot see whether a borrower's metal exposure is contractually protected (good PVC, fast reset) or naked. So they price on balance-sheet history; a well-protected firm and a badly exposed one pay the same rate.

---

## Solution space, mapped to each sub-problem

### CF-1 → Escalation claim financing (most differentiated)
The ledger turns the unbilled claim into an *evidence-backed, contractually computable* asset: invoice → test certificate → part → shipment → clause. A financier (NBFC/bank, ideally credit-insurance-wrapped) advances 80–90% against it, repaid when the OEM's price amendment lands. Nobody offers this today because nobody can compute the claim reliably — the ledger is the underwriting engine. Complements: OEM early-settlement programs (monthly approval on a trusted rail, sold as supplier-health + dispute-cost reduction), and TReDS discounting once the retro-invoice exists (integrate, don't rebuild).

### CF-2 → Ledger-collateralized inventory finance + mill-anchored consignment
- **Dynamic drawing power:** stock valued in real time (grade × tonnage × market price, with purchase genealogy) lets lenders raise limits with the market instead of lagging it.
- **Mill-anchored VMI / consignment ("pay on melt"):** the mill — or a financier behind it — retains title until consumption; the component maker pays at consumption, at the day's price. Inventory financing moves to the balance sheet best able to carry it; the ledger provides consumption truth. *This is the Jindal-shaped opportunity:* a sales differentiator for the mill, de-risked receivables, customer lock-in.

### CF-3 → Deep-tier financing and chain netting
OEM-anchored payables financing exists for Tier-1 but stops there because nobody can verify a Tier-2's real receivable. The ledger extends visibility one tier down, letting the OEM's credit rating flow to Tier-2/3. Longer-term: a netting/settlement rail where physical-flow payments and escalation adjustments settle on the same ledger, shrinking gross financing need.

### CF-4 → Pass-through quality score
A data product from the ledger: what % of this firm's metal exposure is contractually protected, at what lag, with what recovery history. Lenders price working capital on it; the firm uses it to negotiate both credit and contracts. Residual exposure → hedging overlay advice (thin steel derivatives; index swaps via banks for size).

---

## Thesis update

Traceability and cash flow are **not two problems — they are two layers of one product**:

```
Ledger (truth)  →  Claims (recovery)  →  Finance (liquidity)  →  Contracts (redesign)
```

You cannot finance a claim or a stock position you cannot prove. Once proven, both become financeable assets — and the financing layer is likely the bigger business (spread/origination on financed volume vs SaaS seats).

India-specific unlock: **GST e-invoicing + e-way bills** already digitize tonnage and value flows between counterparties — a verification rail for both traceability and credit underwriting that doesn't exist in most countries.

## Two entry doors now open

| | Supplier-anchored (original plan) | Mill-anchored (Jindal door) |
|---|---|---|
| Wedge | Metal margin audit → claim recovery | Consignment/VMI pilot + channel finance on ledger |
| Data access | Supplier's own documents | Mill already holds one side of every transaction |
| Speed | Slower sales, one supplier at a time | One mill sponsor = many customers at once |
| Risk | None structural | Buyers may distrust a platform owned by their supplier — neutrality must be engineered (data walls, or independent entity) |

## Questions to take back to the CEO

1. Whose cash flow did he mean first — the mill's receivables risk, or the downstream squeeze he observes?
2. Would Jindal pilot consumption-priced consignment supply with one anchor customer, if a neutral third party ran the ledger and brought the financier?
3. Would the mill share transaction-level data (grades, prices, tonnage per customer) for such a pilot?
4. Who inside Jindal owns this P&L — sales, treasury, or a digital unit?
