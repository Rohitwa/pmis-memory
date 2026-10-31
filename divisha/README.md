# Divisha Wellness

A shared diary for Divisha's health and care, made for two parents.
The left pane has three sections: **Talk**, where you tell Claude about her
day and set her schedule; **Documents**, her papers with a title and brief
each; and **Time-based analysis**, how she's doing over a week, month or year.

- **Live page:** https://claude.ai/artifact/Pro9ma6DELS2utcssBPCRp
- **Why it's built this way:** [DESIGN.md](DESIGN.md)
- **Hosting it on fly.io instead:** [DEPLOY.md](DEPLOY.md). The same five files run there, with `server/` providing sign-in, storage and Claude.

## The five files

All in `app/`. Each has one job.

| File | Its job |
|---|---|
| `index.html` | The layout: the left pane, the three sections and the About Divisha sheet |
| `style.css` | How it looks, in light and dark |
| `screens.js` | Draws the screens and handles taps |
| `diary.js` | **The only file that saves or loads** |
| `helper.js` | **The only file that talks to Claude**, plus her schedule rules, ideas for today, the counting, warning signs and the downloaded copy |

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
| `notes/<span>` | Claude's notes in Time-based analysis, for example `notes/month-2026-10-01` |
| `schedules/<id>` | One item in her schedule |
| `documents/<id>` | One document's title, brief, date and file id |
| file storage | The document files themselves, shown at `/_blob/<file id>` |

"Download a copy" in About Divisha saves all of it as two files: a readable
diary (`.md`) and a full backup (`.json`).

## Checking it works

```bash
node --test divisha/tests/*.test.js     # counting, ideas, warnings, Claude packets, the copy
```

`tests/browser/` runs the whole app in a headless browser with a stand-in
for claude.ai. It covers Talk, Look back, the copy, view-only access,
offline, keyboard use, a 320 px phone, her schedule and documents. Its README says how to run it.

## Publishing a change

The page is published from `app/index.html`, with the other four files
published beside it. In a Claude Code session, ask Claude to republish
`divisha/app/index.html` to the live page above. Its link and stored diary
stay the same.

The old "Divisha Health Log" page now only points here.
