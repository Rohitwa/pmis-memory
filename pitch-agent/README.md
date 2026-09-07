# PitchGraph — research anyone, pitch them in their own voice, get smarter every send

Give it **one name or LinkedIn link**. It reads how that person thinks and writes, finds what
their company must deliver right now, scores the fit against **your** product, and drafts a
short pitch in **their** voice — then shows you every step and how long it takes.

It learns from you. Tell it what happened (or drop a screenshot of the reply) and it remembers
which angles and words worked for which kind of person, so the tenth pitch to a CFO starts
from proven language, not from scratch. Everything stays on your computer.

Works inside **OpenAI Codex**, **Claude Code / Claude Desktop**, or **Gemini CLI** — no
installs, no accounts, no code. The whole "program" is one instruction file, `AGENTS.md`.

---

## Install — 3 steps, any engine

### Step 1 — get the folder onto your computer

**If you don't use git (most people):** click the green **Code** button at the top of this
page → **Download ZIP**. Unzip it. Rename the folder to `pitch-agent` and put it somewhere
you'll find again (Desktop or Documents is fine).

**If you use git:**

```bash
git clone https://github.com/Rohitwa/B2B_Sales pitch-agent
```

### Step 2 — open the folder in your AI engine

| Engine | How to open the folder | It reads |
|---|---|---|
| **Codex** (desktop app) | *Open project* → choose the `pitch-agent` folder | `AGENTS.md` automatically |
| **Codex** (terminal) | `cd pitch-agent` then `codex` | `AGENTS.md` automatically |
| **Claude Code** (desktop app) | *Open folder* → `pitch-agent` | `CLAUDE.md`, which loads `AGENTS.md` |
| **Claude Code** (terminal) | `cd pitch-agent` then `claude` | `CLAUDE.md`, which loads `AGENTS.md` |
| **Claude Desktop / Cowork** | add `pitch-agent` as the project folder | paste `AGENTS.md` as the project instruction if it isn't picked up |
| **Gemini CLI** | `cd pitch-agent` then `gemini` | `GEMINI.md`, which loads `AGENTS.md` |
| **Anything else** with file access | tell it the folder path | paste the contents of `AGENTS.md` as its instructions |

### Step 3 — type `setup`

The agent first tells you what it can do on your engine (search the web? open pages? read
screenshots?), then asks for your sales strategy. Give it a **PDF** (drop it in the folder)
or just **answer up to six questions** in chat. It writes its own config files. Done.

---

## Use it

Type plain words. These are the things it understands:

| You want to… | Type |
|---|---|
| Pitch one person | `pitch https://linkedin.com/in/someone` or `pitch "Anita Rao, CFO at Chemours"` |
| Check if someone is worth pitching (no draft) | `qualify <link or name>` |
| Redo the last pitch differently | `rewrite for whatsapp` · `rewrite try the collections angle` |
| Research a whole list, one by one | `batch` + paste the list, or drop a CSV/Excel in the folder |
| See everyone so far | `board` |
| Draft the next touch | `followup Anita Rao` |
| Shelve or bring back a prospect | `park Anita Rao` · `revive Anita Rao` |
| Teach it what happened | `feedback` + paste the reply or drop a screenshot |
| See what it has learned | `learnings` |
| Remove a bad learning or a person's data | `forget "cutting-edge AI"` · `forget Anita Rao` |
| Tidy the memory and get a report | `consolidate` |
| See or change your strategy | `strategy` · `strategy edit pricing` |
| Not sure what to do | `help` |

**Every command tells you what it's about to do, how long it'll take, and when it's done** —
so you can hand it a batch of 12 leads and walk away. Each lead's pitch is posted as it
finishes, and you get a summary table at the end.

**What a pitch looks like:** a fit score with a one-line reason, a single-line hook, a short
note (subject + body), and the reasoning — how it read the person, what their company is on
the hook for, and which past learnings it reused. Weak fits (under 30%) are parked with a
reason instead of forced into a message.

---

## Your data

- Your strategy, the learning memory, and every research run live in `strategy/`, `graph/`
  and `runs/` **inside your folder only**. They are git-ignored, so even if you update from
  this repo later they are never uploaded or overwritten.
- The only thing that leaves your machine is the web searching the agent does to research a
  person or company — the same as if you searched yourself.
- The agent **never sends anything**. It drafts; you copy, review, and send.
- `forget <name>` removes everything about a person, for "please delete my data" requests.

## Updating

Download the ZIP again (or `git pull`) and replace `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
`craft_rules.md`. Your `strategy/`, `graph/`, `runs/` folders are untouched.

## What's in the folder

| File | |
|---|---|
| `AGENTS.md` | **the agent** — the entire system, one file; Codex reads it directly |
| `CLAUDE.md` · `GEMINI.md` | one-line loaders so Claude Code and Gemini CLI run the same `AGENTS.md` |
| `craft_rules.md` | the stable writing rules the agent applies to every draft (you may edit) |
| `SKILL.md` · `product_profile.example.md` · `resonance_map.example.json` | the original `/pitch` Claude Code skill — an older, lighter variant; install with `git clone … ~/.claude/skills/pitch` if you only want that |

## How it works, in one paragraph

Most cold outreach is written in the sender's voice about the sender's product. This flips
it: the prospect's own mindset and current mandate lead, and the message is spoken back to
them in their language. A graded fit score keeps it honest — weak fits self-park. And because
it remembers which angle, opener, and words earned replies for each kind of person
(`CFO in chemicals`, `founder in logistics`), counted as wins over tries rather than
guesses, it compounds — and it occasionally tries the runner-up so it never stops learning.
