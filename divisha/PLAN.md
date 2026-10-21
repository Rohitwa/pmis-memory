# Divisha Wellness — Implementation Plan

**Status:** Ready to execute. Decisions taken: artifact runtime (option A), this repo under `divisha/`, migrate old entries.
**Companion:** `STRATEGY.md` (why). This file is the *what* and *in which order*.
**Name:** Divisha Wellness. The aim is her life getting better over time, not a sick-day log. The name shows up in the page title, the empty states and the report header.

Open inputs that are **not** blocking: her birth date, routine, paediatrician and report tone are collected in the app's Settings sheet (Phase 1), so the plan does not wait on them.

---

## 0. Ground rules for every phase

- **Ship a working artifact at the end of each phase.** Nothing lands half-wired.
- **Pure logic is pure.** Episodes, stats, suggestions, red flags, vocabulary, prompt building and response parsing are plain functions in their own modules with Node tests. The UI only renders what they return.
- **One store module touches the database.** Everything else calls `store.*`.
- **No framework, no bundler.** ES modules served as artifact files. Node 22 runs the tests (`node --test divisha/tests`).
- **Health data rules** from the strategy apply to every change: confirm before persisting, red flags in code, doses never computed, append-only with supersession.
- **Design tokens before components.** Every colour, radius and spacing comes from `tokens.css`.

## 1. Repository layout

```
divisha/
├── STRATEGY.md
├── PLAN.md
├── app/                         # everything that gets published
│   ├── index.html               # shell: topbar, Chat|Summary toggle, panes
│   ├── styles/
│   │   ├── tokens.css           # colours (light+dark), type scale, spacing, radius, elevation
│   │   ├── base.css             # reset, typography, layout grid, drawer, focus
│   │   └── components.css       # chips, cards, confirm card, bubbles, heatmap, bottom sheet
│   └── js/
│       ├── main.js              # boot: resolve capabilities, pick store, mount views
│       ├── store.js             # DbStore (artifact db) + MemoryStore (local dev/tests); same interface
│       ├── ids.js               # time-ordered ids, period keys, date helpers
│       ├── vocab.js             # symptoms / remedies / medications / measurements + Hinglish aliases
│       ├── episodes.js          # assignEpisodes(events) → episodes[] (pure, deterministic ids)
│       ├── stats.js             # computeStats(events, range, prevRange) (pure)
│       ├── suggest.js           # suggestionsForToday(profile, recentEvents, now) (pure)
│       ├── redflags.js          # detectRedFlags(profile, text, proposedEvents) (pure)
│       ├── prompts.js           # buildChatPrompt(...), buildReportPrompt(...) (pure)
│       ├── extract.js           # parseChatReply(text) → {reply, events}; validateEvent() (pure)
│       ├── report.js            # generateReport(...) orchestrates stats → prompt → sample → validate → store
│       └── ui/
│           ├── shell.js         # topbar, view toggle, responsive panes, settings sheet
│           ├── chat.js          # thread list, message list, composer, streaming, suggestions
│           ├── confirmCard.js   # proposed events → editable chips → save
│           ├── summary.js       # period bar, headline, sections, key moments, regenerate
│           ├── heatmap.js       # day-strip status heatmap + symptom bars (SVG)
│           └── logDrawer.js     # filtered event list (citations, "open logs"), edit/supersede
├── fixtures/
│   └── sample-events.json       # 60 days of realistic events for local dev + tests
├── scripts/
│   └── migrate_old_entries.py   # old `entries` docs → new `events` docs (JSON in, JSON out)
└── tests/
    ├── episodes.test.js  stats.test.js  suggest.test.js  redflags.test.js
    ├── vocab.test.js     extract.test.js  prompts.test.js  ids.test.js
    └── migrate.test.py
```

## 2. Data model (final)

All collections top-level and flat: the db scans a collection on query, so each one stays in the hundreds-to-low-thousands. Ids are time-ordered (`base36(ms) + 4 random chars`) so id order is chronological.

| Collection / doc | Fields | Notes |
|---|---|---|
| `profile/divisha` | `name, dob, allergies[], paediatrician{name, phone}, routines[], reportTone ('brief'|'warm'), disclaimerAckBy[]` | Single document. `routines[]`: `{id, label, kind: remedy|medication|checkup, cadence: daily|weekly|monthly|yearly, timeOfDay?, startDate, endDate?}`. Edited in Settings. |
| `threads/{id}` | `title, dateKey, startedAt, lastAt, messageCount, lastPreview` | One per day by default; "New topic" starts a named one. |
| `messages/{id}` | `threadId, role ('user'|'assistant'), text, createdAt, authorId, eventIds[], proposal?, redFlags[]` | `proposal` holds an unconfirmed extraction so a card survives reload. Cleared on save/dismiss. Query: `threadId ==`, order `createdAt`, limit 200. |
| `events/{id}` | `type, date (YYYY-MM-DD), time?, data{}, note, sourceMessageId?, createdBy, createdAt, status ('active'|'superseded'), supersedes?, supersededBy?, imported?` | Source of truth. Query by `date >= / <=`. Edits create a new event and mark the old `superseded`. |
| `reports/{periodKey}` | `periodKey, kind, from, to, generatedAt, generatedBy, eventCount, stats, body, modelTierApplied` | `body = {status, working[], improve[], keyMoments[]}`; every item `{text, evidence: [eventId]}`. |

`data{}` per event type:

| type | data |
|---|---|
| `status` | `{level: 'well'|'mild'|'sick'}` |
| `symptom` | `{code, label, severity: 1-3, custom?: true}` |
| `measurement` | `{kind: 'temp'|'weight'|'height', value, unit}` |
| `medication` | `{code, label, dose?, unit?, route?, prescribedBy?, custom?}` |
| `remedy` | `{code, label, custom?}` |
| `visit` | `{provider?, reason?, outcome?}` |
| `milestone` | `{label}` |
| `note` | `{}` (text lives in `note`) |

**Episodes are computed, not stored.** `assignEpisodes(events)` returns `[{id: 'ep-YYYY-MM-DD', startDate, endDate|null, days, maxLevel, eventIds}]`. An episode opens on the first `mild`/`sick` status or any symptom after ≥ 3 well days, and closes after 3 consecutive days with no symptom and no non-well status. Deterministic, so a report's episode citations stay valid without a sync step.

**Capabilities declared:** `{db: {}, user: {}, sample: {}, downloads: true}`. Default rules: both parents are Contributors or above and write shared data; a Viewer can read only. Per-device preferences (last view, drawer state) use `localStorage`.

## 3. Model calls (exactly two prompt shapes)

**Chat turn** — one `sample()` call per user message, `modelTier: "default"`, `cache: false`, streamed. The prompt asks for prose first, then a single fenced JSON block. The UI streams the prose into the bubble; `extract.parseChatReply` splits off the fence at the end. One request gives both the reply and the proposed events.

Prompt contents, in order: standing rules (role, Divisha's profile, today's date, the controlled vocabulary with aliases, the JSON shape, "never compute doses, never diagnose"), the last 14 days of events as compact lines (`[id] date type label …`), the open episode if any, the last 20 messages of the thread, the new message.

JSON shape returned:
```json
{"events":[{"type":"symptom","date":"2026-10-21","data":{"code":"fever"},"note":"since evening"},
           {"type":"measurement","date":"2026-10-21","data":{"kind":"temp","value":38.4,"unit":"C"}},
           {"type":"medication","date":"2026-10-21","data":{"code":"paracetamol","dose":5,"unit":"ml"}}]}
```
`extract.validateEvent` coerces types, maps aliases through `vocab`, marks unknown codes `custom: true`, defaults missing dates to today, drops anything malformed. `redflags.detectRedFlags` runs on the message text and the validated events; a hit prepends the fixed red-flag block to the reply and tags the message.

**Report** — one `sample.json()` call per (period, regenerate), `modelTier: "default"`, `cache: false`. Input: `stats` from `stats.js` (numbers the model must not recompute), episodes, and the event lines for the period. Above ~1,500 events (long year ranges) status and remedy events collapse to monthly aggregates; symptoms, medications, visits, measurements and milestones always stay as individual lines. The reply is validated: every `evidence` id must exist in the period or it is removed; an item with no surviving evidence is dropped. Stored with `eventCount` so the UI can show "N new entries since".

Both prompts are built by pure functions in `prompts.js` with tests on size and structure, and both are shown verbatim behind a "What the model saw" disclosure.

## 4. Phases

### Phase 1 — Foundation (one session)

Deliverable: an empty but real Divisha Wellness artifact that both parents can open on phone and laptop, with Settings working.

1. **Smoke publish first** (risk check): `index.html` + one `type="module"` script + one CSS file published via `files`. Confirms relative module imports and CSS load on the artifact host before anything else is written. If they don't, fall back to inlining modules at publish time with a tiny concat script and the plan continues unchanged.
2. `tokens.css`: light/dark palettes (keep well/mild/sick semantics), 4-pt spacing, 5-step type scale, radius, elevation, motion tokens with reduced-motion guard.
3. `base.css` + `shell.js`: topbar (title, Chat|Summary segmented control, settings), responsive panes (single column + drawer < 900 px, two panes ≥ 900 px), bottom-sheet primitive, focus ring, `aria-live` region.
4. `ids.js`, `vocab.js` with tests. Vocabulary seeded with: symptoms (fever, cough, cold, blocked nose, ear pain, vomiting, loose motions, rash, poor appetite, poor sleep, teething, constipation, wheeze, sore throat), remedies (kadha, steam, saline rinse, honey-ginger, warm compress, oil massage, saline nebuliser), medications (paracetamol, ibuprofen, levocetirizine, cetirizine, ORS, antibiotic, nasal drops, ear drops, salbutamol nebuliser, vitamin D), measurements (temp, weight, height). Alias table includes crocin/calpol → paracetamol, kada/kaadha → kadha, bhaap → steam, dast → loose motions, ulti → vomiting.
5. `store.js`: interface `getProfile / saveProfile / listThreads / getThread / createThread / listMessages(threadId) / addMessage / updateMessage / listEvents(from, to) / addEvents([]) / supersedeEvent / getReport(key) / putReport`. `DbStore` on artifact db with `onSnapshot` subscriptions exposed as `subscribe*` methods; `MemoryStore` seeded from `fixtures/sample-events.json` used when `claude.use("db")` resolves null (local dev, tests, screenshots).
6. Settings sheet: name, birth date, allergies, paediatrician, routines editor, report tone, disclaimer acknowledgement. Writes `profile/divisha`.
7. Boot: `main.js` resolves `db`, `user`, `sample`, `downloads`; renders immediately without them; lights features up as they resolve; read-only mode when `user.can("data.write")` is false.
8. **Verify:** publish; `ArtifactData list profile`; open on phone width and desktop width in headless Chromium against `MemoryStore`; screenshots saved to the scratchpad.

Done when: artifact loads for both parents, Settings saves and reloads, dark mode and phone layout are correct, tests pass.

### Phase 2 — Chat (one session)

Deliverable: an evening's message becomes confirmed events in the log.

1. `episodes.js` with tests (opening/closing rules, deterministic ids, lookback).
2. `suggest.js` with tests. Rules, in priority order: red-flag follow-up ("fever logged 3 times in 24 h, how is she now?"); medication course check ("antibiotic started 5 days ago, is the course done?"); open episode day ≥ 3 → the remedy that previously ended episodes fastest ("steam tonight?"); routine due today not logged (from `profile.routines`); no status today after 18:00 → "how was she today?"; well streak ≥ 7 days → "log a milestone or a happy note?". Max 3 chips; each prefills the composer.
3. `redflags.js` with tests. Age bands from `profile.dob`: < 3 months any temp ≥ 38; 3–36 months ≥ 39 or any temp with lethargy words; any age: breathing difficulty words, fever ≥ 5 days in the open episode, no fluids / very few wet nappies words, rash + fever, seizure words. Output: fixed copy blocks, never model text.
4. `prompts.js` (chat shape) and `extract.js` (parser + validator) with tests, including malformed JSON, missing fence, unknown codes, Hinglish aliases, future dates.
5. `chat.js`: thread list grouped Today / Yesterday / This week / Older; message list with day separators; composer (auto-grow, Enter sends, Shift+Enter newline, Stop button wired to `AbortController`); streaming into the bubble; suggestion chips above the composer; empty-state copy that says what to type.
6. `confirmCard.js`: proposed events as chips grouped by type; tap a chip to edit date / value / dose / label in a small popover; "Save all" writes events via `store.addEvents`, sets `message.eventIds`, clears `proposal`; "Dismiss" clears it. Card persists across reload via `message.proposal`.
7. `logDrawer.js` v1: list events for a day or a set of ids; "Edit" creates a superseding event; "Remove" supersedes with no replacement.
8. **Verify:** tests; a scripted conversation against `MemoryStore` in headless Chromium (mocked `sample` returning a canned reply) ends with the expected events; then one real exchange on the published artifact and an `ArtifactData` read of `events` and `messages`.

Done when: a real message produces a confirm card, saving creates correct events, red-flag copy appears for a trip-wire message, suggestions change with the data.

### Phase 3 — Summary (one session)

Deliverable: a month report that reads well and whose every claim opens the right entries.

1. `stats.js` with tests: days by status (latest status per day wins), episodes (count, mean/max days, by max level), symptom frequency, remedy and medication counts, visits, measurements (latest weight/height, max temp), all with deltas vs the previous period of equal length.
2. `prompts.js` (report shape) with tests including the >1,500-event collapse rule and the 256 KiB input cap.
3. `report.js`: orchestrate stats → prompt → `sample.json` → validate evidence → `store.putReport`; stale detection (`eventCount` vs current); error copy per rejection code (`not_granted`, `rate_limited`, `invalid_json`, `truncated`).
4. `summary.js`: period bar (Week / Month / Quarter / Year, prev / next), headline card (current status, open episode, trend), the three sections with citation chips `[n]`, key moments timeline, "Regenerate", "N new entries since", "What the model saw" disclosure, disclaimer footer.
5. `heatmap.js`: day-strip heatmap (well / mild / sick, grey for no entry) and a symptom frequency bar list, both SVG, both token-coloured, both with a text alternative. Follows the workspace dataviz guidance.
6. `logDrawer.js` v2: open from a citation (filtered to those ids) or from "Open logs for this period" (filter chips by type; day grouping; link back to the source message).
7. **Verify:** tests; generate a report against the fixture data in headless Chromium with a canned model reply and check every citation resolves; then one real report on the published artifact and an `ArtifactData` read of `reports`.

Done when: month and year reports render on phone and desktop, all citations resolve, regenerate updates the stale badge, charts read in both themes.

### Phase 4 — Migration, export, hardening (one session)

1. `scripts/migrate_old_entries.py` + test: reads a JSON dump of the old artifact's `entries` (`status` → `status` event; `regular` → `remedy` via vocab aliases; `emergency` → `medication` if the `what` matches a medication, else `visit` if it mentions doctor/ENT/paediatrician, else `note`), preserves `note`, sets `imported: true, importedFrom: <oldId>`, `createdBy: 'import'`. Run: `ArtifactData list entries` on the old artifact → file → script → `ArtifactData batch` into the new artifact (≤ 50 per batch). Today the old collection reads empty; the step still runs so anything added before switch-over comes across.
2. Republish the old artifact as a one-screen "Divisha Health Log has moved to Divisha Wellness →" page with the new link.
3. Export: "Download everything" in Settings → `downloads.save` of `divisha-wellness-YYYY-MM-DD.json` (profile, threads, messages, events, reports) and a Markdown log.
4. Delete-all in Settings behind a typed confirmation; supersedes nothing, truly deletes.
5. Empty, loading, error and offline states for every view; read-only mode copy; first-run disclaimer; dark-mode and 320 px pass; keyboard-only pass; `prefers-reduced-motion` pass.
6. README section in `divisha/` on how to run tests, how to publish, how to add vocabulary.

Done when: both parents use it daily and nothing in this file is unticked.

### Phase 5 — Later (not scheduled)

Search across messages and events; reminders into Google Calendar via the `mcp` capability; read-only link for grandparents or the doctor; a monthly summary pushed into ProMe as anchors under a "Divisha Wellness" super-context; moving `DbStore` behind a hosted API if ever needed.

## 5. Verification per phase (how "done" is checked, not just claimed)

| Check | Tool | When |
|---|---|---|
| Pure modules | `node --test divisha/tests` | Every commit |
| Layout at 390 px and 1280 px, light and dark | Headless Chromium + `MemoryStore`, screenshots in scratchpad | End of each phase |
| Real data round-trip | `ArtifactData` read of each collection the phase writes | After each publish |
| Read-only viewer | `ArtifactData` with `as_level: "view"` must not write | Phase 1 and 4 |
| Model calls | One real exchange / one real report on the published artifact | Phases 2 and 3 |
| Accessibility | Keyboard-only walk-through, `aria-live` announces, contrast from tokens | Phase 4 |

## 6. Risks and the decision already taken for each

| Risk | Decision |
|---|---|
| Relative ES module imports might not resolve on the artifact host | Phase 1 step 1 tests it first; fallback is a concat-at-publish script, no design change |
| One model call per message costs on the viewer's account | Single combined prose+JSON call; `quick` tier is not used for extraction because accuracy matters more than a second |
| `sample` has no memory | Context is rebuilt every turn from the store; visible in "What the model saw" |
| No scheduled jobs | Suggestions compute on open; reports cache with stale badge; nightly nudges are Phase 5 via calendar |
| Hinglish and spelling variants | Alias table in `vocab.js`, unknowns kept as `custom` and surfaced on the confirm card so they can be promoted to the vocabulary |
| Two parents editing the same event | Append-only supersession; last writer wins on the thread doc only, which carries no truth |
| Prompt grows past the 256 KiB cap on year reports | Collapse rule in `prompts.js`, tested |
| Medical liability | Red flags in code, fixed copy, no dose computation, disclaimer, acknowledged once per user |

## 7. First commands of Phase 1

```bash
mkdir -p divisha/app/{styles,js/ui} divisha/fixtures divisha/scripts divisha/tests
node --test divisha/tests          # empty suite passes
# smoke publish: divisha/app/index.html + styles/tokens.css + js/main.js via the Artifact tool with `files`
```
