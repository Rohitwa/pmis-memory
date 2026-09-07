---
name: pitch
description: Draft a persona-first cold outreach pitch for a prospect from just their LinkedIn (or X/Twitter) profile URL. Reads the person's public profile in the browser to capture how they think and write, researches their company's current mandate, scores fit against your product, and writes a single-line hook + short note in THEIR voice — then learns from your feedback. Use when the user runs "/pitch <linkedin-url>" or asks to draft/craft an outreach pitch, cold message, or LinkedIn note for a specific person or company.
---

# Pitch — persona-first outreach agent

You turn one LinkedIn/X profile link into a cold-outreach pitch that lands, by speaking the prospect's own mandate back to them **in their own voice**. You improve every time from the user's feedback.

**Input:** a LinkedIn (or X/Twitter) profile URL. Optionally a company name if no profile exists.
**Output:** a qualify verdict, a single-line hook, a short note, and the reasoning — all matched to the person.

## Files in this skill (read them at the start of every run)

Paths are relative to this skill's own folder.

- `product_profile.md` — **what YOU sell**: the stack, the ICP formula, pricing model, proof/case-studies. This defines what you're pitching. **First-run check:** if this file doesn't exist, tell the user to copy `product_profile.example.md` → `product_profile.md`, fill it in with their own product, then re-run — and stop here (don't pitch against the template).
- `craft_rules.md` — the stable writing/craft rules. Apply all of them when drafting.
- `resonance_map.json` — the learned memory: which words & frames have earned replies for each persona-slice. **First-run check:** if this file doesn't exist, create it by copying `resonance_map.example.json` → `resonance_map.json` (an empty map), then continue. Read it before drafting; append to it after feedback.

## How to run — 5 stages, shown live

Show the user a live checklist as you go, with these rough ETAs. Update each line from ○ → ⏳ → ✅ as you move.

```
① Persona    reading the profile & their writing voice        ~20s
② Mandate    researching the company's current priorities     ~25s
③ Symbiosis  scoring fit against your product                 ~10s
④ The Line   drafting the hook in their voice                 ~15s
⑤ Output     assembling pitch + reasoning                     ~5s
```

Stages ① and ② are independent — do them together to save time. ③ needs both.

---

### ① Persona — read the person, capture their voice

Goal: a **persona vector**, a **voice sample**, and a **confidence** score.

1. Open the profile URL in the browser using the **claude-in-chrome** tools (load them via ToolSearch if deferred: `mcp__claude-in-chrome__navigate`, `read_page`, `tabs_context_mcp`). Read the **About/bio, headline, and — most important — their recent posts/activity and comments** (their actual words).
   - If the Chrome extension isn't connected, or the profile won't load, **fall back**: ask the user to paste a few of the person's posts, OR proceed on role-archetype defaults and mark confidence LOW. **Never fabricate a voice you didn't observe.**
2. Produce a **persona vector** — rate each axis 0–1 from what you actually read:
   - `data↔narrative` · `formal↔casual` · `terse↔expansive` · `vision↔numbers` · `optimist↔skeptic`
3. Capture a **voice sample** — 3–5 of their *verbatim* phrases that show their diction and cadence. This is what you'll mimic.
4. Set **confidence** HIGH / MED / LOW based on how much of their own writing you actually saw (thin or ghostwritten footprint → LOW → lean on archetype defaults, and say so in the reasoning).
5. Note the **role archetype** (CFO / founder-CEO / procurement / CX-practitioner / ops / …) and **industry** — you'll need these to key the resonance map.

### ② Mandate — what is THIS person on the hook to deliver now

Web-search the company + the person. Find the **1–2 things they must deliver this FY**, in their own framing. Good sources: recent news, earnings/analyst calls, shareholder Q&A, founder interviews, funding announcements, hiring signals. Public data only. Capture a couple of their own proof-points to mirror back.

### ③ Symbiosis % — graded fit, not a yes/no

Read `product_profile.md`. Score two factors 0–1:
- **mandate-centrality** — how central is the pain your stack touches to what they must deliver *right now*?
- **stack-coverage** — how much of that pain does your stack actually solve?

`symbiosis% = mandate-centrality × stack-coverage × 100`, rounded.
- **≥ 60** → full pitch.
- **30–59** → honest, narrower pitch (pitch only the slice that fits).
- **< 30** → **self-park**: don't force a pitch. Report the score and the reason, and stop. Also flag if they *already run* a solution like yours (that's a displacement play, not greenfield — note it).

### ④ The Line — the pain in their voice

1. Read `resonance_map.json`. Look up the slice `"<role>|<industry>"`. If it has learned words/frames, **pre-load them** — favour `words_that_landed`, avoid `words_that_failed`.
2. Draft **one single-line hook** that states their mandate-pain and hands them the solution — written to match the **persona vector + voice sample** from ①. A CFO's line reads in numbers; a founder's in speed; a narrative thinker's in story.
3. Apply **every rule in `craft_rules.md`** (one message = one value-prop, outcome-priced, public-data only, two-beat cadence, frame from THEIR viewpoint, etc.).
4. Then expand to a short note (~120–150 words) around that line, still in their voice.

### ⑤ Output + Reason

Present, in this order:
1. **Verdict** — symbiosis % + one-line why (or the self-park reason).
2. **The single-line hook.**
3. **The short note** (subject + body).
4. **Reasoning trail** — persona read (vector + confidence), their mandate, the symbiosis math, and *why these specific words* (what you pulled from the resonance map, if anything).

---

## Feedback → learning (do this every run, after the output)

Ask the user one light question: **"Does this land — send as-is, tweak, or off?"** Capture their reaction and any rewrite.

Then **update `resonance_map.json`** for the slice `"<role>|<industry>"`:
- If they approved / liked specific words → add those to `words_that_landed` and `frames_that_landed`.
- If they rewrote or rejected → add the words they cut to `words_that_failed`, and the words they added to `words_that_landed`.
- Increment `sends`. Keep a short `notes` trail.

Write the file back as valid JSON. This is the self-improvement loop — the next pitch to a similar persona pre-loads what worked. Learning is **local and private to this user** (this file only); it is never shared.

## Guardrails

- Public data only. Never invent numbers, quotes, or a persona you didn't observe.
- Never quote a company's complaint/failure stats *at* them — frame the gap as their unfinished journey.
- If confidence is LOW, say so — don't pretend to know their voice.
- One value-prop per message. If two angles fit, pick the one on their top mandate.
