"""main.py — the Divisha Wellness server, for hosting outside claude.ai.

It serves the same five app files, plus a small adapter (static/claude-shim.js)
that gives the app what claude.ai gives it there: storage, sign-in, Claude,
file storage and downloads. Run one copy only: the live-update feed lives in
memory, and the diary is one SQLite file.

Environment:
  DATA_DIR             where divisha.db and files/ live (default ./data)
  APP_DIR              the app's five files (default ../app)
  ANTHROPIC_API_KEY    for Claude
  COOKIE_SECURE        "1" in production (HTTPS only cookies)
  DAILY_CLAUDE_LIMIT   Claude replies per person per day (default 150)
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse

from .claude_api import ClaudeError, stream_reply
from .store import Store, StoreError

HERE = Path(__file__).parent
APP_DIR = Path(os.environ.get("APP_DIR", HERE.parent / "app")).resolve()
STATIC = HERE / "static"
COOKIE = "dw_session"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "0") == "1"
DAILY_CLAUDE_LIMIT = int(os.environ.get("DAILY_CLAUDE_LIMIT", "150"))
APP_FILES = {"style.css": "text/css", "screens.js": "text/javascript", "diary.js": "text/javascript", "helper.js": "text/javascript"}
UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
MAX_UPLOAD = 20 * 1024 * 1024

# The same wrapper claude.ai puts around the page, plus the adapter script.
SKELETON = ('<!doctype html><html lang="en"><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}'
            '[hidden]:not([hidden=until-found i]){display:none!important}</style><script src="/claude-shim.js"></script></head><body>\n')

store = Store(os.environ.get("DATA_DIR", HERE.parent / "data"))
app = FastAPI(title="Divisha Wellness", docs_url=None, redoc_url=None, openapi_url=None)


# ─── Security basics ─────────────────────────────────────────────────────

@app.middleware("http")
async def headers(request: Request, call_next):
    # Changes must come from the app itself: a plain form on another site can't add this header.
    if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD") and request.headers.get("x-divisha") != "1":
        return JSONResponse({"code": "invalid_request", "message": "missing X-Divisha header"}, status_code=400)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.exception_handler(StoreError)
async def store_error(_: Request, e: StoreError):
    return JSONResponse({"code": e.code, "message": str(e)}, status_code=e.status)


def current_user(request: Request) -> dict:
    user = store.session_user(request.cookies.get(COOKIE))
    if not user:
        raise HTTPException(401, "sign in first")
    return user


def parent(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "parent":
        raise StoreError("invalid_argument", "you can read this diary but not change it", 403)
    return user


# ─── Signing in ──────────────────────────────────────────────────────────

attempts: dict[str, deque] = defaultdict(deque)


def too_many_attempts(ip: str) -> bool:
    q = attempts[ip]
    while q and q[0] < time.time() - 900:
        q.popleft()
    return len(q) >= 10


@app.get("/login", response_class=HTMLResponse)
def login_page(error: str = ""):
    html = (STATIC / "login.html").read_text()
    message = {"wrong": "That username and password don't match.", "slow": "Too many tries. Wait 15 minutes, then try again."}.get(error, "")
    return html.replace("{{error}}", message).replace("{{hidden}}", "" if message else "hidden")


@app.post("/login")
async def login(request: Request):
    ip = request.headers.get("fly-client-ip") or (request.client.host if request.client else "?")
    if too_many_attempts(ip):
        return RedirectResponse("/login?error=slow", status_code=303)
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode(errors="replace")).items()}
    username, password = form.get("username", ""), form.get("password", "")
    user = await asyncio.to_thread(store.check_login, username, password)
    if not user:
        attempts[ip].append(time.time())
        return RedirectResponse("/login?error=wrong", status_code=303)
    token = store.start_session(user["id"])
    response = RedirectResponse("/", status_code=303)
    response.set_cookie(COOKIE, token, max_age=60 * 86400, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    return response


@app.get("/logout")
def logout(request: Request):
    store.end_session(request.cookies.get(COOKIE))
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie(COOKIE, path="/")
    return response


@app.get("/healthz")
def healthz():
    return {"ok": True}


# ─── The app ─────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    if not store.session_user(request.cookies.get(COOKIE)):
        return RedirectResponse("/login", status_code=303)
    return HTMLResponse(SKELETON + (APP_DIR / "index.html").read_text() + "\n</body></html>\n", headers={"Cache-Control": "no-store"})


@app.get("/claude-shim.js")
def shim():
    return FileResponse(STATIC / "claude-shim.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/{name}")
def app_file(name: str, _: dict = Depends(current_user)):
    if name not in APP_FILES:
        raise HTTPException(404)
    return FileResponse(APP_DIR / name, media_type=APP_FILES[name], headers={"Cache-Control": "no-cache"})


# ─── Who's signed in ─────────────────────────────────────────────────────

@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return {"id": user["id"], "name": user["name"], "role": user["role"]}


@app.get("/api/people")
def people(_: dict = Depends(current_user)):
    return {u["id"]: {"name": u["name"]} for u in store.users()}


# ─── Storage, with a live feed of what changed ───────────────────────────

class Changes:
    def __init__(self):
        self.seq = 0
        self.recent: deque = deque(maxlen=500)
        self.cond = asyncio.Condition()

    async def publish(self, path: str):
        async with self.cond:
            self.seq += 1
            self.recent.append((self.seq, path))
            self.cond.notify_all()


changes = Changes()


@app.get("/api/doc")
def get_doc(path: str, _: dict = Depends(current_user)):
    return store.get(path)


@app.put("/api/doc")
async def set_doc(path: str, request: Request, _: dict = Depends(parent)):
    version = store.set(path, (await request.json()).get("data"))
    await changes.publish(path)
    return {"version": version}


@app.patch("/api/doc")
async def update_doc(path: str, request: Request, _: dict = Depends(parent)):
    version = store.update(path, (await request.json()).get("data") or {})
    await changes.publish(path)
    return {"version": version}


@app.delete("/api/doc")
async def delete_doc(path: str, _: dict = Depends(parent)):
    store.delete(path)
    await changes.publish(path)
    return {"ok": True}


@app.post("/api/query")
async def run_query(request: Request, _: dict = Depends(current_user)):
    q = await request.json()
    return {"docs": store.query(q.get("collection", ""), q.get("where") or [], q.get("order"), q.get("limit") or 1000)}


@app.get("/api/changes")
async def change_feed(request: Request, _: dict = Depends(current_user)):
    async def events():
        seen = changes.seq
        yield f"event: hello\ndata: {json.dumps({'seq': seen})}\n\n"
        while not await request.is_disconnected():
            async with changes.cond:
                try:
                    await asyncio.wait_for(changes.cond.wait_for(lambda: changes.seq > seen), timeout=25)
                except asyncio.TimeoutError:
                    yield ": still here\n\n"                     # keeps proxies from closing the line
                    continue
                paths = [p for s, p in changes.recent if s > seen]
                seen = changes.seq
            yield f"data: {json.dumps({'paths': paths})}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─── Files ───────────────────────────────────────────────────────────────

def looks_like(data: bytes, content_type: str) -> bool:
    return {
        "application/pdf": data[:5] == b"%PDF-",
        "image/png": data[:8] == b"\x89PNG\r\n\x1a\n",
        "image/jpeg": data[:3] == b"\xff\xd8\xff",
        "image/gif": data[:4] in (b"GIF8",),
        "image/webp": data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    }.get(content_type, False)


@app.post("/api/files")
async def upload(request: Request, user: dict = Depends(parent)):
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip()
    if content_type not in UPLOAD_TYPES:
        raise StoreError("unsupported_type", "only photos (JPG, PNG, WebP, GIF) and PDFs", 415)
    data = await request.body()
    if len(data) > MAX_UPLOAD:
        raise StoreError("too_large", "files can be up to 20 MB", 413)
    if not data or not looks_like(data, content_type):
        raise StoreError("unsupported_type", "the file doesn't look like a photo or PDF", 415)
    return store.add_file(data, content_type, user["id"])


@app.delete("/api/files/{file_id}")
def delete_file(file_id: str, _: dict = Depends(parent)):
    store.delete_file(file_id)
    return {"ok": True}


@app.get("/_blob/{file_id}")
def blob(file_id: str, _: dict = Depends(current_user)):
    meta = store.file(file_id)
    if not meta:
        raise HTTPException(404)
    return FileResponse(meta["path"], media_type=meta["type"], headers={
        "Content-Disposition": "inline", "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


# ─── Claude ──────────────────────────────────────────────────────────────

used_today: dict[tuple[str, str], int] = defaultdict(int)


@app.post("/api/claude")
async def ask_claude(request: Request, user: dict = Depends(parent)):
    body = await request.json()
    key = (user["id"], date.today().isoformat())
    if used_today[key] >= DAILY_CLAUDE_LIMIT:
        return JSONResponse({"code": "rate_limited", "message": "today's limit for Claude is used up"}, status_code=429)
    used_today[key] += 1

    async def events():
        try:
            async for piece in stream_reply(body.get("turns") or [], body.get("images") or [], as_json=body.get("mode") == "json"):
                if await request.is_disconnected():
                    return                                       # Stop was pressed: the stream closes and Claude stops
                yield f"data: {json.dumps(piece)}\n\n"
        except ClaudeError as e:
            yield f"data: {json.dumps({'error': e.code, 'message': str(e)})}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
