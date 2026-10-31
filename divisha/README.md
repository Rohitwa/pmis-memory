# Divisha Wellness

A shared diary for Divisha's health and care, made for two parents.
You tell Claude about her day in **Talk**. You see how she's doing over a
week, month or year in **Look back**.

- **Live page:** https://claude.ai/artifact/Pro9ma6DELS2utcssBPCRp
- **Why it's built this way:** [DESIGN.md](DESIGN.md)

## The five files

All in `app/`. Each has one job.

| File | Its job |
|---|---|
| `index.html` | The layout of both screens and the About Divisha sheet |
| `style.css` | How it looks, in light and dark |
| `screens.js` | Draws the screens and handles taps |
| `diary.js` | **The only file that saves or loads** |
| `helper.js` | **The only file that talks to Claude**, plus the counting, ideas for today, warning signs and the downloaded copy |

If saving breaks, look in `diary.js`. If an answer, a number or a warning is
wrong, look in `helper.js`.

## Where the data lives

In the claude.ai page's own storage, shared by everyone the page is shared
with as Contributor or Editor:

| Place | What |
|---|---|
| `profile/divisha` | About Divisha |
| `chatList/<day>` | One line per day for Past chats |
| `chats/<day>` | That day's whole conversation |
| `entries/<id>` | One diary entry each |
| `notes/<span>` | Claude's Look back notes, for example `notes/month-2026-10-01` |

"Download a copy" in About Divisha saves all of it as two files: a readable
diary (`.md`) and a full backup (`.json`).

## Checking it works

```bash
node --test divisha/tests/*.test.js     # counting, ideas, warnings, Claude packets, the copy
```

`tests/browser/` runs the whole app in a headless browser with a stand-in
for claude.ai. It covers Talk, Look back, the copy, view-only access,
offline, keyboard use and a 320 px phone. Its README says how to run it.

## Publishing a change

The page is published from `app/index.html`, with the other four files
published beside it. In a Claude Code session, ask Claude to republish
`divisha/app/index.html` to the live page above. Its link and stored diary
stay the same.

The old "Divisha Health Log" page now only points here.
