#!/usr/bin/env python3
"""
Drive Uploader — push a local file into the finance bills folder via the bridge.

The Google Drive connector only takes file bytes inline in a single call, which
tops out well below the size of a scanned invoice. This streams the file to the
Apps Script bridge in base64 chunks instead, so size stops being the limit and
the bytes are read straight off disk rather than passing through a transcript.

Environment (same as sheet_writer.py):
    PROME_SHEET_WEBAPP_URL   the Apps Script /exec URL
    PROME_SHEET_SECRET       the SHARED_SECRET set in Script Properties

Usage:
    python3 pmis_v2/tools/drive_uploader.py invoice.pdf --folder <folderId>
    python3 pmis_v2/tools/drive_uploader.py bill.pdf --folder <id> \
        --name 2026-08-11_TaxInvoice_Baxy_LVPL-INV-2026-27-065.pdf

The bridge refuses any folder outside the bills tree, verifies the assembled
byte count against what we claim to have sent, and only then writes the file.
A size mismatch fails the upload rather than leaving a truncated document.
"""

import argparse
import base64
import json
import mimetypes
import os
import ssl
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

PROXY_CA = Path("/root/.ccr/ca-bundle.crt")
TIMEOUT = 120
# Base64 characters per request. The script cache caps a value at 100 KB, and a
# smaller chunk also keeps each POST comfortably inside the Apps Script limits.
CHUNK = 60_000
MAX_CHUNKS = 400


def _fail(msg, code=1):
    print(json.dumps({"ok": False, "error": msg}), file=sys.stderr)
    sys.exit(code)


def _config():
    url = os.environ.get("PROME_SHEET_WEBAPP_URL", "").strip()
    secret = os.environ.get("PROME_SHEET_SECRET", "").strip()
    missing = [n for n, v in (("PROME_SHEET_WEBAPP_URL", url),
                              ("PROME_SHEET_SECRET", secret)) if not v]
    if missing:
        _fail("not configured, missing: %s" % ", ".join(missing), code=2)
    if not url.endswith("/exec"):
        _fail("PROME_SHEET_WEBAPP_URL should end in /exec, got: %s" % url, code=2)
    return url, secret


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
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        _fail("bridge returned HTTP %s: %s" % (exc.code, exc.read()[:400]))
    except urllib.error.URLError as exc:
        _fail("cannot reach bridge: %s" % exc.reason)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        hint = " (deployment access is probably not set to Anyone)" if "<" in raw[:20] else ""
        _fail("bridge did not return JSON%s: %s" % (hint, raw[:300]))


def upload(path, folder_id, name=None, mime=None, quiet=False):
    url, secret = _config()

    src = Path(path)
    if not src.is_file():
        _fail("no such file: %s" % path, code=2)

    raw = src.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    chunks = [encoded[i:i + CHUNK] for i in range(0, len(encoded), CHUNK)]
    if len(chunks) > MAX_CHUNKS:
        _fail("file needs %d chunks, bridge allows %d" % (len(chunks), MAX_CHUNKS))

    filename = name or src.name
    mimetype = mime or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    upload_id = uuid.uuid4().hex

    result = None
    for seq, chunk in enumerate(chunks):
        result = _post(url, {
            "secret": secret,
            "mode": "upload",
            "uploadId": upload_id,
            "seq": seq,
            "total": len(chunks),
            "chunk": chunk,
            "filename": filename,
            "folderId": folder_id,
            "mimeType": mimetype,
            "bytes": len(raw),
        })
        if not result.get("ok"):
            _fail("chunk %d/%d rejected: %s"
                  % (seq + 1, len(chunks), result.get("error")))
        if not quiet and not result.get("done"):
            print("  sent %d/%d" % (seq + 1, len(chunks)), file=sys.stderr)

    # The bridge compares the assembled length against what we declared, so a
    # matching size here means every chunk arrived and decoded.
    if result.get("size") != len(raw):
        _fail("uploaded but size differs: Drive has %s, local is %d"
              % (result.get("size"), len(raw)))
    return result


def main():
    ap = argparse.ArgumentParser(description="Upload a local file into the bills tree")
    ap.add_argument("file", help="path to the local file")
    ap.add_argument("--folder", required=True, metavar="ID",
                    help="destination Drive folder id, must be inside the bills tree")
    ap.add_argument("--name", help="filename to use in Drive, defaults to the local name")
    ap.add_argument("--mime", help="MIME type, guessed from the name if omitted")
    ap.add_argument("--quiet", action="store_true", help="suppress per-chunk progress")
    args = ap.parse_args()

    print(json.dumps(upload(args.file, args.folder, args.name, args.mime, args.quiet),
                     indent=2, default=str))


if __name__ == "__main__":
    main()
