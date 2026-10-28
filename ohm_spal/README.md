# S-PAL Wiki

Company-by-company S-PAL analyses for OHM value selling. S-PAL = the specific
business drivers (P&L levers) of an enterprise, filtered to what OHM can
control, with the value sized.

## Structure

```
ohm_spal/
├── README.md            ← this file
├── _template.md         ← copy to start a new company
└── companies/
    └── <slug>.md        ← one page per company
```

Each company page has:

1. **Front matter** (YAML between `---` lines): company, slug, location, sector,
   revenue base, status, OHM modules, **tagline**, dates.
2. **"Where the tagline comes from"**: every claim in the tagline traced to a
   number and a source, with minimal context. This is what the owner sees first.
3. **Full S-PAL analysis**: steps 1–5 (sector baseline, company overlay,
   fallback assumptions, OHM controllability filter, value sizing) and sources.

## Viewing

The ProMe server (port 8100) serves the wiki:

- `/wiki/spal/` — index of all companies with their taglines
- `/wiki/spal/<slug>` — company page, tagline at the top

Pages are read from this folder on every request, so editing the markdown is
enough; no restart needed.

## Status values

- `In research` — steps 1–3 in progress, no OHM context yet

Research notes that are not company-specific live in `ohm_spal/research/*.md`; the builder renders each as `ohm_spal/html/<name>.html` and links it from the index.
- `Sized` — steps 4–5 done, tagline not yet agreed
- `Tagline agreed` — ready to use with the account
- `In conversation` — pitched, discovery under way
- `Closed won` / `Closed lost`

## Method

1. Sector baseline: structural P&L levers for the sector, by P&L line.
2. Company overlay: public evidence (rating rationales, filings, trade press,
   company site). Tag each lever `[C]` company-evidenced or `[S]` sector-assumed.
3. Fallback: where company evidence is absent, keep the sector lever and list it
   for confirmation in discovery.
4. OHM controllability filter: Controls / Influences / No, with mechanism.
5. Value sizing: low, base, high, with assumptions stated. Bottom line in bps of
   revenue and as a percentage of profit; cash release in rupees; interest saved
   on the cash released.

Then write the tagline, and trace every claim in it back to steps 4–5.

## Local HTML build

```
python3 ohm_spal/build_html.py
```

Writes `ohm_spal/html/index.html` (all companies on one page, tagline first,
full analysis folded below each) and `ohm_spal/html/<slug>.html` (one page per
company). Open `index.html` in any browser; no server needed. Re-run after
editing a company page. `--fragment` also writes `index.fragment.html`, the
same page without the document skeleton, for publishing as an artifact.
