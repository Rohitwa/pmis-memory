#!/usr/bin/env python3
"""
Build a static HTML version of the S-PAL wiki.

    python3 ohm_spal/build_html.py              # writes ohm_spal/html/
    python3 ohm_spal/build_html.py --out DIR    # elsewhere
    python3 ohm_spal/build_html.py --fragment   # also writes index.fragment.html
                                                #   (no doctype/head/body, for publishing)

Output:
    html/index.html              all companies on one page, tagline first, anchors per company
    html/<slug>.html             one page per company
"""

import argparse
import html as _html
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "pmis_v2"))
import spal_wiki as w  # noqa: E402

TITLE = "S-PAL Wiki"

CSS = """
/* Layout: one reading column; tagline as the hero of each company; analysis folded below. */
:root {
  --bg: #f7f6f3; --surface: #ffffff; --bg2: #eeece7; --line: #d9d5cc;
  --fg: #1c1b19; --fg2: #4b4842; --fg3: #7d786f;
  --accent: #a4552a; --accent-soft: #f3e4da; --accent-ink: #7d3d1a;
  --good: #2f7d4f; --info: #2b5aa6; --warn: #b07a17;
  --display: "IBM Plex Serif", Georgia, "Times New Roman", serif;
  --body: "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #161614; --surface: #1f1e1b; --bg2: #262522; --line: #3a3833;
  --fg: #ece9e2; --fg2: #c4bfb4; --fg3: #8d877b;
  --accent: #d98a4e; --accent-soft: #3a2a1e; --accent-ink: #f0b482;
  --good: #6cc08f; --info: #7ea5e8; --warn: #e0b24a;
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #161614; --surface: #1f1e1b; --bg2: #262522; --line: #3a3833;
  --fg: #ece9e2; --fg2: #c4bfb4; --fg3: #8d877b;
  --accent: #d98a4e; --accent-soft: #3a2a1e; --accent-ink: #f0b482;
  --good: #6cc08f; --info: #7ea5e8; --warn: #e0b24a;
  color-scheme: dark; }

* { box-sizing: border-box; }
html, body { margin: 0; overflow-x: clip; }
body { background: var(--bg); color: var(--fg); font-family: var(--body); font-size: 15px; line-height: 1.6;
  padding-block: 0 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
a { color: var(--info); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wrap { max-width: 880px; margin: 0 auto; min-width: 0; }

.top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  padding: 20px 0 14px; border-bottom: 1px solid var(--line); }
.top .brand { font-family: var(--display); font-size: 22px; font-weight: 600; letter-spacing: -0.2px; color: var(--fg); }
.top .brand small { font-family: var(--body); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--fg3); margin-left: 10px; }
.top .built { font-size: 12px; color: var(--fg3); font-variant-numeric: tabular-nums; }

h1, h2, h3 { text-wrap: balance; line-height: 1.25; margin: 0; }
h1 { font-family: var(--display); font-size: 30px; font-weight: 600; }
h2 { font-family: var(--display); font-size: 21px; font-weight: 600; margin-top: 36px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 15.5px; font-weight: 600; margin-top: 22px; color: var(--fg); }
p { margin: 10px 0; color: var(--fg2); max-width: 70ch; }
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
code { font-family: var(--mono); font-size: 12.5px; background: var(--bg2); padding: 1px 5px; border-radius: 3px; }
pre { overflow-x: auto; background: var(--bg2); padding: 12px; border-radius: 6px; }
ul, ol { padding-left: 22px; color: var(--fg2); }
li { margin: 4px 0; }
blockquote { margin: 12px 0; padding: 8px 14px; border-left: 3px solid var(--line); color: var(--fg2); }

.lede { font-size: 16px; color: var(--fg2); margin: 18px 0 26px; max-width: 65ch; }
.index-list { display: grid; gap: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px 20px; min-width: 0; }
.card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.card-head a { font-family: var(--display); font-size: 19px; font-weight: 600; color: var(--fg); }
.card .sub { font-size: 12.5px; color: var(--fg3); margin-top: 2px; }
.pill { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; padding: 2px 9px; border-radius: 999px; border: 1px solid currentColor; }
.pill.good { color: var(--good); } .pill.info { color: var(--info); } .pill.warn { color: var(--warn); } .pill.muted { color: var(--fg3); }
.tagline { font-family: var(--display); font-size: 18px; line-height: 1.45; color: var(--fg); margin: 14px 0 6px; padding: 12px 16px;
  border-left: 4px solid var(--accent); background: var(--accent-soft); border-radius: 0 6px 6px 0; }
.tagline.hero { font-size: 23px; padding: 20px 24px; margin: 20px 0 8px; }
.tagline-meta { font-size: 12px; color: var(--fg3); }

.company { margin-top: 48px; padding-top: 8px; }
.company-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.meta { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 4px; }
.meta span { font-size: 12px; color: var(--fg2); background: var(--bg2); border: 1px solid var(--line); border-radius: 4px; padding: 2px 9px; }
.meta span.ohm { color: var(--accent-ink); background: var(--accent-soft); border-color: transparent; }
.sources h2 { border: 0; font-size: 19px; margin-top: 26px; }
.sources h3 { font-family: var(--display); font-size: 16px; font-weight: 600; color: var(--accent-ink); }

.tbl { overflow-x: auto; margin: 12px 0; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 520px; }
th { text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fg3); background: var(--bg2); border-bottom: 1px solid var(--line); font-weight: 600; }
td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--fg); font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: 0; }

details.fold { margin-top: 32px; border-top: 2px solid var(--line); }
details.fold > summary { cursor: pointer; list-style: none; padding: 14px 0; font-size: 13px; font-weight: 600; color: var(--fg2); text-transform: uppercase; letter-spacing: 0.6px; }
details.fold > summary::-webkit-details-marker { display: none; }
details.fold > summary::before { content: "\\25B8  "; color: var(--accent); }
details.fold[open] > summary::before { content: "\\25BE  "; }
.toc { font-size: 12.5px; color: var(--fg3); line-height: 1.9; margin-bottom: 8px; }
.toc a { color: var(--fg2); }
.analysis h1 { font-size: 22px; margin-top: 18px; }
.foot { margin-top: 48px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--fg3); }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
@media (max-width: 480px) { h1 { font-size: 25px; } .tagline.hero { font-size: 19px; padding: 14px 16px; } }
"""

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@400;600&family=IBM+Plex+Mono&display=swap">'

PILL = {"Tagline agreed": "good", "In conversation": "info", "Closed won": "good",
        "Sized": "info", "In research": "muted", "Closed lost": "warn"}


def esc(s) -> str:
    return _html.escape(str(s or ""), quote=True)


def wrap_tables(html: str) -> str:
    return html.replace("<table>", '<div class="tbl"><table>').replace("</table>", "</table></div>")


def head(title: str, fragment: bool) -> str:
    inner = f'<title>{esc(title)}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{FONTS}\n<style>{CSS}</style>\n'
    if fragment:
        return inner
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + inner + '</head>\n<body>\n')


def tail(fragment: bool) -> str:
    return "" if fragment else "</body>\n</html>\n"


def topbar(built: str) -> str:
    return (f'<header class="top"><div class="brand">S-PAL<small>OHM value drivers</small></div>'
            f'<div class="built">Built {built}</div></header>')


def company_card(c, href) -> str:
    status = str(c.get("status") or "In research")
    pill = PILL.get(status, "muted")
    brand = f' <span class="sub">&middot; {esc(c["brand"])}</span>' if c.get("brand") and c["brand"] != c["company"] else ""
    bits = " &middot; ".join(esc(x) for x in [c.get("location"), c.get("sector"), c.get("revenue_base")] if x)
    tag = (f'<div class="tagline">{esc(c["tagline"])}</div>'
           f'<div class="tagline-meta">Tagline {esc(c.get("tagline_date") or "")} &middot; <a href="{href}">where it comes from</a></div>'
           if c.get("tagline") else '<div class="sub" style="margin-top:10px;font-style:italic;">No tagline yet.</div>')
    return (f'<article class="card"><div class="card-head"><a href="{href}">{esc(c["company"])}</a>{brand}'
            f'<span class="pill {pill}">{esc(status)}</span></div><div class="sub">{bits}</div>{tag}</article>')


def company_section(c, anchor_id: str, back_href: str) -> str:
    status = str(c.get("status") or "In research")
    pill = PILL.get(status, "muted")
    meta = []
    if c.get("brand") and c["brand"] != c["company"]: meta.append(f"<span>{esc(c['brand'])}</span>")
    for k in ("location", "revenue_base"):
        if c.get(k): meta.append(f"<span>{esc(c[k])}</span>")
    for m in c.get("ohm_modules") or []: meta.append(f'<span class="ohm">OHM: {esc(m)}</span>')
    tag = (f'<div class="tagline hero">{esc(c["tagline"])}</div>'
           f'<div class="tagline-meta">Agreed {esc(c.get("tagline_date") or c.get("prepared") or "")}'
           + (f' &middot; for {esc(c["owner_contact"])}' if c.get("owner_contact") else "") + "</div>"
           if c.get("tagline") else f'<p><em>No tagline yet. Status: {esc(status)}.</em></p>')
    toc = ""
    if c.get("toc"):
        toc = '<div class="toc">' + " &middot; ".join(f'<a href="#{anchor_id}-{i}">{esc(t)}</a>' for i, (_, t) in enumerate(c["toc"])) + "</div>"
    analysis = c["analysis_html"]
    # namespace analysis heading ids per company so several companies can share one page
    for i, (sid, _) in enumerate(c.get("toc") or []):
        analysis = analysis.replace(f'<h2 id="{sid}">', f'<h2 id="{anchor_id}-{i}">', 1)
    return (f'<section class="company" id="{anchor_id}">'
            f'<div class="company-head"><h1>{esc(c["company"])}</h1><span class="pill {pill}">{esc(status)}</span></div>'
            f'<div class="meta">{"".join(meta)}</div>{tag}'
            f'<div class="sources">{wrap_tables(c["sources_html"])}</div>'
            f'<details class="fold" open><summary>Full S-PAL analysis (steps 1–5 and sources)</summary>{toc}'
            f'<div class="analysis">{wrap_tables(analysis)}</div></details>'
            f'<p class="foot"><a href="{back_href}">&larr; All companies</a> &middot; Source: <code>ohm_spal/companies/{esc(c["slug"])}.md</code></p>'
            f'</section>')


def build(out: Path, fragment: bool) -> list:
    out.mkdir(parents=True, exist_ok=True)
    built = date.today().isoformat()
    companies = [w.render_company(c["slug"]) for c in w.list_companies()]
    written = []

    # all-in-one index (used for both local viewing and publishing)
    n = len(companies)
    body = [topbar(built), '<main class="wrap">',
            f'<h1 style="margin-top:28px">Companies</h1>',
            f'<p class="lede">{n} compan{"y" if n == 1 else "ies"}. Specific P&amp;L levers per enterprise, filtered to what OHM controls, sized, and distilled to one line for the owner. Each tagline is traced to its numbers and sources below.</p>',
            '<div class="index-list">']
    body += [company_card(c, f"#{c['slug']}") for c in companies]
    body.append("</div>")
    body += [company_section(c, c["slug"], "#top") for c in companies]
    body.append('<p class="foot">Pages are generated from <code>ohm_spal/companies/*.md</code> by <code>ohm_spal/build_html.py</code>.</p></main>')
    page = head(TITLE, False) + '<a id="top"></a>' + "\n".join(body) + tail(False)
    (out / "index.html").write_text(page, encoding="utf-8"); written.append(out / "index.html")
    if fragment:
        frag = head(TITLE, True) + '<a id="top"></a>' + "\n".join(body) + tail(True)
        (out / "index.fragment.html").write_text(frag, encoding="utf-8"); written.append(out / "index.fragment.html")

    # per-company pages
    for c in companies:
        page = (head(f'{c["company"]} — S-PAL', False) + topbar(built) + '<main class="wrap">'
                + company_section(c, c["slug"], "index.html") + "</main>" + tail(False))
        p = out / f'{c["slug"]}.html'
        p.write_text(page, encoding="utf-8"); written.append(p)
    return written


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "html"))
    ap.add_argument("--fragment", action="store_true")
    a = ap.parse_args()
    for p in build(Path(a.out), a.fragment):
        print("wrote", p)
