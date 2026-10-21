# Divisha Care Log — Strategy

**Status:** Draft for discussion. Nothing here is built yet.
**Next step after this:** agree the decisions in §9, then write the implementation plan.

---

## 1. What we are building, in one paragraph

A private, two-parent app for Divisha's health and care. You *talk* to it the way you would text each other ("fever 38.4 since evening, gave 5 ml paracetamol, kadha at night"). It keeps the full conversation, turns what you said into structured log entries you confirm with one tap, and suggests what to do today. A second view turns any period (week, month, quarter, year) into a short, evidence-linked report: how she is, what is working, what to change, and the exact log entries behind each claim.

## 2. Why the current artifact feels like a 2-year-old made it

Looking at https://claude.ai/artifact/CBFnKs1SsS35MkG8pN6KrE honestly, the problems are structural, not cosmetic:

| Problem | Effect |
|---|---|
| It is **two forms**, not a conversation. You must classify (status vs action, regular vs medicine) *before* typing. | At 11 pm with a sick child you want to type one line and go. |
| **No vocabulary.** `what` is free text; status has 3 values. | Nothing is analysable. "Kadha (basic)" and "kadha" are different things. No dose, no duration, no symptom. |
| **No notion of an illness episode.** | Stats count days, not illnesses. You cannot say "3 colds this quarter, average 5 days, 1 needed antibiotics". |
| **Analysis = 4 counters** over a fixed 30 days. | No comparison, no trend, no "why", no way to drill into the entries behind a number. |
| **No chat history, no suggestions**, no deep links to entries. | The two features you actually asked for are absent. |
| **One 300-line IIFE** with rendering, data and logic interleaved. | Cannot grow into two views without becoming unmaintainable. |

What it got right and we keep: phone-first layout, the well / a-bit-off / sick semantic colours, dark mode, the shared artifact DB with contributor permissions, Hindi home-remedy vocabulary (kadha, steam) as first-class.

## 3. Product framing (who, when, where)

- **Users:** two parents, equal write access. Possibly grandparents or a doctor as read-only later.
- **Primary moment:** phone, 20–60 seconds, late evening or right after a doctor visit. Must be one thumb, one message.
- **Secondary moment:** laptop, 10 minutes, before a paediatrician visit or at month end. This is where the summary view earns its place.
- **Language:** Hinglish is normal input ("kadha", "crocin", "nebuliser"). The model must map it to a controlled vocabulary without making the parent re-type in English.
- **Not a medical device.** It records and reflects. It never computes doses, never diagnoses. It does surface red flags with "call the doctor" guidance (see §7).

## 4. Core architecture: chat is the input, the log is the truth, analysis is derived

This is the single most important decision. Three layers, strictly ordered:

```
 Conversation  ──extract──►  Event log  ──aggregate──►  Analysis
 (messages,                  (structured,                (per period,
  immutable)                  confirmed,                  cached,
                              source of truth)            cites events)
```

**Layer 1 — Conversation.** Every message, both roles, stored forever. Grouped into threads by day (default) or by a topic you name. This is the "chat history in the left pane".

**Layer 2 — Event log.** The thing analysis runs on. Each event is atomic, typed, dated, and points back to the message it came from. Events are proposed by the model and **confirmed by a parent** before they count. Corrections are new events that supersede old ones (append-only, the standard pattern for health records: you never lose what was believed at the time).

Event types (vocabulary loosely borrowed from FHIR so names stay unambiguous):

| Type | Example | Key fields |
|---|---|---|
| `status` | "she's fine today" | well / mild / sick |
| `symptom` | "cough at night", "ear pulling" | symptom code, severity, onset |
| `measurement` | "38.4", "weight 12.3 kg" | kind (temp, weight, height), value, unit |
| `medication` | "5 ml paracetamol", "antibiotic day 3" | name, dose, route, prescribed_by |
| `remedy` | "kadha", "steam", "saline rinse" | name (controlled list, extendable) |
| `visit` | "saw Dr Mehta, said viral" | provider, reason, outcome |
| `milestone` | "first full sentence", "started school" | label |
| `note` | anything else worth keeping | text |

**Episodes** group events into illnesses: an episode opens on the first non-well status after a well streak and closes after N consecutive well days (N tunable, default 3). Episodes are what let the report talk about frequency, duration and what shortened them.

**Layer 3 — Analysis.** Two tiers, deliberately:

1. **Deterministic stats in code** (no model): days by status, episode count and durations, symptom frequency, medication and remedy counts, visits, comparison to the previous period of the same length. These numbers are always right and always reproducible.
2. **Model-written narrative on top of those stats + the raw events**, returned as structured JSON: `status`, `working[]`, `improve[]`, `key_moments[]`. Every item carries `evidence: [eventId, …]`. The UI renders each as a tappable citation that opens the log filtered to exactly those entries. This is the RAG "grounded with citations" pattern, and it is what makes "dig deeper into the right logs" possible without a search box.

Reports are cached per period key (`2026-10`, `2026-Q4`, `2026`) with the event count at generation time, so a report shows "stale, 4 new entries" rather than silently regenerating.

## 5. Chat design

**Behaviours, in priority order:**

1. **One line in, structured out.** You type naturally. The model replies briefly *and* returns proposed events. They render as a **confirm card**: chips you can edit (date, dose, type) with one "Save all" button. Nothing is written to the log until you tap. This is human-in-the-loop extraction and it is non-negotiable for health data.
2. **Suggestions for today** sit above the composer when the thread is empty or fresh for the day. Mostly rule-based so they are instant and free: day 3 of a cough → "steam tonight?"; antibiotic course started 5 days ago → "last dose today?"; no status logged today by 8 pm → "how was she today?"; recurring preventive (vitamin D, flu shot month) → due reminders. A model call can add one contextual suggestion when the rules have nothing.
3. **History in the left pane** (drawer on phone): threads grouped Today / Yesterday / This week / Older, each with a one-line auto title. Search later, not v1.
4. **Streaming replies**, cancellable, with `aria-live` so screen readers follow.
5. **The model has no memory between calls.** We build its context every turn: Divisha's profile, the last ~20 messages of the thread, a compact digest of the last 14 days of events, open episode if any, and the extraction schema. This is a feature: the context is inspectable and the behaviour is predictable.

## 6. Summary design

- **Period control:** segmented Week / Month / Quarter / Year, with previous / next arrows and a "vs previous period" delta on every number.
- **Headline card:** current status, open episode if any, trend arrow against the previous period.
- **Three report sections:** Health status · What is working · Suggestions for improvement. Each bullet ends with citation chips `[3]` → tap → log drawer filtered to those events, with "open full log for this period" at the bottom.
- **Key moments:** a short vertical timeline of the events the model deemed important (visits, new medications, episode starts and ends).
- **Visuals, kept minimal:** a day-strip heatmap (well / mild / sick per day, the single most informative chart for a child's health) and one horizontal bar of symptom frequency. No pie charts, no dashboards.
- **Regenerate** button, "generated 3 days ago · 4 new entries since" badge, and a "what the model saw" disclosure so a report is never a black box.

## 7. Safety and privacy (these shape the design, so they are here, not in an appendix)

- **Red-flag guard runs in code, not in the model.** Age-appropriate thresholds (e.g. fever ≥ 38 °C under 3 months, ≥ 39 °C sustained, breathing difficulty, lethargy, dehydration words, fever > 5 days). When a message or event trips one, the reply leads with a fixed, reviewed "consider calling the doctor now" block. The model cannot suppress it.
- **Doses are recorded, never computed.** If asked "how much paracetamol", the app answers with the last doctor-given dose from the log, or says to check with the doctor. It never calculates mg/kg.
- **A short, permanent disclaimer** in the summary footer; a one-time acknowledgement on first use.
- **Child health data:** no third-party analytics, no tracking pixels, model calls carry only what the turn needs, export-everything (JSON + Markdown) available from day one, delete-everything available and real.
- **Audit:** every event stores `createdBy` and `createdAt`; superseded events are kept with `supersededBy`.

## 8. Where it runs: three options, one recommendation

| | **A. claude.ai artifact runtime** (db + sample + user capabilities) | **B. Inside ProMe** (FastAPI on :8100, SQLite, Jinja) | **C. Standalone service** (FastAPI + SQLite/Postgres on Fly/Railway, Anthropic API) |
|---|---|---|---|
| Both parents on phone, today | ✅ share link, claude.ai login | ❌ localhost on one Mac; needs a tunnel | ✅ with your own auth |
| Auth and sharing | ✅ built in, per-person permissions | ⚠️ API keys only, no users | ⚠️ you build it (magic link / OAuth) |
| Model access | ✅ viewer's account, streaming, tools; no API key to manage | ✅ existing Ollama / Anthropic dispatch | ✅ API key, you pay per call |
| Scheduled jobs (nightly report, 8 pm nudge) | ❌ none; compute on open, cache in db | ✅ launchd nightly already exists | ✅ cron |
| Data ownership and export | ⚠️ in claude.ai; export via `downloads`, Claude can read via ArtifactData | ✅ your SQLite file | ✅ your DB |
| Push notifications | ❌ | ❌ | ⚠️ possible, more work |
| Effort to first usable version | **Low** | Medium (server.py is already 3,400 lines; this is a different product) | High |
| Ongoing ops | None | Keep the Mac awake | Hosting, backups, secrets |
| Fit with ProMe memory later | ✅ monthly report anchors can be pushed via `/api/store` | ✅ native | ✅ via API |

**Recommendation: A for v1**, built behind a thin store boundary so the data layer can move to C (or sync into B) later without touching the UI.

Why: the two features you asked for are both *interaction* problems (a good chat, a good report), not infrastructure problems. Option A gives both parents a working phone app with shared data and Claude access on day one, and it is where the current log already lives. ProMe stays what it is: *your* work memory. A child's health log is a different product with different users; bolting it onto a 3,400-line work-management server would make both worse. The honest costs of A are no scheduled jobs and no push, and the design above already compensates (suggestions compute on open, reports cache with a stale badge).

What "thin store boundary" means concretely: one module exposes `listEvents(range)`, `addEvents([...])`, `listMessages(threadId)`, `addMessage(...)`, `getReport(periodKey)`, `putReport(...)`. The artifact `db` is the first implementation. Nothing else in the app touches the database.

## 9. Frontend approach

- **No build step, no framework.** Plain ES modules served as artifact `files`: `index.html`, `styles.css`, `js/store.js`, `js/chat.js`, `js/extract.js`, `js/suggest.js`, `js/stats.js`, `js/report.js`, `js/ui.js`. Two views, one shell, one state object, region-level re-render. If the chat view grows past comfort, Preact + htm from a CDN is a drop-in; we will not need it for v1.
- **Design tokens first:** colour (keep the current well / mild / sick semantics), a 4-pt spacing scale, a 5-step type scale, radius, elevation. Light and dark from the same tokens.
- **Layout:** phone-first single column with a history drawer; at ≥ 900 px a two-pane layout (history left, content right). The chat / summary toggle is a segmented control in the top bar and is remembered per device.
- **Accessibility:** 44 px targets, visible focus, `aria-live` on streamed text and on the confirm card, reduced-motion respected, every citation a real button.
- **Performance:** one `onSnapshot` on events in the visible range, one on the open thread, messages paginated (200, load older). No subscriptions created inside render.
- **Charts:** follow the dataviz guidance already in this workspace; two charts total (§6).

## 10. Phased plan (preview; the plan document will detail each)

| Phase | Delivers | Done when |
|---|---|---|
| **0 · Decisions** | Answers to §11 | This file is marked "Agreed" |
| **1 · Foundation** | Store module on artifact db, event + message schema, design tokens, shell with chat/summary toggle, responsive two-pane | Empty app loads on phone and laptop, both parents can open it |
| **2 · Chat** | Threads + history pane, composer, streaming reply, extraction + confirm card, rule-based today suggestions, red-flag guard | A real evening's message produces confirmed events in the log |
| **3 · Summary** | Period control, deterministic stats, model report with citations, log drawer deep links, heatmap + symptom bar, caching + stale badge | A month report reads sensibly and every claim opens the right entries |
| **4 · Migration + hardening** | Import the existing artifact's entries, export (JSON/MD), delete-all, disclaimer, empty/error states, dark-mode pass | Old data visible in the new app; nothing left to do before daily use |
| **5 · Later** | Search, reminders via calendar, read-only sharing, monthly anchors into ProMe, move store to a hosted DB if ever needed | As wanted |

Phases 1–3 are each one working session. Each ends with a published artifact you can use.

## 11. Decisions needed from you

1. **Hosting:** A (artifact runtime) as recommended, or B/C?
2. **Code location:** a `divisha/` folder in this repo (proposed, already created for this file), or its own repo?
3. **Divisha's age / birth date.** Red-flag thresholds and milestone suggestions depend on it.
4. **Regular routine to seed suggestions:** daily preventive items (kadha, vitamin D, …), any ongoing prescription, paediatrician name.
5. **Who else sees it:** just the two of you for v1?
6. **Migrate the existing entries** from the current artifact into the new log? (Recommended yes; it is a small script.)
7. **Report tone:** clinical-brief or warm-parent? Affects the prompt, not the architecture.

## 12. References behind the choices

- Append-only, correction-by-supersession event logs for health records (FHIR `Observation` / `MedicationAdministration` / `Encounter` resource model; event-sourcing practice).
- Human-in-the-loop extraction before persistence (standard in clinical NLP; avoids silent mis-logging).
- Grounded generation with per-claim citations (RAG practice; the only reliable way to make "dig deeper" work).
- Chat UX conventions users already know: sidebar history grouped by recency, suggestion chips on empty state, streaming, structured tool-result cards (ChatGPT / Claude.ai).
- Health-tracker UX: period comparison against the previous period and day-strip heatmaps (Apple Health trends; Huckleberry and Baby Tracker for one-thumb logging).
- Deterministic metrics + narrative layer, never narrative alone (so numbers are reproducible and auditable).
