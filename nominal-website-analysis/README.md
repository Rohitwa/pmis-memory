# Nominal.so — Full Website Analysis

> Agent-driven crawl of **https://nominal.so/**, page by page, via headless Chromium (Playwright).
> Scan date: **2026-08-19**. Pages fetched: **247** (231 unique paths). Coverage: **complete** — the
> discovery queue drained to zero unvisited internal URLs.

- **Method:** Headless Chromium (Playwright, direct egress) BFS crawl from `/`, following every
  internal `<a href>`. For each page: HTTP status, `<title>`, meta description, H1/H2/H3, full body
  text, outbound links, and a screenshot were captured.
- **Machine-readable artifacts:** [`inventory.md`](./inventory.md) (all pages grouped by section),
  [`index_full.json`](./index_full.json) (path → title/meta/H1), [`all_discovered_urls.json`](./all_discovered_urls.json)
  (complete URL set). Full body text + per-page screenshots were captured in the scan run
  (screenshots not committed for size).
- **HTTP results:** 241 × `200`, 4 × `503` (rate-limiting at the tail of the crawl), 2 × `404`
  (`/blog/apm-rpa-copilots`, `/author/rafael-ataie` — a typo'd duplicate of `/author/rafael-ataide`).

---

## 1. What Nominal is

**Nominal** is an **"Agentic AI Platform That Runs Your Accounting."** It deploys **autonomous AI
agents** that *execute* accounting work — reconciliation, consolidation, variance (flux) analysis,
intercompany, transaction matching, and month-end close — as an **execution layer that sits on top of
a company's existing ERP** rather than replacing it.

The one-line thesis repeated across the site:

> **"Traditional systems assist accounting teams. Nominal's agents run the work."**
> *"Move from doing the work to running the business."*

### Category creation: "Agentic Performance Management (APM)"
Nominal is not just selling a product — it is **coining and seeding a category**, "Agentic Performance
Management (APM)," positioned as the next evolutionary layer after **ERP → EPM/BPM → APM**. A large
share of the content library exists to define, defend, and own this term (dedicated hub, playbook,
glossary, and dozens of "APM vs X" articles).

- **Company product app:** `app.nominal.so/login` (marketing site is separate, Webflow-built — "Site by Milkshake").
- **Business model:** enterprise, sales-led. **No pricing page exists.** Primary CTA everywhere is
  **"Book a Demo."**
- **Funding (from Press Room):** emerged from stealth with **$9.2M**, later **$20M** raise; **SOC 1
  Type II** certified; named to "The Agentic List 2026."
- **Target buyer:** CFOs, Controllers, Heads of Finance at **large, complex, multi-entity** companies.

---

## 2. Information Architecture (structure)

**Primary nav:** `Platform · Agents · Solutions · Company · Knowledge Base · Log in · Book a Demo`

| Section | Pages | What it holds |
|---|---:|---|
| **Platform** | ~8 | `/our-platform` hero page + pillar/alias pages: `/integrations`, `/compare`, `/security`, `/ai-powered-analysis`, `/close-management`, `/financial-consolidation` |
| **Agents** | 5 | The 5 named agent products (see §4) |
| **Solutions — by use case** | 4 | Close Acceleration & Accuracy · Intercompany & Multi-Entity · Consolidation & Reporting · Preparing for Scale & IPO |
| **Solutions — by ERP** | 6 | ERP-Agnostic Orchestration · Workday · Microsoft Dynamics 365 · Oracle · Sage Intacct · SAP |
| **Company** | 4 | About · Careers · Security · Contact |
| **Knowledge Base** | ~180 | **Blog (112)** · **Resources (37)** · Case Studies (5) · Events (11) / Webinars (2) · Press Room (7+3) · Masterclass course · APM Hub · Close Guide Hub · **Author pages (16)** |

The **long tail is ≈75% of all pages** — a deliberate **programmatic-SEO content engine**. Every
content page funnels to *Book a Demo*, *Masterclass registration*, or a gated PDF download.

> Full page-by-page list: [`inventory.md`](./inventory.md).

---

## 3. Homepage flow (the conversion narrative)

1. **Hero** — "Run your entire close with AI agents" + product screenshot + *Book a Demo*.
2. **Social proof** — "Trusted by large, complex companies."
3. **What we do** — three pillars: **Close · Consolidate · Intercompany** (each expands to sub-capabilities).
4. **Proof point** — **"3x Operational Efficiency"** stat + Leanpay testimonial ("almost effortless… we gave them access to our accounting database, and they took it all from there").
5. **How it works — 4 stages** (the core product mental model):
   1. **Data** — connects to systems you already use (every ERP, national/regional banks, procurement) — *improving your stack, not replacing it.*
   2. **Shadow Ledger** — a unified, **bi-directional** data ledger across entities, systems, and currencies (multi-entity consolidation, intercompany, multi-book reporting).
   3. **Always-On Agents** — **deterministic** AI agents for accuracy, auditability, control (matching/reconciliation, variance analysis, policy enforcement, resolution).
   4. **Close Management** — a unified workspace where **agents and humans collaborate**; team stays in control (approval workflows at every step, full audit trail, feedback loops that improve accuracy).
6. **Solutions** — "ERP-agnostic by design" grid.
7. **Knowledge Base** — latest posts.
8. **Final CTA** — "Move from doing the work to running the business" → Book a Demo.

---

## 4. The Agents (product core)

| Agent | Job |
|---|---|
| **Transaction Patrol Agents** | Continuous anomaly/error detection in real time — "the work humans miss." |
| **Bank Reconciliation Agents** | Continuously match bank activity to the ledger, surface exceptions, keep accounts audit-ready. |
| **Transaction Matching Agents** | Match transactions across ledgers, entities, and systems automatically. |
| **Flux Analysis Agents** | Trace balance changes to source transactions; explain variance; flag unexpected movements pre-close. |
| **Trigger Agents** | Monitor financial activity and auto-initiate workflows when conditions are met (no manual follow-up). |

Supporting agent concepts referenced in content: **Resolution Agents**, **Policy Enforcement
Agents**, **Consolidation Agents**, **Anomaly Detection Agents**, **Matching Agents**.

---

## 5. Solutions matrix

**By use case:** Close Acceleration & Accuracy · Intercompany & Multi-Entity Operations · Financial
Consolidation & Reporting · Preparing for Scale & IPO.

**By ERP (each a near-identical "extend your ERP" template):** ERP-Agnostic Orchestration ·
Workday · Microsoft Dynamics 365 · Oracle · Sage Intacct · SAP.
Recurring pattern: *"Your ERP Records. Nominal Executes."* / *"Extend [ERP] beyond the ledger."* /
*"Close the gap with Nominal."*

**By industry (in Resources):** Energy · Logistics & Transportation · Manufacturing & Machinery ·
Retail · Tech.

---

## 6. Knowledge & messaging model

**Core argument:** the industry is shifting from **AI *assistance* → autonomous *execution*.** Tools
that only "assist" (RPA, copilots, close-management software, EPM) are framed as insufficient.

**Trust / differentiation pillars:**
- **Deterministic** agents (not probabilistic LLM guesswork) — auditability and control.
- **Human-in-the-loop governance** — thresholds, escalation, approval at every step, full audit trail.
- **ERP-agnostic** — no rip-and-replace, no vendor lock-in ("vendor tyranny").
- **Security** — SOC 1 Type II certified.
- **No added headcount** — scale finance ops without hiring.

**Proof assets (case studies):**
- **Team Car Care** — reconciliation work cut **70%+**.
- **GSPP** — consolidates **280+ entities**; saves **60+ hrs/month** on close.
- **Kunai** — saved **80+ hours** / **~$20k** in acquisition due-diligence prep.
- **Leanpay** — month-end close time cut **25%**.

**Content clusters (the 112-post blog + 37 resources):**
- APM category education (what it is / isn't, 4 principles, 3 components, playbook, glossary).
- Comparison / competitive: BlackLine, FloQast, OneStream, Numeric, "BlackLine alternatives," APM vs EPM vs ERP vs RPA.
- Per-ERP "execution gap" pieces (D365, SAP BPC sunset, Sage multi-entity, Workday reconciliation, Business Central).
- Topic education: intercompany, multi-entity consolidation, flux/variance analysis, month-end close, currency consolidation, anomaly detection.
- Thought leadership: "Will AI take accounting jobs?", "When agents do the work, what does the controller do?", deterministic agents, agentic vs AI-agents.
- Education funnel: **Masterclass** (free 4-module course → "AI Mastery Badge") + **Close Guide** (7-chapter gated series) + **Close Guide Hub** / **APM Hub**.

---

## 7. Visual / brand representation

- **Style:** modern enterprise-SaaS. Full-width sections **alternating light and dark**, real product
  UI screenshots, numbered "how it works" cards.
- **Palette:** largely monochrome (black/white/greys) with **green, yellow, and purple accent chips**
  used to tag workflow types (Variance & Monitoring, Reconciliation, Matching, Intercompany, etc.).
- **Layout system:** strong templating — agent pages, solution pages, and ERP pages each reuse one
  layout, with a recurring "Our agents are trusted by" logo banner.
- **Voice:** confident, category-defining, outcome-led ("run," "execute," "autonomous," "always-on").
- **Tech:** Webflow site (credit: "Site By Milkshake"). Social: LinkedIn, Instagram, YouTube.

---

## 8. Team (from author/about pages)

Leadership & contributors surfaced on author pages include **Guy Leibovitz (Co-Founder & CEO)**,
**Yaara Hendel (VP Product Management)**, **Shai Atar (Sr. PM)**, **Stephanie Montelius (VP
Marketing)**, plus GTM/BDR/AE/marketing staff (Nick Masotti, Samantha Sachs, Victoria McDevitt,
Ricardo Cohen Pellico, Dena Omar, Laura Bernardes, Ryan Baker, Katherine Mejia, Vincente Herrera,
Rafael Ataíde) and a shared **"Nominal Team"** byline. Positioning emphasizes "Diversity in
Leadership" and a global footprint.

---

## 9. Observations & notable gaps

- **Duplicate / migrating URL structures:** content exists under both `/resources/*` and
  `/resources-center/*`, and both `/press/*` and `/press-room/*`, and `/events/*` vs `/webinars/*` —
  suggests an in-progress IA migration or SEO duplication. Several blog posts are near-duplicates
  pointing at the same canonical topic (e.g. multiple "Agentic AI in Accounting" variants;
  `/blog/agentic-ai` == `/blog/agentic-ai-accounting`).
- **Typo'd dead link:** `/author/rafael-ataie` (404) vs the live `/author/rafael-ataide`.
- **A `/blog/nominal-flux-anysis`** slug (misspelled "analysis") is live and indexable.
- **No pricing, no self-serve signup** — fully demo-gated, enterprise motion.
- **SEO is the growth engine:** ~150 content pages vs ~25 product pages; heavy comparison-keyword and
  "gap"-keyword targeting; gated lead-gen (Masterclass, Close Guide, playbook, scorecards, checklists).

---

## 10. One-paragraph summary

Nominal.so is the marketing site for an enterprise, demo-led **"Agentic Performance Management"**
platform that layers **deterministic, always-on AI agents** on top of any ERP to *execute* — not just
assist with — reconciliation, consolidation, flux analysis, intercompany, and month-end close, with
human-in-the-loop approvals and a full audit trail. The site is organized around **Platform → 5 Agents
→ Solutions (by use case + by ERP) → Company → a large Knowledge Base**, and its structure is
dominated by a **programmatic-SEO content engine** (~112 blog posts, 37 resources, competitor
comparisons, gated courses) all funneling to a single conversion action: **Book a Demo.**
