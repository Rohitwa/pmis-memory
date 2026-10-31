"""manage.py — looking after the hosted Divisha Wellness from a terminal.

  python -m server.manage add-user rohit "Rohit Singh" [--viewer]
  python -m server.manage set-password rohit
  python -m server.manage users
  python -m server.manage import backup.json --as rohit [--files DIR]

Passwords are asked for, never typed on the command line. `import` reads the
full backup the app's "Download a copy" makes (or the same shape exported from
claude.ai). Anything recorded as added by someone who has no account here is
credited to the --as person. --files is a folder of document files named by
their file id; files not found there are listed and skipped.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
from pathlib import Path

from .store import Store, StoreError

PEOPLE_FIELDS = ("by", "writtenBy", "editedBy", "updatedBy")
COLLECTIONS = ("entries", "chatList", "chats", "notes", "schedules", "documents")
MAGIC = {b"%PDF-": "application/pdf", b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg", b"GIF8": "image/gif"}


def ask_password() -> str:
    # Without a real terminal the password would show as it's typed.
    if not sys.stdin.isatty():
        sys.exit("No terminal, so the password would show on screen. Run this through "
                 "`fly ssh console --pty -C \"...\"`, or open `fly ssh console` first and run it there.")
    first = getpass.getpass("New password (10 or more characters): ")
    if first != getpass.getpass("Same password again: "):
        sys.exit("The two passwords don't match.")
    return first


def credit(value, known: set, to: str):
    """Swaps claude.ai person ids for an account here."""
    if isinstance(value, dict):
        return {k: (to if k in PEOPLE_FIELDS and isinstance(v, str) and v not in known else credit(v, known, to)) for k, v in value.items()}
    if isinstance(value, list):
        return [credit(v, known, to) for v in value]
    return value


def import_backup(store: Store, path: str, as_user: str, files_dir: str | None) -> None:
    data = json.loads(Path(path).read_text())
    users = {u["username"]: u for u in store.users()}
    if as_user not in users:
        sys.exit(f"No account {as_user!r}. Add it first with add-user.")
    known, to = {u["id"] for u in users.values()}, users[as_user]["id"]

    count = 0
    if data.get("profile"):
        store.set("profile/divisha", credit(data["profile"], known, to))
        count += 1
    for coll in COLLECTIONS:
        for doc in data.get(coll) or []:
            doc_id = doc.get("id") or doc.get("day")
            if not doc_id:
                continue
            body = {k: v for k, v in doc.items() if k != "id"}
            store.set(f"{coll}/{doc_id}", credit(body, known, to))
            count += 1
    print(f"Imported {count} documents.")

    wanted = {d["fileId"]: d.get("fileType") for d in data.get("documents") or [] if d.get("fileId")}
    for chat in data.get("chats") or []:
        for m in (chat.get("messages") or {}).values():
            for a in m.get("attachments") or []:
                if a.get("fileId"):
                    wanted[a["fileId"]] = a.get("fileType")
    missing = []
    for file_id, file_type in wanted.items():
        found = next(iter(sorted(Path(files_dir).glob(f"{file_id}*"))), None) if files_dir else None
        if not found:
            missing.append(file_id)
            continue
        raw = found.read_bytes()
        kind = file_type or next((t for m, t in MAGIC.items() if raw.startswith(m)), "application/octet-stream")
        store.put_file(file_id, raw, kind, to)
    print(f"Imported {len(wanted) - len(missing)} of {len(wanted)} files.")
    for file_id in missing:
        print(f"  not found: {file_id}")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(prog="python -m server.manage", description="Look after the hosted Divisha Wellness.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add-user", help="add a person who can sign in")
    add.add_argument("username")
    add.add_argument("name", help='their name as shown in the app, e.g. "Rohit Singh"')
    add.add_argument("--viewer", action="store_true", help="can read the diary but not change it")
    pw = sub.add_parser("set-password", help="set a new password (signs that person out everywhere)")
    pw.add_argument("username")
    sub.add_parser("users", help="list who can sign in")
    imp = sub.add_parser("import", help="bring in a backup from the app or from claude.ai")
    imp.add_argument("backup")
    imp.add_argument("--as", dest="as_user", required=True, help="the username to credit entries to")
    imp.add_argument("--files", help="folder of document files named by file id")
    args = parser.parse_args(argv)

    store = Store(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "data"))
    try:
        if args.cmd == "add-user":
            password = os.environ.get("DIVISHA_NEW_PASSWORD") or ask_password()
            store.add_user(args.username, args.name, password, "viewer" if args.viewer else "parent")
            print(f"Added {args.username} ({'can read only' if args.viewer else 'can read and change everything'}).")
        elif args.cmd == "set-password":
            store.set_password(args.username, os.environ.get("DIVISHA_NEW_PASSWORD") or ask_password())
            print(f"New password set for {args.username}. They're signed out everywhere.")
        elif args.cmd == "users":
            for u in store.users():
                print(f"{u['username']:<16} {u['name']:<24} {'parent' if u['role'] == 'parent' else 'viewer (read only)'}")
        elif args.cmd == "import":
            import_backup(store, args.backup, args.as_user.strip().lower(), args.files)
    except StoreError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
