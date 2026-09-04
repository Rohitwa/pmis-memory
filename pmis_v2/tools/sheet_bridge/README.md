# ProMe Sheet Bridge

A Google Apps Script web app that gives ProMe a narrow write path into named
Google Sheets. No Google credential is stored in this repo or in a Claude
session — the script runs inside the sheet owner's own account, and callers
authenticate with a shared secret.

`Code.gs` is the server. `../sheet_writer.py` is the client.

## Deploying

1. Open the spreadsheet, then **Extensions > Apps Script**.
2. Replace the contents of `Code.gs` with this folder's `Code.gs`.
3. Edit `ALLOWED_SHEETS` so it lists exactly the spreadsheet IDs you want
   writable. The ID is the long string in the sheet URL between `/d/` and
   `/edit`.
4. Create the shared secret. Pick `generateSecret` in the editor's function
   dropdown and press **Run**, then open the execution log and copy the value
   it prints. It stores itself in Script properties, so there is nothing to
   paste back into Google, and the log is your one chance to copy it.

   To do it by hand instead, run `openssl rand -hex 32` in a terminal and add
   the output under **Project Settings > Script properties** as a property
   named `SHARED_SECRET`. Either way the secret never goes in `Code.gs`.
5. **Deploy > New deployment > Web app**, with:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Approve the permission prompt. Google warns that the app is unverified
   because you authored it yourself; continue through the advanced link.
7. Copy the `/exec` URL from the deployment.

"Anyone" is what lets a plain HTTPS POST reach the script without a Google
sign-in. It does not make the spreadsheet public. The script still executes as
you, and the secret check in `secretOk` is what actually guards it.

After editing `Code.gs`, deploy a **new version**, otherwise the previous code
keeps serving.

## Configuring the client

Set three variables where the session can read them. In a remote Claude Code
session, put them in the environment's configuration rather than a file — the
container is rebuilt from a fresh clone each time, so a local `.env` will not
survive.

```
PROME_SHEET_WEBAPP_URL=https://script.google.com/macros/s/AKfy.../exec
PROME_SHEET_SECRET=<the SHARED_SECRET value>
PROME_SHEET_ID=<default spreadsheet ID>
```

## Using it

```bash
# read before you write
python3 pmis_v2/tools/sheet_writer.py get Invoices!S5 Receipts!A6

# see what a write would change, without changing it
python3 pmis_v2/tools/sheet_writer.py set "Invoices!S5=https://..." --dry-run

# write, tagging the reason into the bridge log
python3 pmis_v2/tools/sheet_writer.py set \
  "Invoices!S5=https://drive.google.com/file/d/.../view" \
  --as text --note "milestone 3 invoice proof"

# a date, so Sheets stores a real date rather than a string
python3 pmis_v2/tools/sheet_writer.py set "Receipts!A6=2026-08-12" --as date

# several at once
python3 pmis_v2/tools/sheet_writer.py set --from-file edits.json --note "proof links"
```

`--as` decides how the value lands: `auto` lets Sheets parse it as if typed,
`text` forces a literal string, and `number`, `date` and `formula` do what they
say. Reach for `text` whenever Sheets might reinterpret the value.

## What it will not do

- Touch a spreadsheet outside `ALLOWED_SHEETS`.
- Write a range wider than a single cell.
- Apply a batch partially. Every range and value is validated up front, so a
  bad op rejects the whole call.
- Write without a record. Each changed cell appends a row to the hidden
  `_BridgeLog` tab with the previous value, the new value and a timestamp.

## If something breaks

| Symptom | Cause |
| --- | --- |
| `bridge did not return JSON (deployment access is probably not set to Anyone)` | Access is set to a narrower audience, so Google is serving a login page |
| `unauthorised` | `PROME_SHEET_SECRET` does not match the `SHARED_SECRET` property |
| `spreadsheetId not in allowlist` | Add the ID to `ALLOWED_SHEETS`, then deploy a new version |
| HTTP 404 | The `/exec` URL is wrong, or the deployment was deleted |
| Edits stop taking effect after a change | The script was saved but not redeployed as a new version |

## Optional: sharing the attachments

`ShareDrive.gs` is a separate, editor-run helper that puts the Finance Tracker
Bills folder behind a public link, or takes it back private. It is not wired
into the web app, so the deployed bridge is unaffected.

Adding it makes the whole script project request Drive access, which is broader
than the sheet-only bridge needs. Delete the file and the extra scope drops away
at the next authorization.

Read the header before running it. The bills folder carries the company bank
account and IFSC, the SWIFT code, GSTIN and PAN, client purchase orders naming
their staff, and flight PNRs. `ANYONE_WITH_LINK` requires no Google sign-in.

`makeBillsPrivateAgain` is a real revoke: previously shared links stop
resolving.

The same thing is four clicks in the Drive UI, on the folder's Share dialog
under General access. Use the script when you want the change logged and
applied to each file explicitly rather than by inheritance.

## Rotating

Delete `SHARED_SECRET` under Project settings, run `generateSecret` again, and
update `PROME_SHEET_SECRET` with the new value.
To invalidate the URL as well, archive the deployment and create a new one.
Revoke everything at once from the Apps Script project's **Deploy > Manage
deployments**.
