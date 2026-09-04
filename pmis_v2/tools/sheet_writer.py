#!/usr/bin/env python3
"""
Sheet Writer — client for the ProMe Sheet Bridge Apps Script web app.

Reads and writes single cells in a Google Sheet over the bridge deployed from
tools/sheet_bridge/Code.gs, so no Google credential lives in this repo or in
the session. All output is JSON to stdout, errors to stderr, matching cli.py.

Environment:
    PROME_SHEET_WEBAPP_URL   the Apps Script /exec URL
    PROME_SHEET_SECRET       the SHARED_SECRET set in Script Properties
    PROME_SHEET_ID           default spreadsheet ID, overridable with --sheet

Usage:
    python3 pmis_v2/tools/sheet_writer.py get Invoices!S5 Receipts!A6
    python3 pmis_v2/tools/sheet_writer.py set "Invoices!S5=https://drive.google.com/..."
    python3 pmis_v2/tools/sheet_writer.py set "Receipts!A6=12-Aug-2026" --as date
    python3 pmis_v2/tools/sheet_writer.py set --from-file edits.json --note "proof links"

A cell argument is RANGE=VALUE. The value may contain '=' — only the first one
splits. --as applies to every cell in the call: auto (default), text, number,
date or formula. Use text for anything Sheets would otherwise reinterpret.

edits.json is a list of {"range": ..., "value": ..., "as": ...} objects.
"""

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Outbound HTTPS in the remote sandbox goes through an inspecting proxy.
PROXY_CA = Path("/root/.ccr/ca-bundle.crt")
TIMEOUT = 60
VALUE_KINDS = ("auto", "text", "number", "date", "formula")


def _fail(msg, code=1):
    print(json.dumps({"ok": False, "error": msg}), file=sys.stderr)
    sys.exit(code)


def _config(sheet_override=None):
    url = os.environ.get("PROME_SHEET_WEBAPP_URL", "").strip()
    secret = os.environ.get("PROME_SHEET_SECRET", "").strip()
    sheet = (sheet_override or os.environ.get("PROME_SHEET_ID", "")).strip()

    missing = [
        name for name, val in (
            ("PROME_SHEET_WEBAPP_URL", url),
            ("PROME_SHEET_SECRET", secret),
            ("PROME_SHEET_ID", sheet),
        ) if not val
    ]
    if missing:
        _fail("not configured, missing: %s" % ", ".join(missing), code=2)
    if not url.endswith("/exec"):
        _fail("PROME_SHEET_WEBAPP_URL should end in /exec, got: %s" % url, code=2)
    return url, secret, sheet


def _post(url, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    ctx = ssl.create_default_context(
        cafile=str(PROXY_CA) if PROXY_CA.exists() else None
    )
    try:
        # Apps Script answers a POST with a 302 to script.googleusercontent.com;
        # urllib follows it and the JSON body is served from there.
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        _fail("bridge returned HTTP %s: %s" % (exc.code, exc.read()[:400]))
    except urllib.error.URLError as exc:
        _fail("cannot reach bridge: %s" % exc.reason)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # A login page here almost always means the deployment's access is set
        # to something narrower than "Anyone".
        hint = " (deployment access is probably not set to Anyone)" if "<" in raw[:20] else ""
        _fail("bridge did not return JSON%s: %s" % (hint, raw[:300]))


def _parse_cell(arg, kind):
    if "=" not in arg:
        _fail("expected RANGE=VALUE, got: %s" % arg, code=2)
    rng, value = arg.split("=", 1)
    rng = rng.strip()
    if "!" not in rng:
        _fail("range needs a tab, e.g. Invoices!S5, got: %s" % rng, code=2)
    return {"range": rng, "value": value, "as": kind}


def _load_edits(path, kind):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail("cannot read %s: %s" % (path, exc), code=2)
    if not isinstance(data, list):
        _fail("%s must hold a JSON list of edits" % path, code=2)
    for item in data:
        item.setdefault("as", kind)
    return data


def cmd_get(args):
    url, secret, sheet = _config(args.sheet)
    for rng in args.ranges:
        if "!" not in rng:
            _fail("range needs a tab, e.g. Invoices!S5, got: %s" % rng, code=2)
    return _post(url, {
        "secret": secret,
        "spreadsheetId": sheet,
        "mode": "read",
        "ops": [{"range": r} for r in args.ranges],
    })


def cmd_set(args):
    url, secret, sheet = _config(args.sheet)
    if args.from_file:
        ops = _load_edits(args.from_file, args.as_kind)
    elif args.cells:
        ops = [_parse_cell(c, args.as_kind) for c in args.cells]
    else:
        _fail("pass cells as RANGE=VALUE, or --from-file", code=2)

    if args.dry_run:
        before = _post(url, {
            "secret": secret, "spreadsheetId": sheet, "mode": "read",
            "ops": [{"range": op["range"]} for op in ops],
        })
        return {"ok": True, "dryRun": True, "current": before.get("results"), "proposed": ops}

    return _post(url, {
        "secret": secret,
        "spreadsheetId": sheet,
        "mode": "write",
        "note": args.note or "",
        "ops": ops,
    })


def main():
    ap = argparse.ArgumentParser(description="Read and write cells over the ProMe Sheet Bridge")
    ap.add_argument("--sheet", help="spreadsheet ID, defaults to PROME_SHEET_ID")
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("get", help="read cells")
    g.add_argument("ranges", nargs="+", metavar="TAB!CELL")

    s = sub.add_parser("set", help="write cells")
    s.add_argument("cells", nargs="*", metavar="TAB!CELL=VALUE")
    s.add_argument("--from-file", metavar="PATH", help="JSON list of edits")
    s.add_argument("--as", dest="as_kind", choices=VALUE_KINDS, default="auto",
                   help="how to coerce the value, default auto")
    s.add_argument("--note", help="recorded against every row in the bridge log")
    s.add_argument("--dry-run", action="store_true",
                   help="show current values and what would be written")

    args = ap.parse_args()
    result = cmd_get(args) if args.cmd == "get" else cmd_set(args)
    print(json.dumps(result, indent=2, default=str))
    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
