# Hosting Divisha Wellness on fly.io

The same app that runs on claude.ai can run on its own address. The five app
files don't change. `server/` adds what claude.ai provided: sign-in, the shared
diary, live updates between parents, file storage, and Claude. It also adds
two things claude.ai can't do: reminders on your phones, and share links.

## What runs where

| Piece | On fly.io |
|---|---|
| The app | Served by `server/main.py`, with `server/static/claude-shim.js` standing in for claude.ai |
| The diary | One SQLite file on a Fly volume at `/data/divisha.db` |
| Photos and PDFs | Files on the same volume, under `/data/files/` |
| Sign-in | Username and password per person. Passwords are stored as scrypt hashes; sessions last 60 days |
| Claude | The Anthropic API, with your API key, paid per use |
| Reminders | Checked every 30 seconds by the server and sent as web push notifications. The signing key is made on first start and kept at `/data/vapid.json` |
| Share links | Random, unguessable addresses under `/s/`, stored with an end date; turning one off works at once |

Everyone needs to sign in. A **parent** can read and change everything; a
**viewer** can only read.

## Costs

| Item | Roughly |
|---|---|
| Fly machine in Singapore (shared CPU, 512 MB, always on so reminders go out on time) | About $3 to $5 a month (about $2 to $3 more than when it slept) |
| Fly volume (1 GB) | Under $0.20 a month |
| Claude Opus 5.5 through the Anthropic API | About 2 to 3 US cents per chat message; more with photos |

Each person can get at most 150 Claude replies a day (`DAILY_CLAUDE_LIMIT` in
`fly.toml`), so a runaway loop can't run up a large bill. The model can be
changed with a `CLAUDE_MODEL` setting.

## First deploy

You need a fly.io account and an Anthropic API key (console.anthropic.com).

```bash
cd divisha
fly auth login                                   # or set FLY_API_TOKEN
bash deploy.sh                                   # creates the app and volume, then deploys
fly secrets set ANTHROPIC_API_KEY=sk-ant-... -a divisha-wellness
```

Then add the people who can sign in. Each one is asked for a password (10 or
more characters). Keep `--pty`: without it there's no real terminal, the
password would show as it's typed, and the tool refuses to ask:

```bash
fly ssh console --pty -a divisha-wellness -C "python -m server.manage add-user rohit 'Rohit Singh'"
fly ssh console --pty -a divisha-wellness -C "python -m server.manage add-user ananya 'Ananya Singh'"
fly ssh console --pty -a divisha-wellness -C "python -m server.manage add-user nani 'Nani' --viewer"
```

It's live at `https://divisha-wellness.fly.dev`.

## Your own web address: divisha-singh.com

The domain's DNS is at GoDaddy. Fly serves the site at the bare domain and at
`www`, each with its own HTTPS certificate:

```bash
fly certs add divisha-singh.com -a divisha-wellness
fly certs add www.divisha-singh.com -a divisha-wellness
```

At GoDaddy (Domains, then divisha-singh.com, then DNS):

| Record | Name | Value |
|---|---|---|
| A (edit the existing "Parked" one; keep only one A for @) | `@` | `66.241.124.121` |
| AAAA (add) | `@` | `2a09:8280:1::1da:b48d:0` |
| CNAME (already there; keep) | `www` | `divisha-singh.com.` |

Leave the NS, SOA, `_domainconnect` and `_dmarc` records as they are, and make
sure no domain forwarding is set. Then check with
`fly certs check divisha-singh.com -a divisha-wellness`.

## As an app on Android (and iPhone)

The site can be installed as an app: its own icon, full screen without the
browser bar, and it opens even without a connection (it then says it's offline).

- **Android (Chrome):** open the site, sign in, then tap the ⋮ menu and **Install app** (or **Add to Home screen**, then **Install**).
- **iPhone (Safari):** open the site, sign in, tap **Share**, then **Add to Home Screen**.

Long-pressing the icon on Android offers shortcuts to Talk, Documents and
Time-based analysis. Signing out also clears the app's saved copy on that
device. The diary, Claude's replies and document files are never stored in that
saved copy; they always come from the server.

## Reminders on your phones

Do this once on each phone, after installing the app (below):

1. Open the app and go to **Schedule**.
2. Tap **Turn on reminders**, then **Allow** when the phone asks about notifications.
3. Tap **Send a test**. A notification should arrive within a few seconds.

The notification uses the phone's normal notification sound. To change the
sound or make it louder on Android: long-press a Divisha notification, tap the
settings icon, then **Sound**. If nothing arrives, check that notifications
for the app (or for Chrome) are allowed in the phone's settings, and that
battery saver isn't restricting Chrome.

Each phone is reminded in its own time zone. Signing out stops that phone's
reminders. On iPhone, reminders work only once the app is added to the Home
Screen (iOS 16.4 or later).

## Share links

**Share routine** in Schedule, and **Share** on a document, make links that
open without signing in. Each link shows only that one thing. About Divisha
lists all of them under **Shared links**, each with **Turn off**. Viewers
can't make links.

## Bringing the diary over from claude.ai

1. In the claude.ai page, open About Divisha and use **Download a copy**. Keep the backup `.json` file.
2. Document files aren't in that backup. Download each one from Documents, and name it by its file id (Claude can do steps 1 and 2 for you with the page's data tools).
3. Copy them to the server and import them, crediting entries to your account:

```bash
fly ssh sftp shell -a divisha-wellness           # put backup.json /data/import/ ; put the files in /data/import/files/
fly ssh console -a divisha-wellness -C "python -m server.manage import /data/import/backup.json --as rohit --files /data/import/files"
```

## Looking after it

| Task | Command |
|---|---|
| New password (signs that person out everywhere) | `fly ssh console --pty -a divisha-wellness -C "python -m server.manage set-password rohit"` |
| Who can sign in | `fly ssh console -a divisha-wellness -C "python -m server.manage users"` |
| Logs (every failed Claude call is logged with its reason) | `fly logs -a divisha-wellness` |
| Is Claude working? (one tiny test call) | `fly ssh console -a divisha-wellness -C "python -m server.manage check-claude"` |
| Is an API key set? | open `/healthz`: `claude_key_set` is true or false |
| Deploy a change | `bash deploy.sh` |

**Backups.** Fly takes a daily snapshot of the volume and keeps it for 5 days
(`fly volumes snapshots list`). For a copy you hold yourself, use **Download a
copy** in About Divisha now and then.

**Keep one machine, always on.** The diary is one SQLite file and live updates
are kept in memory, so the app must run as a single machine. `deploy.sh`
deploys with `--ha=false` for that reason. `fly.toml` keeps it running
(`auto_stop_machines = "off"`), because a sleeping machine can't send
reminders.

## Checking it before a deploy

```bash
python -m unittest discover -s server/tests -t .     # storage, push encryption, schedule rules, reminders
bash server/tests/run_e2e.sh                         # the whole hosted app in a browser, with stand-ins for Claude and a phone's push service
```
