#!/usr/bin/env python3
"""
Build a static HTML version of the S-PAL wiki, in a plain Wikipedia-like style.

    python3 ohm_spal/build_html.py              # writes ohm_spal/html/
    python3 ohm_spal/build_html.py --out DIR
    python3 ohm_spal/build_html.py --fragment   # also writes index.fragment.html
                                                #   (no doctype/head/body, for publishing)

Output:
    html/index.html     Index table (serial no., company). Clicking a company opens
                        its page inside the same file (CSS :target, no JavaScript).
    html/<slug>.html    Standalone page per company.
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
/* Plain reference-page layout, after Wikipedia: white page, serif headings with a rule, blue links, grey-bordered tables. */
:root {
  --bg: #ffffff; --fg: #202122; --fg2: #54595d; --link: #3366cc; --rule: #a2a9b1;
  --tbl-bg: #f8f9fa; --tbl-head: #eaecf0; --box: #f8f9fa;
  --serif: "Linux Libertine", Georgia, "Times New Roman", serif;
  --sans: sans-serif;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #101418; --fg: #eaecf0; --fg2: #a2a9b1; --link: #88a3e9; --rule: #54595d;
  --tbl-bg: #1b1f23; --tbl-head: #27292d; --box: #1b1f23; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #101418; --fg: #eaecf0; --fg2: #a2a9b1; --link: #88a3e9; --rule: #54595d;
  --tbl-bg: #1b1f23; --tbl-head: #27292d; --box: #1b1f23; color-scheme: dark; }

* { box-sizing: border-box; }
html, body { margin: 0; overflow-x: clip; }
body { background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 14px; line-height: 1.6;
  padding-block: 0 40px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
.page { max-width: 960px; margin: 0 auto; min-width: 0; }
.sitehead { font-size: 12px; color: var(--fg2); padding: 10px 0; border-bottom: 1px solid var(--rule); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.sitehead b { color: var(--fg); font-family: var(--serif); font-size: 15px; font-weight: normal; }

h1, h2 { font-family: var(--serif); font-weight: normal; line-height: 1.3; margin: 0; border-bottom: 1px solid var(--rule); text-wrap: balance; }
h1 { font-size: 28px; margin: 14px 0 4px; }
h2 { font-size: 21px; margin: 24px 0 8px; }
h3 { font-size: 15px; font-weight: bold; margin: 18px 0 6px; }
p { margin: 8px 0; max-width: 75ch; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 20px 0; }
code { font-family: monospace; font-size: 12.5px; background: var(--tbl-bg); padding: 0 3px; }
pre { overflow-x: auto; background: var(--tbl-bg); padding: 10px; border: 1px solid var(--rule); }
ul, ol { padding-left: 24px; }
li { margin: 2px 0; }
blockquote { margin: 8px 0; padding: 6px 12px; border-left: 3px solid var(--rule); color: var(--fg2); }
.sub { font-size: 12.5px; color: var(--fg2); margin: 2px 0 10px; }

.tbl { overflow-x: auto; margin: 10px 0; }
table { border-collapse: collapse; font-size: 13px; background: var(--tbl-bg); border: 1px solid var(--rule); min-width: 480px; }
table.full { width: 100%; }
th, td { border: 1px solid var(--rule); padding: 5px 9px; vertical-align: top; text-align: left; }
th { background: var(--tbl-head); font-weight: bold; }
td { font-variant-numeric: tabular-nums; }
td.num { text-align: right; width: 1%; white-space: nowrap; }

.tagline { border: 1px solid var(--rule); background: var(--box); padding: 10px 14px; margin: 12px 0 4px; font-family: var(--serif); font-size: 18px; line-height: 1.45; max-width: none; }

details { margin: 6px 0; }
details > summary { cursor: pointer; padding: 4px 0; }
details.sec > summary { font-size: 15px; font-weight: bold; }
details.full > summary { font-family: var(--serif); font-size: 21px; font-weight: normal; border-bottom: 1px solid var(--rule); margin-top: 24px; padding-bottom: 6px; list-style: none; }
details.full > summary::-webkit-details-marker { display: none; }
details.full > summary::before { content: "[show] "; font-family: var(--sans); font-size: 12px; color: var(--link); }
details.full[open] > summary::before { content: "[hide] "; }
.analysis h1 { font-size: 21px; }
.toc { border: 1px solid var(--rule); background: var(--tbl-bg); display: inline-block; padding: 8px 14px; margin: 10px 0; font-size: 13px; }
.toc b { display: block; margin-bottom: 4px; }
.toc a { display: block; }
.foot { margin-top: 32px; padding-top: 10px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--fg2); }

/* Single-file navigation: a company section shows only when targeted; the index hides then. */
.company { display: none; }
.company:target { display: block; }
body:has(.company:target) #index { display: none; }
.standalone .company { display: block; }
@media (max-width: 480px) { h1 { font-size: 23px; } .tagline { font-size: 16px; } }
"""


def esc(s) -> str:
    return _html.escape(str(s or ""), quote=True)


def wrap_tables(html: str) -> str:
    return html.replace("<table>", '<div class="tbl"><table class="full">').replace("</table>", "</table></div>")


def head(title: str, fragment: bool) -> str:
    inner = f'<title>{esc(title)}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{CSS}</style>\n'
    if fragment:
        return inner
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + inner + '</head>\n<body>\n')


def tail(fragment: bool) -> str:
    return "" if fragment else "</body>\n</html>\n"


def sitehead(built: str, index_href: str) -> str:
    return (f'<div class="sitehead"><span><b><a href="{index_href}" style="color:inherit">S-PAL Wiki</a></b>'
            f' &middot; OHM value drivers by enterprise</span><span>Built {built}</span></div>')


def index_table(companies, href) -> str:
    rows = "".join(
        f'<tr><td class="num">{c["serial"]}</td><td><a href="{href(c)}">{esc(c["company"])}</a></td>'
        f'<td>{esc(c.get("location"))}</td><td>{esc(c.get("status") or "In research")}</td></tr>'
        for c in companies)
    return (f'<div class="tbl"><table class="full"><thead><tr><th>#</th><th>Company</th><th>Location</th><th>Status</th></tr></thead>'
            f'<tbody>{rows}</tbody></table></div>')


def company_section(c, back_href: str, standalone: bool) -> str:
    sid = c["slug"]
    meta = " &middot; ".join(esc(x) for x in [
        c.get("brand") if c.get("brand") and c["brand"] != c["company"] else None,
        c.get("location"), c.get("revenue_base"), f'Status: {c.get("status") or "In research"}',
        f'Prepared {c.get("prepared")}' if c.get("prepared") else None] if x)
    if c.get("tagline"):
        tag = (f'<div class="tagline">{esc(c["tagline"])}</div>'
               f'<p class="sub">Agreed {esc(c.get("tagline_date") or c.get("prepared") or "")}'
               + (f' &middot; for {esc(c["owner_contact"])}' if c.get("owner_contact") else "") + "</p>")
    else:
        tag = f'<p><i>No tagline yet. Status: {esc(c.get("status") or "In research")}.</i></p>'
    if c.get("ohm_modules"):
        tag += '<p class="sub">OHM scope: ' + "; ".join(esc(m) for m in c["ohm_modules"]) + "</p>"

    sources = wrap_tables(c["sources_intro_html"])
    for title, body in c["sources_sections"]:
        sources += f'<details class="sec"><summary>{esc(title)}</summary>{wrap_tables(body)}</details>'

    analysis = c["analysis_html"]
    toc_items = []
    for i, (hid, t) in enumerate(c.get("toc") or []):
        nid = f"{sid}-s{i}"
        analysis = analysis.replace(f'<h2 id="{hid}">', f'<h2 id="{nid}">', 1)
        toc_items.append(f'<a href="#{nid}">{esc(t)}</a>')
    toc = f'<div class="toc"><b>Contents</b>{"".join(toc_items)}</div>' if toc_items else ""

    return (f'<section class="company" id="{sid}">'
            f'<p class="sub"><a href="{back_href}">&larr; Index</a></p>'
            f'<h1>{c["serial"]}. {esc(c["company"])}</h1><p class="sub">{meta}</p>{tag}'
            f'<div class="sources">{sources}</div>'
            f'<details class="full"><summary>Full S-PAL analysis</summary>{toc}<div class="analysis">{wrap_tables(analysis)}</div></details>'
            f'<p class="foot">Source file: <code>ohm_spal/companies/{esc(sid)}.md</code></p>'
            f'</section>')


def build(out: Path, fragment: bool) -> list:
    out.mkdir(parents=True, exist_ok=True)
    built = date.today().isoformat()
    companies = [w.render_company(c["slug"]) for c in w.list_companies()]
    written = []

    # index.html: index table + every company as a hidden :target section (single file, no JS)
    body = [sitehead(built, "#index"), '<div class="page">',
            '<section id="index"><h1>S-PAL Wiki</h1>',
            '<p class="sub">Specific P&amp;L levers per enterprise, filtered to what OHM controls, sized, and distilled to one line for the owner. Select a company.</p>',
            index_table(companies, lambda c: f'#{c["slug"]}'),
            '<h2>Research notes</h2><ul><li><a href="three_gaps.html">The three gaps between what happens and what gets decided</a> — recording gap, attention gap, decision gap, with numbers and sources.</li></ul>',
            '</section>']
    body += [company_section(c, "#index", False) for c in companies]
    body.append('<p class="foot">Generated from <code>ohm_spal/companies/*.md</code> by <code>ohm_spal/build_html.py</code>.</p></div>')
    inner = "\n".join(body)
    (out / "index.html").write_text(head(TITLE, False) + inner + tail(False), encoding="utf-8"); written.append(out / "index.html")
    if fragment:
        (out / "index.fragment.html").write_text(head(TITLE, True) + inner + tail(True), encoding="utf-8"); written.append(out / "index.fragment.html")

    # research notes: ohm_spal/research/*.md -> standalone pages in the same style
    for md in sorted(Path(__file__).resolve().parent.joinpath("research").glob("*.md")):
        html = wrap_tables(w.render_markdown(md.read_text(encoding="utf-8")))
        title = md.read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
        page = (head(f'{title} — S-PAL', False).replace("<body>", '<body class="standalone">')
                + sitehead(built, "index.html") + '<div class="page">' + html
                + f'<p class="foot">Source file: <code>ohm_spal/research/{md.name}</code></p></div>' + tail(False))
        p = out / f'{md.stem}.html'; p.write_text(page, encoding="utf-8"); written.append(p)

    # standalone page per company
    for c in companies:
        page = (head(f'{c["company"]} — S-PAL', False).replace("<body>", '<body class="standalone">')
                + sitehead(built, "index.html") + '<div class="page">' + company_section(c, "index.html", True) + "</div>" + tail(False))
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
