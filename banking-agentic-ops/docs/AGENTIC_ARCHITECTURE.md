# Agentic Banking Operations — Architecture & Product Catalog

> Reconstructed from **McKinsey Operations Practice, *"AI in Asia: Reimagining banking operations through agentic AI"*, December 2025.**
> This doc is the human narrative; [`../data/agent_registry.json`](../data/agent_registry.json) is the canonical, machine-readable index of every agent product mapped to the use case it solves.

---

## 0. The thesis in one paragraph

Enterprise-wide operations are **60–70% of a bank's cost base**, and **~60–70% of those workflows are still manual**. Most AI to date is **siloed** and stuck in pilots. The unlock is **multiagentic systems** — fleets of small, reusable *atomic agents* that act as coworkers, plan multistep work, use tools, self-critique, and collaborate under **human-in-the-loop orchestration** — deployed **end-to-end across the value chain**, not as isolated use cases. Early movers (<10% of banks globally) are already seeing **30–50% efficiency gains** and **2–3× productivity**. AI could deliver **up to 70% gross reduction** in certain cost categories (~15–20% of the entire cost base, net of rising tech cost).

The whole architecture is a way to make agents **reusable across functions, composable across journeys, trainable to institutional knowledge, and scalable to new use cases with minimal effort.**

---

## 1. The architecture — a 4-layer capability stack with an orchestration brain

```
                         ┌───────────────────────── HUMAN-IN-THE-LOOP ──────────────────────────┐
                         │            (supervisors of agents; exceptions & judgement)            │
                         └──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ ①  ENGAGEMENT                                                                                   │
  │     Mobile as the gateway · multimodal conversation (text/visual/voice) · omnichannel ·         │
  │     intelligent products · digital twins of customers & employees                               │
  ├──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ ②  AI-POWERED DECISION-MAKING            ◀── the "agentic mesh" (custom + off-the-shelf agents)  │
  │     ┌──────────────── ORCHESTRATION BRAIN / MASTER ORCHESTRATOR ─────────────────┐              │
  │     │  routes any inbound request in any channel · orchestrates cases front-to-back│              │
  │     │  hands off to specialized human/agent teams only when expertise is required │              │
  │     └──────────────────────────────────────────────────────────────────────────┘              │
  │     Predictive models · AI orchestration (copilots + autopilots) · narrow AI agents ·           │
  │     reusable components · risk protocols · infosec controls                                      │
  │     Decision value chain:  Acquire → Credit-decide → Monitor/Collect → Retain/Upsell → Service   │
  ├──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ ③  CORE TECHNOLOGY & DATA                                                                        │
  │     Industrial AI/ML · MLOps · FinOps · LLM orchestration + gateway · observability ·            │
  │     enterprise data (ingest→preprocess→vector DB→structured stores) · RAG search ·               │
  │     modern APIs · core modernization · cybersecurity tiers                                       │
  ├──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ ④  PLATFORM OPERATING MODEL                                                                      │
  │     Agile ways of working · AI control tower · modern talent strategy · culture ·                │
  │     value-capture office                                                                         │
  └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why not just a single LLM?** Multiagent systems add six things a single model cannot reliably do: automate **complex multistep workflows**, **orchestrate non-linear tasks**, **perform/trigger actions via tools**, hold **effective two-way conversations**, **auto-learn at high velocity** with human reinforcement, and **granularly embed checks & guardrails**.

**Under-investing in any one layer can sabotage the whole transformation** — the stack is deliberately holistic.

---

## 2. The product engine — atomic agents

McKinsey's **atomic agentic framework** = **27 high-performing atomic agents** that can potentially **automate ~90% of enterprise processes**. From these, research in Asia distilled **9 crosscutting agents** that recur across all ten domains. Built end-to-end, those nine can unlock **30–40% operational efficiency**.

### The 9 crosscutting ("transformer") agents

These are the reusable *building blocks* — you compose domain teams out of them. Group them by primitive:

| Primitive | Agent | Solves (the reusable job) |
|---|---|---|
| **Coordinate** | **Coordinate agent** | Coordinates, assigns, prioritizes, and escalates cases for optimized turnaround |
| **Coordinate/Decide** | **Prioritize agent** | Prioritizes tasks for other agents or people by criticality |
| **Decide/Monitor** | **Monitor agent** | Monitors actions to flag breaches and resolve queries using domain expertise |
| **Decide/Validate** | **Verify agent** | Parses, reconciles, and validates documents to flag inconsistencies |
| **Act/Generate** | **Create agent** | Creates context-specific documents from internal + external info to aid decisions |
| **Act** | **Execute agent** | Real-time execution support (calendar invites, emails) to boost speed |
| **Converse** | **Call agent** | Voice/chat agent that chats with or calls people where needed |
| **Converse/Act** | **Follow-up agent** | Follows up with customers/employees at the right time and channel, personalized |
| **Converse/Decide** | **Coach agent** | Personalized feedback and nudges for performance, decisions, and skills |

> **Build order (from the report's sequencing):** build these **common crosscutting agents first** to kill redundancy and enable scale, *then* add **domain-specific / niche agents** for specialized processes.

### Narrow agents in the capability stack (illustrative)

Attached to enablers in the decisioning layer: *Risk policy expert, Instant recognition, Ad-banner generator, Property collateral analyzer, Document summarizer (Legal), Fraud pattern detector, Fraud detector (Spend), Enterprise knowledge search, Skills coach (Compliance), Task expert, Task coach generator (Code), Email agent, Tax management, Voice/video chat.*

---

## 3. The use-case index — 10 domains, the agents that solve them, and the metrics

The ten domains together account for **60–70% of the total operations value pool**. Each domain composes crosscutting + niche agents into a **team**, tracked from day one against **impact-linked metrics**.

| # | Domain | Flagship use case | Headline targets |
|---|---|---|---|
| 1 | **Customer journey transformation** | SME current-account opening in **24–48h** (from 5–8 days) | 90%+ STP · rework −60–70% · 2× productivity |
| 2 | **Sales, branch & distribution** | AI-led sales excellence across the salesperson's day | 2–3× productivity · ~60% time on revenue tasks · sales-force effectiveness +50–100% |
| 3 | **Customer care & service centers** | "Contact center in a box" + 100% call review | 95%+ NPS/CSAT · 4× tickets/agent · cost/call −50% |
| 4 | **Lending & credit operations** | End-to-end credit dossier (spread → memo → price) | reworks <5% · appraisal AHT <60 min · cycle 3–5d → <1d |
| 5 | **Deposits, transaction banking & payments** | Auto exception handling on file payments | 90%+ STP (domestic) · exception AHT <2h · handling −70% |
| 6 | **Collections operations** | Personalized multichannel, higher self-cure | opex 0.5× · agent productivity 1.5–2× |
| 7 | **Financial crime (KYC/AML/fraud)** | Retrieve→validate→analyze→auto risk summary | detection 3–4× · false positives <30% · KYC −75% · losses −20–30% |
| 8 | **Next-gen corporate functions** | AI-led annual budget; AI payroll inquiries | FP&A coord −30–40% · reporting weeks→days · forecast +10–25% |
| 9 | **Ops carve-out / shared services** | Four Centers of Excellence backbone | processing −20–30% · opex −30–40% |
| 10 | **Zero-based design (ZBD/ZBO)** | Clean-slate redesign of the 10 domains | 1 human : **20–30 agents** · up to **20×** productivity potential |

Full agent teams per domain (every agent name, sub-team, tool, and metric) live in [`agent_registry.json`](../data/agent_registry.json) under `domains[]`. Highlights:

- **Domain 1 (Exhibit 10)** — *Master orchestrator* over *Branch office buddy* (Form-filling guide, TAT optimizer, Co-assist), *Form & document checker* (Autofill via API/OCR, Quality checker, Information verifier), *Risk score calculator* (SVR risk model, Adverse-media screening, Mule risk, Risk summarizer & next-swimlane generator), *Customer communication & outreach*, *Performance coach*. Maker/checker pattern with humans as checkers.
- **Domain 4 (Exhibit 13)** — three phases, each a *customized multiagentic system* with recurring roles: **Planner, Critic, File manager, Information extractor, Financial analyst, Financial calculator, Chart expert, Editor/Chief editor, Credit officer, Credit rating specialist, RWA calculator, Interest-rate calculator, Legal associate, Credit-risk secretary.** Tools: read/write files + RAG lookup. Output: digital credit memo with **red-amber-green** scoring per policy criterion → facility/decline letter.
- **Domain 3 (Exhibit 12)** — four verbs: **Optimize** (WFM planning suite) · **Interact** (multichannel conversational agent) · **Assist** (agent copilot) · **Improve** (AI coach reviewing 100% of interactions).
- **Domain 7 (Exhibit 16)** — anomaly-detection engine + investigation agent (trained on **200,000+ past investigations**) + auto risk-summary generator, human-in-the-loop for missing data.
- **Domain 8 (Exhibits 17–18)** — Finance: Data collection, Market scan, Budget generator, Scenario, Budget insight, Budget review. HR: Intake, HR assistant, Investigation, Compensation, Payroll — tiered support with human oversight.

---

## 4. How work itself changes (Exhibit 3)

| Axis | From | To |
|---|---|---|
| **Nature of work** | 80% on coordination & rule-based execution | 80% on customer interaction, decisions, innovation |
| **Product** | one-time static outputs (checklists, memos) prone to error | AI-led self-updating dossiers that justify every decision with context |
| **Workflow** | linear, siloed, SLA-bound, sequential back-and-forth | agent-led orchestration that adapts to context and accelerates end-to-end |
| **Team** | people as process executors (40–60% on non-core) | people as **supervisors of agents** (~80% on core strategic work) |

---

## 5. Five capabilities to scale (Exhibit 19) + sequencing

1. **Business-driven road map** — bold bankwide vision tied to financial outcomes; prioritize high-value domains; owners + milestones.
2. **Talent** — right roles, structure, skills across tech/ops/business.
3. **Operating model & governance** — cross-functional **"garages"** (domain experts + data scientists + transformation leaders).
4. **Technology & data** — right stack + an **agent library** of reusable atomic agents for rapid deployment and monitoring.
5. **Adoption & scaling** — structured change agenda, capability building, governance-first practices.

**Sequencing:** prioritize domains by value → target highest-friction processes (manual verifications, payment exceptions, reconciliations) → **build crosscutting agents first** → add niche agents → grow governance/data discipline along the way.

**Pitfalls to avoid:** technology-first hyperscaler pilots (fix with use-case-led road map + sized value + dashboards); one-size-fits-all vendor products (fix with fit-for-purpose custom agents co-designed with functional teams); under-investing in change management (fix with structured, phased deliverables).

---

## 6. The reusable pattern (why this generalizes)

Across all ten domains the same **agentic workflow primitives** recur — *document understanding, case routing, inquiry resolution, validation, drafting, follow-up.* That is exactly why the **9 crosscutting agents** exist: build the primitives once, compose them per domain, index them by the use case they solve. This registry is that index.
