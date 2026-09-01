# The 3% Leak: How Money Actually Leaves a Company — and How It Comes Back

*The article behind "Read the full argument →". Written for the CFO, Controller, or Head of Finance who wants to know where the savings number comes from before booking anything.*

---

## The number nobody budgets for

A $120M revenue company saved $3.6 million with AiFA. That's 3% of outflow.

Three percent sounds implausible until you stop thinking of it as one leak and start thinking of it as many small ones, each individually invisible: a duplicate invoice paid twice eleven weeks apart, a unit price 4% above the contracted rate, an input-tax credit never claimed because the vendor filed late, an early-payment discount that expired on a Friday, a small-vendor interest clock that quietly started running.

None of these shows up as a line item. All of them show up in the same place: outflow that should have been smaller than it was.

This article follows the money — from the moment an invoice arrives to the moment a payment leaves — and shows where the 3% escapes at each step, why your existing controls don't catch it, and what changes when every transaction is checked before the money moves instead of after.

---

## Step 1: The invoice arrives — and the first leak opens

Invoices arrive in a mailbox, a portal, sometimes on paper. Someone keys them into the ERP, or an OCR tool does. At this moment, three questions decide whether money leaks:

- **Have we seen this invoice before?** Duplicates rarely look identical — a re-sent PDF with a new number, the same delivery billed by two group entities, a proforma followed by a final. Human AP teams catch the identical ones. The near-identical ones get through.
- **Is the price the price we agreed?** The contract says one rate, the PO says another, the invoice says a third. Checking means opening three documents. On invoice number 400 of the week, nobody opens three documents.
- **Do the PO, the goods receipt, and the invoice agree?** The 3-way match is the oldest control in finance — and in most companies it runs on a *sample*, after posting, because matching every line manually doesn't scale.

**The uncomfortable statistic: 85% of bills are approved without a conscious check.** Not because teams are careless — because the volume makes conscious checking impossible. Approval becomes a keystroke.

*What the agents do here:* the Duplicate, Pricing, and 3-way match agents check every invoice, at entry, in under a second — against the full history, the contract, and the PO/GRN pair. An invoice that fails is held with the documents that prove why. Nothing leaks at step one because nothing passes unexamined.

## Step 2: Tax and compliance — the leak that compounds

The second leak is quieter and larger than most CFOs expect, because it compounds:

- **Credits not claimed.** If a vendor hasn't filed, the tax credit you're entitled to isn't available yet — claim it anyway and it reverses with interest; forget it and it's cash left with the government.
- **Wrong section, wrong rate.** Withholding applied at the wrong rate is either money out the door or a notice later. Both cost.
- **Inactive or unlinked vendor PANs** turn routine payments into compliance exposure.
- **Small-vendor clocks.** Pay a registered small vendor late and statutory interest accrues automatically — a leak with a legal timer on it.

These aren't judgment calls; they're rule checks against registries and filings. They fail in batch processes for one reason: the data changes daily and the check runs monthly.

*What the agents do here:* GST, TDS, PAN, and MSME agents verify each entry against live filing status and registry data before it posts. The credit is claimed when it's claimable, the rate is right the first time, the clock never starts.

## Step 3: The books — where errors go to hide

Here is the structural problem, and it's the one line every CFO should sit with:

> **Controls run in batches. Money leaves in real time.**

Payments go out daily. Reviews happen at month-end. So there is, on average, **one month between an error and the review that finds it** — and by then the money has moved, the vendor has been paid, and recovery means emails, debit notes, and negotiation leverage you no longer have. The discrepancies surface in spreadsheets, exports, and email threads — *despite* the ERP, because the ERP records what happened; it doesn't argue with it.

Recovery after payment is pennies on the dollar. Prevention before payment is the whole dollar. This is the entire economic argument for real-time checking, in two sentences.

*What the agents do here:* entries post to your ERP already compliant — checked, matched, within approval limits — so the book stays clean without a cleanup pass, and month-end close stops being an archaeology project.

## Step 4: The payment run — the last gate, checked twice

The payment run is where every upstream mistake becomes irreversible. In most companies, the run is assembled from "approved" invoices — and we've established what approval means at volume.

*What the agents do here:* the run is built from approved entries **only**, then checked again before it leaves — duplicates across the run, amounts against limits, discounts about to expire captured rather than forfeited. Exceptions aren't escalated into someone's inbox to age; they're **held, with the documents that prove it**, until a human decides.

---

## Adding it up

| Leak | Typical share of the 3% | Caught by |
|---|---|---|
| Duplicates & double payments | ~0.5–1% | Duplicate agent, at entry and again at the run |
| Contract/PO price variances | ~1% | Pricing & 3-way match agents |
| Tax credits missed, wrong rates, statutory interest | ~0.5–1% | GST, TDS, PAN, MSME agents |
| Discounts forfeited, limit breaches | ~0.5% | Payments, Discount & DOA agents |

Individually, rounding errors. On $120M of outflow, $3.6M. And unlike cost-cutting, recovering it requires no negotiation, no headcount change, and no vendor even noticing — it's money that was always yours, leaving through gaps in timing.

## "Why hasn't software fixed this already?"

Fair question — ERPs have had 3-way match for thirty years. Three independent studies point at the same answer, and none of the blockers they name is a model problem:

- **Adoption is stalled, not accelerating**: 59% of finance departments use AI, against 58% a year earlier (Gartner, Nov 2025). A year of attention, one point of movement.
- **Governance is the gap**: only 1 in 3 organisations reach maturity on agentic governance and controls; security and risk is the top barrier to scaling (McKinsey, State of AI Trust 2026).
- **Infrastructure is the other**: legacy integration, data architecture, and governance frameworks are the three obstacles holding agents back in finance (Deloitte, Tech Trends 2026).

Which is why AiFA is built as an **ecosystem for deploying finance agents** — inside your ERP, under your approval hierarchy, with every hold backed by documents — not as another AP tool bolted onto the side. The checks run where the money already lives: SAP, Oracle, NetSuite, Tally, Zoho Books, QuickBooks, Sage, Odoo. Live in weeks, starting from an extract your team already produces. No connector, no project.

## Prove it on your own money

Everything above is an argument. Your invoices are evidence.

Send us 90 days of your highest-spend vendor invoices — one export, about a minute of your time. Within one working day you get the findings: duplicates, overcharges, credits not claimed, clocks about to breach — **each with the invoice attached**. If your company moves over $120 million a year, we'll show you where the leak is, on your own data.

**Check your savings →**

---

*YantrAI Labs · Live in India, Dubai, the USA and Africa · rohit@yantrailabs.com*
