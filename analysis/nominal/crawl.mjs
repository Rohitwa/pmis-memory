/**
 * Nominal (nominal.so) page-by-page crawler.
 *
 * Drives real Chromium (Playwright) through the session egress proxy, does a
 * same-domain breadth-first crawl starting from the homepage, and for every
 * page captures: final URL, HTTP status, <title>, meta description, the H1/H2/H3
 * outline, nav + CTA links, visible main text, outbound internal links, and a
 * full-page screenshot.
 *
 * Output (written to ./out):
 *   pages.json         - array of page records (structured knowledge)
 *   sitemap.txt        - every internal URL discovered, one per line
 *   report.md          - human-readable structure/flow summary
 *   shots/<slug>.png   - one screenshot per page
 *
 * Run:  bash analysis/nominal/run.sh
 * Env overrides: START_URL, MAX_PAGES, NAV_TIMEOUT_MS
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const START_URL = process.env.START_URL || 'https://nominal.so/';
const ORIGIN_HOSTS = new Set(['nominal.so', 'www.nominal.so']);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '120', 10);
const NAV_TIMEOUT = parseInt(process.env.NAV_TIMEOUT_MS || '45000', 10);
const OUT = new URL('./out/', import.meta.url).pathname;
const SHOTS = OUT + 'shots/';

const EXE_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  process.env.CHROMIUM_PATH,
].filter(Boolean);
const executablePath = EXE_CANDIDATES.find((p) => existsSync(p)) || EXE_CANDIDATES[0];

const slug = (u) => {
  const { pathname } = new URL(u);
  const s = pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return s || 'home';
};
const norm = (u) => {
  try {
    const x = new URL(u, START_URL);
    x.hash = '';
    if (x.pathname !== '/' && x.pathname.endsWith('/')) x.pathname = x.pathname.slice(0, -1);
    return x.toString();
  } catch { return null; }
};
const inScope = (u) => {
  try { return ORIGIN_HOSTS.has(new URL(u).hostname); } catch { return false; }
};
const isDoc = (u) => !/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|css|js|ico|woff2?)($|\?)/i.test(u);

async function main() {
  await mkdir(SHOTS, { recursive: true });

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxy ? { proxy: { server: proxy } } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  });
  const page = await ctx.newPage();

  const queue = [norm(START_URL)];
  const seen = new Set(queue);
  const pages = [];

  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift();
    let rec = { url, ok: false };
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT }).catch(async () => {
        return page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      });
      await page.waitForTimeout(1200); // let webflow interactions settle
      const data = await page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.trim() : '');
        const pick = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.innerText.trim()).filter(Boolean);
        const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
          text: a.innerText.trim().replace(/\s+/g, ' ').slice(0, 80),
          href: a.href,
          inNav: !!a.closest('nav,header'),
          inFooter: !!a.closest('footer'),
        }));
        const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content || '';
        return {
          title: document.title,
          description: meta('description') || meta('og:description'),
          ogTitle: meta('og:title'),
          h1: pick('h1'),
          h2: pick('h2'),
          h3: pick('h3'),
          buttons: pick('a[class*="button"],button,.button,[role="button"]').slice(0, 40),
          bodyText: (document.querySelector('main') || document.body).innerText.trim().slice(0, 8000),
          links,
        };
      });
      const shot = SHOTS + slug(url) + '.png';
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      rec = { url, ok: true, status: resp?.status?.() ?? null, screenshot: shot, ...data };

      for (const l of data.links) {
        const n = norm(l.href);
        if (n && inScope(n) && isDoc(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
      console.log(`[${pages.length + 1}] ${rec.status} ${url}  (queue ${queue.length})`);
    } catch (e) {
      rec.error = String(e).split('\n')[0];
      console.log(`[ERR] ${url} :: ${rec.error}`);
    }
    pages.push(rec);
  }

  await browser.close();

  await writeFile(OUT + 'pages.json', JSON.stringify(pages, null, 2));
  await writeFile(OUT + 'sitemap.txt', [...seen].sort().join('\n') + '\n');

  const md = ['# Nominal.so — crawl report', '', `Crawled ${pages.length} pages from ${START_URL}`, ''];
  for (const p of pages) {
    md.push(`## ${p.url}`);
    if (!p.ok) { md.push(`- ERROR: ${p.error}`, ''); continue; }
    md.push(`- status: ${p.status}`);
    md.push(`- title: ${p.title}`);
    if (p.description) md.push(`- description: ${p.description}`);
    if (p.h1?.length) md.push(`- H1: ${p.h1.join(' | ')}`);
    if (p.h2?.length) md.push(`- H2: ${p.h2.slice(0, 12).join(' | ')}`);
    md.push('');
  }
  await writeFile(OUT + 'report.md', md.join('\n'));
  console.log(`\nDone. ${pages.length} pages -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
