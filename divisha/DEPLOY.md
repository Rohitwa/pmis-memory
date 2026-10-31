# Hosting Divisha Wellness on fly.io

The same app that runs on claude.ai can run on its own address. The five app
files don't change. `server/` adds what claude.ai provided: sign-in, the shared
diary, live updates between parents, file storage, and Claude.

## What runs where

| Piece | On fly.io |
|---|---|
| The app | Served by `server/main.py`, with `server/static/claude-shim.js` standing in for claude.ai |
| The diary | One SQLite file on a Fly volume at `/data/divisha.db` |
| Photos and PDFs | Files on the same volume, under `/data/files/` |
| Sign-in | Username and password per person. Passwords are stored as scrypt hashes; sessions last 60 days |
| Claude | The Anthropic API, with your API key, paid per use |

Everyone needs to sign in. A **parent** can read and change everything; a
**viewer** can only read.

## Costs

| Item | Roughly |
|---|---|
| Fly machine (shared CPU, 512 MB, sleeps when unused) | A few dollars a month at most |
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
more characters), which never appears on screen or in shell history:

```bash
fly ssh console -a divisha-wellness -C "python -m server.manage add-user rohit 'Rohit Singh'"
fly ssh console -a divisha-wellness -C "python -m server.manage add-user ananya 'Ananya Singh'"
fly ssh console -a divisha-wellness -C "python -m server.manage add-user nani 'Nani' --viewer"
```

It's live at `https://divisha-wellness.fly.dev`.

## Your own web address

```bash
fly certs add wellness.example.com -a divisha-wellness
```

Fly prints the DNS records to add at your domain registrar. HTTPS starts once
they're in place.

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
| New password (signs that person out everywhere) | `fly ssh console -a divisha-wellness -C "python -m server.manage set-password rohit"` |
| Who can sign in | `fly ssh console -a divisha-wellness -C "python -m server.manage users"` |
| Logs | `fly logs -a divisha-wellness` |
| Deploy a change | `bash deploy.sh` |

**Backups.** Fly takes a daily snapshot of the volume and keeps it for 5 days
(`fly volumes snapshots list`). For a copy you hold yourself, use **Download a
copy** in About Divisha now and then.

**Keep one machine.** The diary is one SQLite file and live updates are kept in
memory, so the app must run as a single machine. `deploy.sh` deploys with
`--ha=false` for that reason.

## Checking it before a deploy

```bash
python -m unittest discover -s server/tests -t .     # the server's storage
bash server/tests/run_e2e.sh                         # the whole hosted app in a browser, with a stand-in for Claude
```
