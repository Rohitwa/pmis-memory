"""store.py — everything the server keeps, in one SQLite file.

Four tables:
  docs      The diary itself: one row per document, at the same paths the app
            uses on claude.ai (profile/divisha, entries/<id>, chats/<day> ...).
  users     The people who can sign in, and whether they can change things.
  sessions  Who is signed in (only a hash of each cookie is kept).
  files     Uploaded photos and PDFs; the bytes live in DATA_DIR/files/<id>.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEGMENT = re.compile(r"^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$")
ROLES = {"parent", "viewer"}          # parent: reads and changes everything; viewer: reads only


class StoreError(Exception):
    """An error the app understands, with the same codes claude.ai uses."""

    def __init__(self, code: str, message: str = "", status: int = 400):
        super().__init__(message or code)
        self.code, self.status = code, status


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def split_path(path: str, *, document: bool) -> list[str]:
    parts = path.split("/") if path else []
    if not parts or len(parts) > 16 or not all(SEGMENT.match(p) for p in parts):
        raise StoreError("invalid_argument", f"bad path: {path!r}")
    if document != (len(parts) % 2 == 0):
        raise StoreError("invalid_argument", f"{path!r} is not a {'document' if document else 'collection'} path")
    return parts


def merge(base: dict, changes: dict) -> dict:
    """Nested objects merge; anything else (arrays included) replaces."""
    out = dict(base)
    for key, value in changes.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merge(out[key], value)
        else:
            out[key] = value
    return out


def _matches(data: dict, field: str, op: str, value) -> bool:
    x = data.get(field)
    try:
        if op in ("==", "eq"): return x == value
        if op in ("!=", "ne"): return x != value
        if op == "in": return x in value
        if op == "not-in": return x not in value
        if op == "array-contains": return isinstance(x, list) and value in x
        if x is None: return False
        if op in (">", "gt"): return x > value
        if op in (">=", "gte"): return x >= value
        if op in ("<", "lt"): return x < value
        if op in ("<=", "lte"): return x <= value
    except TypeError:
        return False
    raise StoreError("invalid_argument", f"unknown operator {op!r}")


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, bytes.fromhex(salt)).split("$")[2], digest)


class Store:
    def __init__(self, data_dir: str | os.PathLike):
        self.dir = Path(data_dir)
        self.files_dir = self.dir / "files"
        self.files_dir.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.dir / "divisha.db", check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.executescript("""
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS docs (
                  path TEXT PRIMARY KEY, coll TEXT NOT NULL, id TEXT NOT NULL,
                  data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS docs_coll ON docs(coll);
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
                  role TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS files (
                  id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL,
                  uploaded_by TEXT, created_at TEXT NOT NULL);
            """)

    # ── Documents ──────────────────────────────────────────────────────

    def get(self, path: str) -> dict:
        split_path(path, document=True)
        with self.lock:
            row = self.db.execute("SELECT data, version FROM docs WHERE path = ?", (path,)).fetchone()
        if not row:
            return {"id": path.rsplit("/", 1)[-1], "exists": False}
        return {"id": path.rsplit("/", 1)[-1], "exists": True, "data": json.loads(row["data"]), "version": row["version"]}

    def set(self, path: str, data: dict) -> int:
        parts = split_path(path, document=True)
        if not isinstance(data, dict):
            raise StoreError("invalid_argument", "a document must be an object")
        body = json.dumps(data, separators=(",", ":"))
        if len(body) > 256 * 1024:
            raise StoreError("invalid_argument", "document over 256 KiB")
        with self.lock:
            row = self.db.execute("SELECT version FROM docs WHERE path = ?", (path,)).fetchone()
            version = (row["version"] + 1) if row else 1
            self.db.execute(
                "INSERT INTO docs (path, coll, id, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(path) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at",
                (path, "/".join(parts[:-1]), parts[-1], body, version, now()),
            )
        return version

    def update(self, path: str, changes: dict) -> int:
        split_path(path, document=True)
        with self.lock:
            row = self.db.execute("SELECT data FROM docs WHERE path = ?", (path,)).fetchone()
        if not row:
            raise StoreError("invalid_argument", "update needs an existing document", 404)
        return self.set(path, merge(json.loads(row["data"]), changes))

    def delete(self, path: str) -> None:
        split_path(path, document=True)
        with self.lock:
            self.db.execute("DELETE FROM docs WHERE path = ?", (path,))

    def query(self, coll: str, where=(), order=None, limit: int = 1000) -> list[dict]:
        split_path(coll, document=False)
        if not 1 <= int(limit) <= 1000:
            raise StoreError("invalid_argument", "limit must be 1 to 1000")
        with self.lock:
            rows = self.db.execute("SELECT id, data, version FROM docs WHERE coll = ? ORDER BY id", (coll,)).fetchall()
        docs = [{"id": r["id"], "exists": True, "data": json.loads(r["data"]), "version": r["version"]} for r in rows]
        for clause in where or ():
            field, op, value = clause
            docs = [d for d in docs if _matches(d["data"], field, op, value)]
        if order:
            field, direction = order[0], (order[1] if len(order) > 1 else "asc")
            present = [d for d in docs if d["data"].get(field) is not None]
            missing = [d for d in docs if d["data"].get(field) is None]
            present.sort(key=lambda d: d["data"][field], reverse=direction == "desc")
            docs = present + missing
        return docs[: int(limit)]

    # ── People ─────────────────────────────────────────────────────────

    def add_user(self, username: str, name: str, password: str, role: str = "parent") -> str:
        if role not in ROLES:
            raise StoreError("invalid_argument", f"role must be one of {sorted(ROLES)}")
        if len(password) < 10:
            raise StoreError("invalid_argument", "use a password of at least 10 characters")
        user_id = "u_" + secrets.token_hex(8)
        with self.lock:
            self.db.execute(
                "INSERT INTO users (id, username, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, username.strip().lower(), name.strip(), role, hash_password(password), now()),
            )
        return user_id

    def set_password(self, username: str, password: str) -> None:
        if len(password) < 10:
            raise StoreError("invalid_argument", "use a password of at least 10 characters")
        with self.lock:
            cur = self.db.execute("UPDATE users SET password = ? WHERE username = ?", (hash_password(password), username.strip().lower()))
            if cur.rowcount == 0:
                raise StoreError("not_found", f"no user {username!r}", 404)
            self.db.execute("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)", (username.strip().lower(),))

    def users(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.db.execute("SELECT id, username, name, role FROM users ORDER BY created_at")]

    def user_by_id(self, user_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT id, username, name, role FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def check_login(self, username: str, password: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM users WHERE username = ?", (username.strip().lower(),)).fetchone()
        if not row:
            hash_password(password)                 # same work either way, so timing doesn't reveal usernames
            return None
        return {k: row[k] for k in ("id", "username", "name", "role")} if check_password(password, row["password"]) else None

    # ── Sessions ───────────────────────────────────────────────────────

    def start_session(self, user_id: str, days: int = 60) -> str:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(days=days)
        with self.lock:
            self.db.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, now(), expires.isoformat()))
            self.db.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
        return token

    def session_user(self, token: str | None) -> dict | None:
        if not token:
            return None
        with self.lock:
            row = self.db.execute(
                "SELECT u.id, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token_hash = ? AND s.expires_at > ?",
                (hashlib.sha256(token.encode()).hexdigest(), now()),
            ).fetchone()
        return dict(row) if row else None

    def end_session(self, token: str | None) -> None:
        if token:
            with self.lock:
                self.db.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))

    # ── Files ──────────────────────────────────────────────────────────

    def add_file(self, data: bytes, content_type: str, user_id: str | None) -> dict:
        file_id = secrets.token_hex(16)
        (self.files_dir / file_id).write_bytes(data)
        with self.lock:
            self.db.execute("INSERT INTO files VALUES (?, ?, ?, ?, ?)", (file_id, content_type, len(data), user_id, now()))
        return {"id": file_id, "url": f"/_blob/{file_id}", "sizeBytes": len(data), "contentType": content_type}

    def put_file(self, file_id: str, data: bytes, content_type: str, user_id: str | None) -> None:
        """Keeps a file under a known id (used when importing from claude.ai)."""
        if not re.fullmatch(r"[0-9a-f]{32}", file_id):
            raise StoreError("invalid_argument", f"bad file id {file_id!r}")
        (self.files_dir / file_id).write_bytes(data)
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO files VALUES (?, ?, ?, ?, ?)", (file_id, content_type, len(data), user_id, now()))

    def file(self, file_id: str) -> dict | None:
        if not re.fullmatch(r"[0-9a-f]{32}", file_id or ""):
            return None
        with self.lock:
            row = self.db.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        return dict(row, path=str(self.files_dir / file_id)) if row else None

    def delete_file(self, file_id: str) -> None:
        meta = self.file(file_id)
        if meta:
            Path(meta["path"]).unlink(missing_ok=True)
            with self.lock:
                self.db.execute("DELETE FROM files WHERE id = ?", (file_id,))
