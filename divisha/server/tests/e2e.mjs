// The hosted app, end to end: sign-in, Talk with Claude, live updates between
// two parents, attachments, documents, notes, a read-only viewer, downloads.
// Needs PLAYWRIGHT (path to Playwright's index.js) or a local playwright, and
// optionally CHROMIUM and PDFJS_DIR (see tests/browser/README.md).
import { readFileSync, mkdirSync } from "node:fs";
const pw = await import(process.env.PLAYWRIGHT || "playwright"); const { chromium } = pw.default || pw;
const BASE = process.env.BASE;
const SHOTS = process.env.SHOTS || "shots";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) { failed += 1; process.exitCode = 1; } };
const mock = () => readFileSync(process.env.MOCK_LOG, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));

// Test files: a picture and a two-page PDF, made by the browser itself.
const painter = await (await browser.newContext()).newPage();
const PNG = Buffer.from((await painter.evaluate(() => {
  const c = Object.assign(document.createElement("canvas"), { width: 600, height: 400 });
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 400); g.fillStyle = "#222"; g.font = "28px sans-serif"; g.fillText("Rx: cough syrup 5 ml at night", 30, 80);
  return c.toDataURL("image/png").split(",")[1];
})), "base64");
await painter.setContent(`<h1>Discharge summary</h1><p>Chest infection.</p><div style="page-break-before:always"><h1>Page 2</h1></div>`);
const PDF = await painter.pdf({ format: "A5" });

async function context(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, ...opts });
  if (process.env.PDFJS_DIR) {
    await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**", r => r.fulfill({ path: `${process.env.PDFJS_DIR}/${r.request().url().split("/").pop()}`, contentType: "text/javascript" }));
  }
  return ctx;
}
async function signIn(ctx, username, password) {
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${username}: ${e}`));
  p.on("console", m => { if (m.type() === "error" && !/favicon|ERR_ABORTED|status of (400|403|404|415)/.test(m.text())) errors.push(`${username}: ${m.text()}`); });
  await p.goto(BASE + "/");
  await p.fill("#username", username);
  await p.fill("#password", password);
  await p.click("#signIn");
  await p.waitForSelector("#messages[data-state=ready]");
  return p;
}
const raw = (p, method, url, body, headers = { "X-Divisha": "1", "Content-Type": "application/json" }) =>
  p.evaluate(async ([method, url, body, headers]) => { const r = await fetch(url, { method, headers, body }); return { status: r.status, body: await r.text() }; }, [method, url, body, headers]);

// ── Signing in ──
const anon = await (await context()).newPage();
await anon.goto(BASE + "/");
check(anon.url().endsWith("/login"), "a signed-out visit goes to the sign-in page");
await anon.fill("#username", "rohit"); await anon.fill("#password", "wrong-password"); await anon.click("#signIn");
await anon.waitForSelector(".error:not([hidden])");
check(/don't match/.test(await anon.textContent(".error")), "a wrong password says so");
for (const url of ["/api/me", "/screens.js", "/_blob/" + "a".repeat(32)]) {
  const r = await anon.request.get(BASE + url);
  check(r.status() === 401, `signed out: ${url} is refused (${r.status()})`);
}
await anon.screenshot({ path: `${SHOTS}/e2e-01-login.png` });

const rCtx = await context();
const R = await signIn(rCtx, "rohit", "test-password-rohit");
check(await R.isVisible(".sections a[data-view=talk][aria-current=page]"), "Rohit signs in and lands on Talk");
const cookie = (await rCtx.cookies()).find(c => c.name === "dw_session");
check(cookie?.httpOnly && cookie?.sameSite === "Lax", "the sign-in cookie is HTTP-only and same-site");
check((await raw(R, "PUT", "/api/doc?path=entries/x", JSON.stringify({ data: {} }), { "Content-Type": "application/json" })).status === 400, "a change without the app's header is refused");

// ── About Divisha, then Talk with Claude ──
await R.click("#settingsBtn");
await R.fill("#sDob", "2024-06-15");
await R.fill("#sDoctor", "Dr Mehta");
check(await R.isVisible("#signOut"), "About Divisha has Sign out on the hosted copy");
await R.click("#settingsSave");
await R.waitForSelector("#ageLine:has-text('2 years')");
check(true, "About Divisha saves on the server");

const aCtx = await context({ viewport: { width: 760, height: 860 } });
const A = await signIn(aCtx, "ananya", "test-password-ananya");
await A.click(".sections a[data-view=look]");
await A.waitForSelector(".tiles .tile");

await R.fill("#composerText", "Fever 38.4 since evening, gave 5 ml crocin");
await R.keyboard.press("Enter");
await R.waitForSelector(".note-card .note-row");
check(await R.locator(".note-card .note-row").count() === 2, "Claude's reply streams in with a card of 2 entries");
const first = mock().at(-1);
check(first.body.model === "claude-opus-5-5", `the server asks Claude Opus 5.5 (${first.body.model})`);
check(first.body.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(first.beta || ""), "refusal fallback is on");
check(first.body.output_config?.effort === "low", "chat replies use low effort");
check(first.key === "test-key" || first.auth === "Bearer test-key", "the server's own API key is used, and nothing else");
check(/Divisha Wellness/.test(first.body.messages[0].content), "Claude gets the app's instructions and packet");
await R.click("[data-act=save-all]");
await R.waitForSelector(".saved-head");
const stored = JSON.parse((await raw(R, "POST", "/api/query", JSON.stringify({ collection: "entries" }))).body).docs;
check(stored.length === 2 && stored.every(d => d.data.by?.startsWith("u_")), "entries are saved on the server, with who added them");
await R.screenshot({ path: `${SHOTS}/e2e-02-talk.png` });

await A.waitForFunction(() => document.querySelectorAll(".entry").length === 2, null, { timeout: 15000 });
check(true, "Ananya sees Rohit's entries appear live, without reloading");
check(await A.isVisible(".entry .by:has-text('Rohit')"), "with Rohit's name on them");

// ── Attachments and documents ──
await R.setInputFiles("#attachInput", [{ name: "rx.png", mimeType: "image/png", buffer: PNG }, { name: "discharge.pdf", mimeType: "application/pdf", buffer: PDF }]);
await R.fill("#composerText", "Papers from today");
await R.keyboard.press("Enter");
await R.waitForSelector(".note-card .doc-offer", { timeout: 60000 });
const withPics = mock().at(-1);
const pics = withPics.body.messages.at(-1).content.filter(b => b.type === "image");
check(pics.length === 3 && pics.every(b => b.source.media_type === "image/jpeg"), `Claude is sent 3 pictures: the photo and both PDF pages (${pics.length})`);
await R.click("[data-act=save-all]");
await R.waitForSelector(".saved-list .tag.document");
await R.click(".sections a[data-view=docs]");
await R.waitForSelector(".doc-row");
check(await R.locator(".doc-row").count() === 2, "both files are kept in Documents");
await R.click(".doc-row:has-text('Discharge summary')");
await R.waitForFunction(() => document.querySelectorAll("#docFilePdf canvas").length === 2, null, { timeout: 30000 });
check(true, "a kept PDF opens page by page from the server");
await R.screenshot({ path: `${SHOTS}/e2e-03-document.png` });
const [dl] = await Promise.all([R.waitForEvent("download"), R.click("[data-act=doc-download]")]);
check(dl.suggestedFilename() === "discharge.pdf", `Download saves the file (${dl.suggestedFilename()})`);
const fake = await raw(R, "POST", "/api/files", "not really a png", { "X-Divisha": "1", "Content-Type": "image/png" });
check(fake.status === 415, "a file that isn't really a photo or PDF is refused");

// ── Time-based analysis notes ──
await R.click(".sections a[data-view=look]");
await R.waitForSelector("[data-act=notes-write]");
await R.click("[data-act=notes-write]");
await R.waitForSelector(".note-sec");
const notesReq = mock().at(-1);
check(notesReq.body.output_config?.effort === "medium" && !!notesReq.body.system, "notes ask Claude for JSON at medium effort");
check(await R.locator(".note-sec .see").count() >= 1, "Claude's notes show, with links to their entries");
await R.screenshot({ path: `${SHOTS}/e2e-04-notes.png`, fullPage: true });

// ── Keep a copy ──
await R.click("#settingsBtn");
const [copy1] = await Promise.all([R.waitForEvent("download"), R.click("#downloadBtn")]);
check(/^divisha-wellness-diary-.*\.md$/.test(copy1.suggestedFilename()), `Download a copy saves the readable diary (${copy1.suggestedFilename()})`);
await R.waitForSelector("#copyStatus:has-text('Saved both files')");
check(true, "and the full backup");
await R.keyboard.press("Escape");

// ── A read-only viewer ──
const V = await signIn(await context(), "nani", "test-password-nani");
check(!(await V.isVisible("#composer")) && await V.isVisible(".past-note:has-text('read')"), "the viewer can read but has no typing box");
check((await raw(V, "PUT", "/api/doc?path=entries/hack", JSON.stringify({ data: { what: "x" } }))).status === 403, "the server refuses the viewer's changes");
check((await raw(V, "POST", "/api/claude", JSON.stringify({ turns: [{ role: "user", content: "hi" }] }))).status === 403, "and won't call Claude for the viewer");
await V.click(".sections a[data-view=docs]");
await V.waitForSelector(".doc-row");
check(!(await V.isVisible("#addDocBtn")), "the viewer can see documents but not add them");

// ── Signing out ──
await R.goto(BASE + "/logout");
check(R.url().endsWith("/login"), "Sign out goes back to the sign-in page");
const after = await R.request.get(BASE + "/api/me");
check(after.status() === 401, "and the old session no longer works");

console.log(errors.length ? `PAGE ERRORS:\n${errors.join("\n")}` : "No page errors");
console.log(failed ? `${failed} FAILED` : "All passed");
await browser.close();
