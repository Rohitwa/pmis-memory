# Divisha Wellness — Design

One page. Read it top to bottom and you know everything the app does, what it saves, and how it is built.

---

## 1. Who it is for, and when they use it

Two parents. Three moments.

| Moment | Where | What you want |
|---|---|---|
| **End of the day** | Phone, one minute | Say how she was and what you gave her, then put the phone down. |
| **Before a doctor visit** | Phone or laptop, five minutes | See the last few weeks at a glance and show the doctor. |
| **Once a month** | Laptop, ten minutes | Ask: is she getting better? What is working? What should we change? |

Everything below exists to serve one of these three moments. If a feature serves none of them, it is not in the app.

## 2. The app is two screens

A switch at the top flips between them: **Talk** and **Look back**.

### Talk

```
┌──────────────┬──────────────────────────────────────────┐
│ Past chats   │  Divisha Wellness       [Talk|Look back] │
│              │                                          │
│ Today        │  You: Fever 38.4 since evening, gave     │
│ Yesterday    │       5 ml crocin, kadha before bed      │
│ Mon 26 Oct   │                                          │
│ Sun 25 Oct   │  Claude: Sorry she's unwell. Keep fluids │
│ ...          │  going. I'll note this down:             │
│              │  ┌────────────────────────────────────┐  │
│              │  │ Symptom   Fever 38.4               │  │
│              │  │ Care      Paracetamol 5 ml         │  │
│              │  │ Care      Kadha                    │  │
│              │  │              [Edit]   [Save all]   │  │
│              │  └────────────────────────────────────┘  │
│              │                                          │
│              │  Ideas for today:  (Steam tonight?)      │
│              │                    (How is she now?)     │
│              │  [ Type here...                    Send ]│
└──────────────┴──────────────────────────────────────────┘
```

- **You type the way you text each other.** Hindi words like kadha, crocin and bhaap are fine.
- **Claude answers and offers to note things down.** Nothing is saved until you tap **Save all**. You can fix anything first.
- **Ideas for today** sit above the typing box. They come from simple rules, for example "she had a cough yesterday, try steam tonight?" or "you haven't said how she was today".
- **Past chats** are on the left, one per day. On a phone they slide in from the side.

### Look back

```
┌────────────────────────────────────────────────────────┐
│  Divisha Wellness                     [Talk|Look back] │
│                                                        │
│  [Week] [Month] [Year]        ‹  October 2026  ›       │
│                                                        │
│  22 well days   6 off days   2 sick spells   1 doctor  │
│  (+5 vs Sept)   (-4)         (same)          (-1)      │
│                                                        │
│  ■■■■■□■■■■■■■■■▲▲■■■■■■■■■■■■   one square per day    │
│                                                        │
│  How she is now                                        │
│   • Fully well for the last 9 days.          see 3 ›   │
│  What's working                                        │
│   • Steam at night ended both coughs in 2 days. see 4 ›│
│  Try next                                              │
│   • Colds followed cold evenings out. Carry a jacket.  │
│                                              see 2 ›   │
│  Important moments                                     │
│   • 12 Oct  Doctor: viral, no antibiotic   ›           │
│                                                        │
│  [Open all October entries]       Written 2 days ago   │
└────────────────────────────────────────────────────────┘
```

- **You pick the time span.** Week, month or year, with arrows to step back and forward.
- **The numbers at the top are counted by the app, not guessed by Claude.** Each one shows the change from the period before.
- **The coloured strip** shows each day as well, a bit off or sick. It is the fastest way to see a pattern.
- **Claude writes three short sections:** how she is now, what's working, and what to try next.
- **Every point has a "see" link.** It opens exactly the entries that point is based on. This is how you dig deeper.
- **"Open all entries"** shows the full list for the period, which you can filter by type.
- **Claude writes only when you tap.** The notes are saved, so reopening a month is instant. They show when they were written and how many entries changed since, with a Rewrite button.

**How the app counts.** These rules are the same everywhere and are tested.

| Rule | In plain words |
|---|---|
| A day's colour | The latest "How she is" entry that day decides it. A day with a symptom but no "How she is" counts as a bit off. A day with neither is grey, "not noted". |
| A sick spell | Off or sick days in a row. A day with nothing noted ends the spell. |
| Comparing | A finished span is compared with the whole one before. A span still in progress is compared with the same number of days of the one before, shown as "September so far". |
| Grey days and Claude | Claude is told they are unknown, never that she was well. |
| Claude's points | Each must name the entries behind it. The app drops any point whose entries don't exist. |

## 3. What the app saves

Four things. That is all.

| What | One example | Why we keep it |
|---|---|---|
| **About Divisha** | Birth date, allergies, doctor's name and number, her daily routine (kadha, vitamin D) | So Claude's answers and the "ideas for today" fit her. You fill it in once in Settings. |
| **Chats** | Everything you and Claude said, grouped by day | So you can scroll back and see what you were thinking at the time. |
| **Entries** | "21 Oct · Care · Paracetamol 5 ml · given at 9 pm · added by Rohit" | The diary. The summaries are built only from these. |
| **Summaries** | "October 2026" report, written on 26 Oct | So you can reopen a month without waiting for Claude again. |

**Every entry has the same five parts:** date, type, what, details, who added it. There are five types:

| Type | Examples |
|---|---|
| **How she is** | Well, a bit off, sick |
| **Symptom** | Fever 38.4, cough at night, ear pulling, loose motions |
| **Care given** | Kadha, steam, saline drops, paracetamol 5 ml, antibiotic day 3 |
| **Doctor** | Visit to Dr Mehta, said viral, no antibiotic |
| **Growth** | Weight 12.3 kg, first full sentence, started school |

You can edit or delete any entry from the list. Doses are saved exactly as you wrote them.

## 4. How Claude fits in

Claude has two jobs, and only two.

1. **In Talk**, it reads your message and replies. It also suggests which entries to save.
2. **In Look back**, it reads that period's entries and the app's numbers, then writes the three sections.

Claude does not remember anything by itself. Each time, the app hands it a short packet: what we know about Divisha, the last two weeks of entries, and the chat so far. A small "What Claude saw" link under each answer shows you that packet, so nothing is hidden.

## 5. Three safety rules, built into the app

1. **Warning signs always show a "call the doctor" message.** Examples are very high fever for her age, trouble breathing, unusual sleepiness, or fever for five days. The app checks for these itself, so the message appears even if Claude misses them.
2. **The app never works out a medicine dose.** If you ask, it shows the last dose the doctor gave from your entries.
3. **Nothing goes into the diary without your tap.**

## 6. Where it lives

It is a claude.ai page, the same kind as the current Divisha Health Log. Both of you sign in with your claude.ai accounts and see the same diary. Saving uses the page's built-in storage. There is no server to run, nothing to install, and nothing to pay for beyond your Claude plans.

**The honest limits:** it cannot send you a reminder at 8 pm, and it only works when you are online. The "ideas for today" appear when you open it instead.

## 7. How it is built

Five files. Each one has one job and is named for it.

| File | Its one job | Roughly |
|---|---|---|
| `index.html` | The layout of both screens | 150 lines |
| `style.css` | How it looks, in light and dark | 300 lines |
| `screens.js` | Draws the screens and handles taps | 500 lines |
| `diary.js` | Saves and loads the four things in section 3 | 150 lines |
| `helper.js` | Talks to Claude, counts the numbers, makes the "ideas for today", checks warning signs | 400 lines |

Plus one test file that checks the counting, the ideas and the warning signs with made-up data.

The rule that keeps it understandable: **only `diary.js` saves or loads, and only `helper.js` talks to Claude.** If saving breaks, you look in one file. If an answer is wrong, you look in the other.

**Where they are:** the five files are in `divisha/app/`. The live page is https://claude.ai/artifact/Pro9ma6DELS2utcssBPCRp.

**How saving is laid out.** The page's storage holds at most 25,000 items, so each day's chat is one item, not one item per message. Inside it, each message has its own key, so two parents writing at the same moment don't overwrite each other. Each diary entry is its own item, which leaves room for many years.

**Checking it works:**

```bash
node --test divisha/tests/*.test.js      # the counting, ideas, warnings and Claude packet
```

`divisha/tests/browser/` runs the whole app in a headless browser with a stand-in for claude.ai. Its README says how.

## 8. Build order

Three steps. After each one you have something to open on your phone.

| Step | After this step you can |
|---|---|
| **1. Talk** | Fill in Settings, chat about her day, save entries, see past chats, get ideas for today and warning messages. |
| **2. Look back** | Pick a week, month or year and read the numbers, the coloured strip, Claude's three sections, and open the entries behind each point. |
| **3. Move in** | See the old Health Log entries in the new diary, download everything as a file, and find a "we've moved" note on the old page. |

The old Health Log has no saved entries today. Step 3 still copies across anything you add before switching.

## 9. What we cut from the earlier plan, and why

| Cut | Why it's fine |
|---|---|
| Eight entry types and a medical word list | Five plain types cover everything you described. Claude understands Hindi words without a list. |
| Illness "episodes" as a separate concept | Counting sick days and runs of sick days says the same thing in plain words. |
| Keeping every old version of an edited entry | You can just edit or delete. Each entry still shows who added it. |
| Twenty code files and a test per module | Five files and one test file. Small enough to read in an evening. |
| Seven open decisions before starting | Her details go in Settings inside the app. Nothing blocks step 1. |

The earlier strategy and plan are still in the git history if you want them back.
