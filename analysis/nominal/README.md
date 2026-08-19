# Nominal.so website analysis

Tooling to crawl and analyze **nominal.so** page-by-page with a real Chromium
browser, then produce a structure / flow / knowledge report.

## Status

**Blocked on network egress.** As of the first run, this environment's egress
policy denies `nominal.so` (proxy returns `403` on CONNECT; WebFetch returns
`EGRESS_BLOCKED`). No browser here can load the site until the domain is
allowed.

### To unblock

Add these to the environment's allowed egress domains, then re-run:

- `nominal.so`
- `www.nominal.so`
- (optional, rendered screenshots only) `fonts.googleapis.com`,
  `fonts.gstatic.com`, `*.website-files.com`

## Run

```bash
bash analysis/nominal/run.sh
```

Overrides: `START_URL`, `MAX_PAGES` (default 120), `NAV_TIMEOUT_MS`.

## Output (`analysis/nominal/out/`)

- `pages.json` — structured record per page (title, meta, H1/H2/H3 outline,
  nav/footer/CTA links, visible text, internal links, status)
- `sitemap.txt` — every internal URL discovered
- `report.md` — human-readable per-page summary
- `shots/<slug>.png` — full-page screenshot per page

`out/` and `node_modules/` are git-ignored.
