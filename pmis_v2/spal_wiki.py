"""
S-PAL wiki: serves company pages from ohm_spal/companies/*.md.

Each page is markdown with YAML front matter. The tagline in the front matter
is the headline; the body explains where it comes from, then carries the full
S-PAL analysis. Pages are re-read on every request so edits show immediately.
"""

import re
import html as _html
from pathlib import Path
from typing import Dict, List, Optional

import yaml

SPAL_DIR = Path(__file__).resolve().parent.parent / "ohm_spal"
COMPANIES_DIR = SPAL_DIR / "companies"


# ----------------------------------------------------------------------------
# Loading
# ----------------------------------------------------------------------------

def _split_front_matter(text: str):
    if not text.startswith("---"):
        return {}, text
    parts = text.split("\n---", 2)
    if len(parts) < 2:
        return {}, text
    head = parts[0][3:]                 # yaml between the first two --- lines
    body = text[len(parts[0]) + 4:]     # everything after the closing ---
    try:
        meta = yaml.safe_load(head) or {}
    except Exception:
        meta = {}
    return meta, body


def load_company(slug: str) -> Optional[Dict]:
    path = COMPANIES_DIR / f"{slug}.md"
    if not path.exists() or slug.startswith("_"):
        return None
    meta, body = _split_front_matter(path.read_text(encoding="utf-8"))
    meta.setdefault("slug", slug)
    meta.setdefault("company", slug.replace("_", " ").title())
    meta["body_md"] = body
    meta["mtime"] = path.stat().st_mtime
    return meta


def list_companies() -> List[Dict]:
    out = []
    if not COMPANIES_DIR.exists():
        return out
    for p in sorted(COMPANIES_DIR.glob("*.md")):
        if p.name.startswith("_"):
            continue
        c = load_company(p.stem)
        if c:
            out.append(c)
    out.sort(key=lambda c: (int(c.get("serial") or 10**6), str(c.get("prepared") or ""), c["slug"]))
    for i, c in enumerate(out, 1):
        c["serial"] = int(c.get("serial") or i)
    return out


# ----------------------------------------------------------------------------
# Markdown → HTML (dependency-free; headings, tables, lists, bold, links, hr)
# ----------------------------------------------------------------------------

def _inline(s: str) -> str:
    s = _html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    s = re.sub(r"(?<![\"'>])(https?://[^\s<)]+)", r'<a href="\1" target="_blank" rel="noopener">\1</a>', s)
    return s


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "section"


def _table(lines: List[str]) -> str:
    rows = [l.strip().strip("|").split("|") for l in lines]
    rows = [[c.strip() for c in r] for r in rows]
    if len(rows) >= 2 and all(re.fullmatch(r":?-{2,}:?", c) for c in rows[1] if c):
        head, body = rows[0], rows[2:]
    else:
        head, body = None, rows
    out = ["<table>"]
    if head:
        out.append("<thead><tr>" + "".join(f"<th>{_inline(c)}</th>" for c in head) + "</tr></thead>")
    out.append("<tbody>")
    for r in body:
        out.append("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def render_markdown(md: str) -> str:
    lines = md.splitlines()
    out: List[str] = []
    i = 0
    para: List[str] = []

    def flush_para():
        if para:
            out.append("<p>" + _inline(" ".join(para)) + "</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_para(); i += 1; continue

        if stripped.startswith("```"):
            flush_para()
            buf = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i]); i += 1
            out.append("<pre><code>" + _html.escape("\n".join(buf)) + "</code></pre>")
            i += 1; continue

        if re.fullmatch(r"-{3,}|\*{3,}", stripped):
            flush_para(); out.append("<hr>"); i += 1; continue

        m = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if m:
            flush_para()
            level = len(m.group(1))
            title = m.group(2).strip()
            out.append(f'<h{level} id="{_slug(title)}">{_inline(title)}</h{level}>')
            i += 1; continue

        if stripped.startswith("|"):
            flush_para()
            buf = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                buf.append(lines[i]); i += 1
            out.append(_table(buf)); continue

        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.+)$", line)
        if m:
            flush_para()
            ordered = m.group(2)[0].isdigit()
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines):
                m2 = re.match(r"^(\s*)([-*]|\d+\.)\s+(.+)$", lines[i])
                if not m2 or (m2.group(2)[0].isdigit() != ordered):
                    break
                items.append(m2.group(3)); i += 1
                # continuation lines (indented, non-empty, not a new item)
                while i < len(lines) and lines[i].startswith("  ") and lines[i].strip() and not re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                    items[-1] += " " + lines[i].strip(); i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{_inline(x)}</li>" for x in items) + f"</{tag}>")
            continue

        if stripped.startswith(">"):
            flush_para()
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip()); i += 1
            out.append("<blockquote><p>" + _inline(" ".join(buf)) + "</p></blockquote>")
            continue

        para.append(stripped); i += 1

    flush_para()
    return "\n".join(out)


def split_h3(md: str):
    """Split markdown into (intro, [(title, body_md), ...]) on H3 headings."""
    parts = re.split(r"^### (.+)$", md, flags=re.MULTILINE)
    intro = parts[0]
    sections = [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    return intro, sections


def split_sections(body_md: str):
    """Return (tagline_sources_md, rest_md). The tagline-sources block is
    everything before the first H1 in the body."""
    m = re.search(r"^# .+$", body_md, flags=re.MULTILINE)
    if not m:
        return body_md, ""
    return body_md[: m.start()], body_md[m.start():]


# ----------------------------------------------------------------------------
# View models
# ----------------------------------------------------------------------------

STATUS_COLORS = {
    "In research": "var(--fg3)",
    "Sized": "var(--blue)",
    "Tagline agreed": "var(--green)",
    "In conversation": "var(--purple)",
    "Closed won": "var(--teal)",
    "Closed lost": "var(--red)",
}


def render_index() -> Dict:
    companies = list_companies()
    for c in companies:
        c["status_color"] = STATUS_COLORS.get(str(c.get("status")), "var(--fg3)")
    return {"companies": companies, "total": len(companies)}


def render_company(slug: str) -> Optional[Dict]:
    c = load_company(slug)
    if not c:
        return None
    sources_md, analysis_md = split_sections(c["body_md"])
    c["sources_html"] = render_markdown(sources_md)
    intro_md, secs = split_h3(sources_md)
    c["sources_intro_html"] = render_markdown(intro_md)
    c["sources_sections"] = [(t, render_markdown(b)) for t, b in secs]
    c["serial"] = next((x["serial"] for x in list_companies() if x["slug"] == slug), None)
    c["analysis_html"] = render_markdown(analysis_md)
    c["status_color"] = STATUS_COLORS.get(str(c.get("status")), "var(--fg3)")
    # TOC from H2s in the analysis
    c["toc"] = [(_slug(t), t) for t in re.findall(r"^## (.+)$", analysis_md, flags=re.MULTILINE)]
    return c
