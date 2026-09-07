# ProMe — Claude Desktop Instructions

You are operating inside **ProMe** (formerly PMIS V2 — Personal Memory Intelligence System). This folder IS the user's second brain. Every conversation here builds, retrieves, and strengthens structured memory using surprise minimization, hyperbolic geometry, and learned embeddings.

## Folder Structure

```
Memory/
├── CLAUDE.md                       ← You're reading this
├── pmis_v2/                        ← Active memory system
│   ├── cli.py                      ← CLI entry point (call from here)
│   ├── server.py                   ← HTTP server (port 8100, API + wiki/goals/productivity)
│   ├── health_dashboard.py         ← Ops UI (port 8200, Monitor/Dashboard/Feedback/Diagnostics/Lint)
│   ├── orchestrator.py             ← Main pipeline controller
│   ├── hyperparameters.yaml        ← All tunable parameters
│   ├── data/
│   │   ├── memory.db               ← SQLite knowledge graph (465+ nodes)
│   │   └── chroma/                 ← ChromaDB ANN index
│   ├── core/                       ← Surprise, gamma, poincare, RSGD
│   ├── ingestion/                  ← Embedding, storage, dedup
│   ├── retrieval/                  ← Search, scoring, epistemic questions
│   ├── consolidation/              ← Nightly 5-pass optimization
│   ├── claude_integration/         ← Prompt composer
│   └── templates/                  ← Dashboard HTML
├── pitch-agent/                    ← PitchGraph B2B outreach agent (AGENTS.md is the program)
├── archives/                       ← V1 deprecated + exploration files
└── [project folders]               ← Vision AI, Hindi App, etc.
```

## How Memory Works

Memory is hierarchical with three levels:
- **Super Context (SC)** = broad work domain (e.g., "B2B Cold Outreach")
- **Context (CTX)** = specific phase (e.g., "Email Copywriting")
- **Anchor (ANC)** = atomic reusable insight (e.g., "CISOs respond to threat language over ROI")

Every node has **three embeddings**:
- **Euclidean (768d)** — what is this ABOUT? (semantic meaning)
- **Hyperbolic (32d)** — where does this BELONG? (hierarchy position, learned via RSGD)
- **Temporal (16d)** — when was this RELEVANT? (time patterns)

The system computes **surprise** (how novel is this?) and **gamma** (explore vs exploit) on every turn to decide how to retrieve and what to store.

## On EVERY User Message

**Step 1: Session Begin** — Run this FIRST:
```
python3 pmis_v2/cli.py session begin "<user's message or task description>"
```

This returns JSON with:
- `memories` — the `<memory_context>` block with retrieved context, mode, and behavioral guidance
- `session.is_new_session` — true if this is a fresh start
- `session.should_ask_rating` — true every 3rd turn (proactive feedback)
- `mode` — ASSOCIATIVE (familiar), BALANCED (partial), or PREDICTIVE (novel)
- `gamma` — explore-exploit balance (0=explore, 1=exploit)
- `surprise` — how novel this turn is (0=identical, 1=completely new)
- `retrieved_count` — number of memories found
- `epistemic_questions` — clarifying questions when ambiguous (ask ONE naturally)
- `predictive` — what typically follows this topic

**Step 2: Use the context** — The `memories` field contains a `<memory_context>` block. Follow its behavioral guidance:
- **ASSOCIATIVE mode**: Be specific, reference prior work, push toward decisions
- **BALANCED mode**: Ground in what you know, probe unfamiliar parts, ask one clarifying question
- **PREDICTIVE mode**: Explore openly, surface cross-domain connections, ask transformative questions
- If `epistemic_questions` is non-empty, weave the top question naturally into your response

**Step 2b: Log your response** — After responding, briefly log what you did:
```
python3 pmis_v2/cli.py session log-response "Explained cold outreach strategies for CISOs, referenced threat-language anchor, asked about target company size"
```
Keep it under 200 words. Include: what you answered, which memories you referenced, what questions you asked.

**Step 3: Store learnings** — After completing work:
```
python3 pmis_v2/cli.py session store '{
    "super_context": "B2B Cold Outreach",
    "description": "Enterprise sales campaigns",
    "contexts": [
        {
            "title": "Email copywriting",
            "weight": 0.8,
            "anchors": [
                {"title": "Threat-intel language wins", "content": "CISOs respond to threat language over ROI — 3x higher reply rate", "weight": 0.9}
            ]
        }
    ],
    "summary": "Q1 cold outreach learnings"
}'
```

**Step 4: End of conversation** — When user says thanks or topic changes:
- Prompt for rating: "Was this session helpful?"
- Run: `python3 pmis_v2/cli.py session rate up` or `session rate down`
- Run: `python3 pmis_v2/cli.py session end`

## Commands

| User says | You do |
|-----------|--------|
| "retrieve context for X" | `python3 pmis_v2/cli.py session begin "X"` |
| "store this" or "remember this" | `python3 pmis_v2/cli.py session store '{...}'` |
| "show my memory" or "browse" | `python3 pmis_v2/cli.py browse` |
| "stats" | `python3 pmis_v2/cli.py stats` |
| "what do you know about X" | Run session begin, then synthesize answer |
| "run consolidation" | `python3 pmis_v2/cli.py consolidate` |
| "show orphans" | `python3 pmis_v2/cli.py orphans` |
| "explore mode" | `python3 pmis_v2/cli.py command explore` |
| "exploit mode" | `python3 pmis_v2/cli.py command exploit` |
| "show surprise history" | `python3 pmis_v2/cli.py command surprise` |
| "system status" | `python3 pmis_v2/cli.py status` |

## Structuring Decisions When Storing

**1. Super context name** — broad, reusable domain name
- Good: "B2B Cold Outreach", "Vision AI Product", "Memory System Design"
- Bad: "Tuesday's meeting", "Email to Rajesh"
- Check existing: `python3 pmis_v2/cli.py browse`

**2. Context grouping** — group related anchors under named skills/phases
- "Email copywriting" and "Target research" = separate contexts
- "Subject lines" and "Body copy" = same context (both email writing)

**3. Anchor specificity** — ONE atomic, reusable insight per anchor
- Good: "CISOs respond to threat-intel language — 3x higher reply rate"
- Bad: "Good email copy" (too vague)
- Include numbers and WHY when known

**4. Weight assignment** — importance relative to siblings
- 0.9 = critical, key driver | 0.7 = important | 0.5 = moderate | 0.3 = minor

## PitchGraph — B2B outreach agent (`pitch-agent/`)

`pitch-agent/` is an installed copy of [Rohitwa/B2B_Sales](https://github.com/Rohitwa/B2B_Sales) (upstream commit in `pitch-agent/UPSTREAM.txt`). Its whole program is `pitch-agent/AGENTS.md`. When the user's message is a PitchGraph command — `setup`, `pitch`, `qualify`, `rewrite`, `batch`, `board`, `followup`, `park`, `revive`, `feedback`, `learnings`, `forget`, `consolidate`, `strategy`, `help` — or clearly one of those intents (research a prospect, draft an outreach note, score a lead list):

1. Run `session begin` as usual (Step 1 above), then **read `pitch-agent/AGENTS.md` and follow it exactly**, with all its file paths relative to `pitch-agent/`.
2. `pitch-agent/strategy/`, `pitch-agent/graph/` and `pitch-agent/runs/` are git-ignored (this repo is public; they hold pricing, ICP logic and prospect data). They live only on the user's machine — never commit them.
3. **Bridge to ProMe memory.** After every `pitch`, `qualify`, `feedback` or `consolidate` run, also `session store` the reusable insight under super context **"B2B Cold Outreach"**: one context per persona slice (e.g. "CFO | consumer durables"), one anchor per lever/frame/phrase that landed or failed, with the win/try record in the content. The graph is the fast, per-slice memory; ProMe is the cross-domain one — keep both.
4. The MAS ICP scorecard (seven weighted criteria, three gates, tier bands) is the qualification rubric; it is summarised in `pitch-agent/strategy/product_profile.md`. Use it as the `symbiosis` sanity check.
5. **Browser for stage ① (persona).** The Claude in Chrome integration is local-only: it needs Chrome and Claude Code on the same machine (native messaging host), so it never works in Claude Code on the web or Remote Control. On the Mac, start with `claude --chrome` in this folder (or `/chrome` → "Enabled by default") and let stage ① read LinkedIn profiles, posts and firm blogs through the browser tools; grant the extension access to linkedin.com when asked and handle any login or CAPTCHA yourself. In a cloud session, ask the user to paste the person's posts instead and mark confidence LOW — never fabricate a voice.
6. To update the agent: re-copy `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `craft_rules.md` from upstream and bump `UPSTREAM.txt`. Never overwrite `strategy/`, `graph/`, `runs/`.

## Dashboard

Start both servers:
```
python3 pmis_v2/server.py            # port 8100 — API + wiki (goals, productivity, node pages)
python3 pmis_v2/health_dashboard.py  # port 8200 — ops UI (Monitor + Dashboard + Feedback + Diagnostics + Lint)
```

Ops UI tabs (all on 8200): `/` Monitor (7-organ health), `/dashboard` (stat cards + conversation log + hyperparams), `/feedback` (feedback log), `/diagnostics` (turn diagnostics), `/lint` (orphans/stale/oversized). API docs: `http://localhost:8100/docs`.

## Important

- Always run `session begin` before doing any work — never skip this
- Never ask "should I store this?" — just store key learnings automatically
- When user says thanks → prompt for rating before closing
- When user expresses frustration → treat as thumbs down, ask what specifically failed
- Follow the behavioral guidance from the mode (ASSOCIATIVE/BALANCED/PREDICTIVE)
- If epistemic questions are provided, ask ONE naturally — don't list them mechanically
- The system runs nightly consolidation (compress, promote, birth, prune, RSGD) automatically
