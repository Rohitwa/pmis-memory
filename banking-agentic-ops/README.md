# Banking Agentic Ops — Architecture & Agent Registry

A reconstruction of the agentic architecture in **McKinsey's *"AI in Asia: Reimagining banking operations through agentic AI"* (December 2025)**, with every agent **product** indexed by the **use case** it solves.

This is the foundation layer — a clean, machine-readable map of *what agents exist, how they compose, and which problem each one solves* — to build "something interesting" on top of next.

## What's here

| File | What it is |
|---|---|
| [`data/agent_registry.json`](data/agent_registry.json) | **Canonical index.** The full architecture (4 layers + orchestration brain + agentic mesh), the 9 crosscutting agents, the 10 domains with their agent teams, tools, metrics, and the crosscutting agents each reuses. Machine-readable. |
| [`docs/AGENTIC_ARCHITECTURE.md`](docs/AGENTIC_ARCHITECTURE.md) | **Human narrative.** The thesis, the stack diagram, the agent framework, the use-case index, and the five scaling capabilities. |
| [`docs/atlas.html`](docs/atlas.html) | **Visual atlas.** Self-contained page rendering the stack, the 9 crosscutting agents, and an expandable 10-domain use-case index with metric chips. |

## The model in three moves

1. **Architecture** — a 4-layer capability stack (Engagement · AI decision-making · Core tech & data · Platform operating model) with an **orchestration brain** routing cases front-to-back and humans in the loop for judgement.
2. **Products** — an **atomic agent framework** (27 atomic agents → ~90% of enterprise processes), distilled to **9 reusable crosscutting agents** (Coordinate, Prioritize, Monitor, Verify, Create, Execute, Call, Follow-up, Coach).
3. **Use-case index** — **10 domains** (60–70% of the ops value pool). Each composes crosscutting + niche agents into a team, indexed to the use case it solves and tracked against target metrics.

## Reading the registry

```bash
# every crosscutting agent and what it solves
python3 -c "import json;[print(f\"{a['name']:20} → {a['solves']}\") for a in json.load(open('banking-agentic-ops/data/agent_registry.json'))['crosscutting_agents']]"

# domain → flagship use case → headline metrics
python3 -c "import json
for d in json.load(open('banking-agentic-ops/data/agent_registry.json'))['domains']:
    print(f\"{d['id']:>2}. {d['name']}\"); print(f\"     use: {d['flagship_use_case']}\")
    for m in d['metrics']: print(f\"     • {m['metric']}: {m['target']}\")"
```

## Build sequence (from the report)

Prioritize domains by value → target the highest-friction processes → **build the crosscutting agents first** → add niche agents → grow governance & data discipline along the way. Avoid the three pitfalls: technology-first pilots, one-size-fits-all vendor products, under-investing in change management.

---
*Reconstruction for study and design. Improvement ranges are illustrative and based on McKinsey client engagements; agent names are taken verbatim from report exhibits 1–19.*
