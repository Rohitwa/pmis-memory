"""shares.py — the pages a share link opens, for people without an account.

A routine link shows her current schedule (it updates as the schedule
changes) with a Save as PDF button. A document link shows one document's
title, date and brief, and lets the reader open or download the file.
Nothing else in the diary is reachable from a link.
"""

from __future__ import annotations

from datetime import date, datetime
from html import escape

from .reminders import time_text
from .schedule import times_of

WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
CATEGORY = {"medicine": "Medicine", "care": "Care & routine", "doctor": "Doctor visit", "vaccine": "Vaccination", "other": "Other"}

STYLE = """
:root { --paper:#f6f5f9; --surface:#fff; --line:#e1deea; --ink:#221f2b; --muted:#676373; --accent:#5b3a8e; --accent-ink:#fff; --soft:#ece5f6; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --paper:#15131b; --surface:#1f1c27; --line:#322e3d; --ink:#ece9f4; --muted:#a39eb2; --accent:#b99ce4; --accent-ink:#1b1426; --soft:#2d2541; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 "Hind", "Segoe UI", system-ui, sans-serif;
       padding-block: 24px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 760px; margin: 0 auto; display: grid; gap: 18px; }
h1 { margin: 0; font: 700 1.9rem/1.15 "Baloo 2", "Trebuchet MS", system-ui, sans-serif; color: var(--accent); text-wrap: balance; }
h2 { margin: 8px 0 0; font: 600 1.15rem/1.2 "Baloo 2", "Trebuchet MS", system-ui, sans-serif; }
p { margin: 0; }
.meta { color: var(--muted); font-size: .9rem; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.row { display: grid; grid-template-columns: 9.5rem minmax(0, 1fr); gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
.when { font-weight: 600; font-variant-numeric: tabular-nums; }
.what { font-weight: 600; }
.details, .note { color: var(--muted); font-size: .9rem; }
.tag { display: inline-block; margin-left: 6px; padding: 0 8px; border-radius: 999px; background: var(--soft); color: var(--accent); font-size: .75rem; font-weight: 600; vertical-align: 2px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { display: inline-flex; align-items: center; min-height: 44px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--line);
       background: var(--surface); color: var(--ink); font: 600 .95rem "Hind", system-ui, sans-serif; text-decoration: none; cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.brief { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; white-space: pre-wrap; }
.file img { display: block; max-width: 100%; border-radius: 10px; border: 1px solid var(--line); background: #fff; }
footer { color: var(--muted); font-size: .8rem; border-top: 1px solid var(--line); padding-top: 12px; }
@media (max-width: 520px) { .row { grid-template-columns: 1fr; gap: 2px; } }
@media print {
  :root { --paper:#fff; --surface:#fff; --ink:#000; --muted:#444; --accent:#3b2366; --line:#ccc; --soft:#eee; color-scheme: light; }
  body { padding: 0; font-size: 12pt; } .actions { display: none; } .card { break-inside: auto; } .row { break-inside: avoid; }
}
"""


def page(title: str, body: str) -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>{escape(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Hind:wght@400;500;600&display=swap">
<style>{STYLE}</style></head><body><main>{body}</main></body></html>"""


def long_date(key: str) -> str:
    d = date.fromisoformat(key)
    return f"{d.strftime('%a')} {d.day} {d.strftime('%B %Y')}"


def short_date(key: str) -> str:
    d = date.fromisoformat(key)
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def repeat_text(s: dict) -> str:
    if s.get("repeat") == "daily":
        n = int(s.get("every") or 1)
        return "Every day" if n == 1 else f"Every {n} days"
    if s.get("repeat") == "weekly":
        wds = sorted(s.get("weekdays") or [(date.fromisoformat(s["date"]).weekday() + 1) % 7])
        if len(wds) == 7:
            return "Every day"
        if wds == [1, 2, 3, 4, 5]:
            return "Weekdays"
        if wds == [0, 6]:
            return "Weekends"
        return "Every " + ", ".join((WEEKDAY_NAMES if len(wds) == 1 else WEEKDAYS)[d] for d in wds)
    if s.get("repeat") == "monthly":
        n = int(s["date"][8:])
        suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
        return f"Every month on the {n}{suffix}"
    return short_date(s["date"])


def _row(s: dict, today: str, when: str) -> str:
    times = times_of(s)
    clock = ", ".join(time_text(t) for t in times) if times else "Any time"
    extra = []
    if s.get("repeat") != "once" and s.get("date", "") > today:
        extra.append(f"from {short_date(s['date'])}")
    if s.get("until"):
        extra.append(f"until {short_date(s['until'])}")
    note = f' <span class="note">· {escape(", ".join(extra))}</span>' if extra else ""
    tag = f'<span class="tag">{escape(CATEGORY.get(s.get("category"), ""))}</span>' if s.get("category") in CATEGORY else ""
    details = f'<p class="details">{escape(s["details"])}</p>' if s.get("details") else ""
    return (f'<div class="row"><div class="when">{escape(clock)}<div class="note">{escape(when)}</div></div>'
            f'<div><span class="what">{escape(s.get("what", ""))}</span>{tag}{note}{details}</div></div>')


def routine_page(name: str, schedules: list[dict], today: str, shared_by: str, expires_at: str | None) -> str:
    live = [s for s in schedules if not s.get("paused") and not (s.get("until") and s["until"] < today)]
    daily = [s for s in live if (s.get("repeat") == "daily" and int(s.get("every") or 1) == 1) or (s.get("repeat") == "weekly" and len(s.get("weekdays") or []) == 7)]
    once = sorted([s for s in live if s.get("repeat") == "once" and s.get("date", "") >= today], key=lambda s: (s["date"], (times_of(s) or [""])[0]))
    other = [s for s in live if s not in daily and s not in once and s.get("repeat") != "once"]
    first_time = lambda s: (times_of(s) or ["99:99"])[0]

    sections = []
    if daily:
        sections.append("<h2>Every day</h2><div class='card'>" + "".join(_row(s, today, "") for s in sorted(daily, key=first_time)) + "</div>")
    if other:
        sections.append("<h2>On certain days</h2><div class='card'>" + "".join(_row(s, today, repeat_text(s)) for s in sorted(other, key=first_time)) + "</div>")
    if once:
        sections.append("<h2>Coming up</h2><div class='card'>" + "".join(_row(s, today, short_date(s["date"])) for s in once) + "</div>")
    if not sections:
        sections.append("<p class='meta'>Nothing is scheduled right now.</p>")
    until = f" This link works until {short_date(expires_at[:10])}." if expires_at else ""
    body = f"""
<header style="display:grid;gap:6px">
  <h1>{escape(name)}'s routine</h1>
  <p class="meta">As of {escape(long_date(today))}. Shared by {escape(shared_by or "a parent")} from Divisha Wellness. This page stays up to date as the routine changes.{escape(until)}</p>
</header>
<div class="actions"><button class="btn primary" type="button" onclick="window.print()">Save as PDF</button></div>
{''.join(sections)}
<footer>Shared from Divisha Wellness. Follow the doctor's advice for medicines and doses.</footer>"""
    return page(f"{name}'s routine", body)


def document_page(doc: dict, token: str, shared_by: str, expires_at: str | None) -> str:
    is_image = str(doc.get("fileType", "")).startswith("image/")
    file_url = f"/s/{escape(token)}/file"
    shown = (f'<div class="file"><img src="{file_url}" alt="{escape(doc.get("title", ""))}"></div>' if is_image else "")
    until = f" This link works until {short_date(expires_at[:10])}." if expires_at else ""
    body = f"""
<header style="display:grid;gap:6px">
  <h1>{escape(doc.get('title', 'Document'))}</h1>
  <p class="meta">{escape(long_date(doc['date']) if doc.get('date') else '')} · {'Photo' if is_image else 'PDF'} · Shared by {escape(shared_by or 'a parent')} from Divisha Wellness.{escape(until)}</p>
</header>
<p class="brief">{escape(doc.get('brief', ''))}</p>
<div class="actions">
  <a class="btn primary" href="{file_url}" target="_blank" rel="noopener">{'Open the photo' if is_image else 'Open the PDF'}</a>
  <a class="btn" href="{file_url}?download=1">Download</a>
</div>
{shown}
<footer>Shared from Divisha Wellness.</footer>"""
    return page(doc.get("title", "Document"), body)


def gone_page() -> str:
    return page("Link not available", """
<h1>This link isn't available</h1>
<p>It may have expired, or the person who shared it turned it off. Ask them to share it again.</p>""")
