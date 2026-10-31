// The hosted app, end to end: sign-in, Talk with Claude, live updates between
// two parents, attachments, documents, notes, a read-only viewer, downloads.
// Needs PLAYWRIGHT (path to Playwright's index.js) or a local playwright, and
// optionally CHROMIUM and PDFJS_DIR (see tests/browser/README.md).
import { readFileSync, mkdirSync } from "node:fs";
import crypto from "node:crypto";
import http from "node:http";
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
  p.on("console", m => { if (m.type() === "error" && !/favicon|ERR_ABORTED|ERR_INTERNET_DISCONNECTED|status of (400|403|404|415)/.test(m.text())) errors.push(`${username}: ${m.text()}`); });
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



// ── Reminders: a real push, decrypted by the "phone" ──
// A stand-in push service records what the server sends. The test holds the
// phone's keys and decrypts each message with Node's own crypto (RFC 8291),
// independently of the server's Python code.
const received = [];
const pushService = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => { received.push({ headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201); res.end(); });
}).listen(8798, "127.0.0.1");
const phone = crypto.createECDH("prime256v1");
phone.generateKeys();
const phoneAuth = crypto.randomBytes(16);
const b64u = (b) => Buffer.from(b).toString("base64url");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = phone.computeSecret(asPublic);
  const ikm = hmac(hmac(phoneAuth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), phone.getPublicKey(), asPublic, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
}
const waitFor = async (cond, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };

await R.goto(BASE + "/#schedule");
await R.waitForSelector("#messages[data-state=ready]", { state: "attached" });
await R.waitForSelector("#reminderBar .reminder-bar");
check(await R.isVisible("[data-act=rem-on]") && await R.isVisible("#shareRoutineBtn"), "Schedule offers reminders on this phone, and sharing the routine");
check((await raw(R, "POST", "/api/push/subscribe", JSON.stringify({ subscription: { endpoint: "http://127.0.0.1:8798/phone/rohit", keys: { p256dh: b64u(phone.getPublicKey()), auth: b64u(phoneAuth) } }, tz: "Asia/Kolkata" }))).status === 200,
  "a phone signs up for reminders");
const kolkata = (offsetMin) => {
  const d = new Date(Date.now() + offsetMin * 60000);
  const f = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${f.year}-${f.month}-${f.day}`, time: `${f.hour}:${f.minute}` };
};
const due = kolkata(30);
await raw(R, "PUT", "/api/doc?path=schedules/e2e-syrup", JSON.stringify({ data: { what: "Cough syrup 5 ml", details: "after food", category: "medicine", repeat: "daily", date: due.date, times: [due.time], lead: 30, every: 1, weekdays: [], for: "", paused: false, done: {} } }));
await raw(R, "PUT", "/api/doc?path=schedules/e2e-done", JSON.stringify({ data: { what: "Already given", repeat: "daily", date: due.date, times: [due.time], lead: 30, done: { [`${due.date} ${due.time}`]: { status: "done" } } } }));
check(await waitFor(() => received.length >= 1), "the server sends the reminder 30 minutes ahead");
const pushed = received.map(r => decrypt(r.body));
check(pushed.length === 1 && pushed[0].title === "Cough syrup 5 ml" && /^In (29|30) minutes, at .* · after food$/.test(pushed[0].body), `the phone decrypts it: "${pushed[0]?.title}: ${pushed[0]?.body}"`);
check(received[0].headers["content-encoding"] === "aes128gcm" && /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(received[0].headers.authorization || "") && received[0].headers.urgency === "high",
  "it's encrypted and signed the standard way");
await new Promise(r => setTimeout(r, 2500));
check(received.length === 1, "it's sent once, and nothing is sent for an occurrence already marked done");
const testSend = JSON.parse((await raw(R, "POST", "/api/push/test", "{}")).body);
check(testSend.sent === 1 && await waitFor(() => received.length === 2) && decrypt(received[1].body).title === "Reminders are on", "Send a test reaches the phone");

// The app's offline helper shows it as a notification with Done and Snooze.
await rCtx.grantPermissions(["notifications"], { origin: BASE });
const swCdp = await rCtx.newCDPSession(R);
const regs = [];
swCdp.on("ServiceWorker.workerRegistrationUpdated", e => regs.push(...e.registrations));
await swCdp.send("ServiceWorker.enable");
await R.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await waitFor(() => regs.some(r => !r.isDeleted), 5000);
const reg = regs.find(r => !r.isDeleted);
if (reg) {
  await swCdp.send("ServiceWorker.deliverPushMessage", { origin: BASE, registrationId: reg.registrationId, data: JSON.stringify(pushed[0]) });
  let shown = [];
  for (let i = 0; i < 25 && !shown.length; i++) {
    await new Promise(r => setTimeout(r, 200));
    shown = await R.evaluate(() => navigator.serviceWorker.ready.then(r => r.getNotifications()).then(ns => ns.map(n => ({ title: n.title, body: n.body, tag: n.tag, actions: n.actions.map(a => a.title), sticky: n.requireInteraction }))));
  }
  check(shown.length === 1 && shown[0].title === "Cough syrup 5 ml" && shown[0].actions.join() === "Done,Snooze 10 min" && shown[0].sticky, `the phone shows it with Done and Snooze 10 min (${JSON.stringify(shown[0] || {})})`);
} else {
  check(false, "the offline helper is registered for notifications");
}
check((await raw(R, "POST", "/api/schedule/mark", JSON.stringify({ id: "e2e-syrup", key: `${due.date} ${due.time}`, status: "done" }))).status === 200, "Done on a notification marks that time done");
await R.waitForSelector("#schedToday .occ.is-done:has-text('Cough syrup 5 ml')");
check(true, "and the Schedule shows it, without reloading");
check((await raw(R, "POST", "/api/schedule/snooze", JSON.stringify({ id: "e2e-syrup", key: `${due.date} ${due.time}`, minutes: 10, endpoint: "http://127.0.0.1:8798/phone/rohit" }))).status === 200, "Snooze 10 min is accepted for this phone");
pushService.close();

// ── Sharing the routine ──
await R.click("#shareRoutineBtn");
await R.waitForSelector(".share-box");
await R.selectOption("#shareDays", "7");
await R.click("[data-act=share-create]");
await R.waitForSelector("#shareUrl");
const routineUrl = await R.inputValue("#shareUrl");
await R.screenshot({ path: `${SHOTS}/e2e-06-share-routine.png` });
const stranger = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
const rr = await stranger.goto(routineUrl);
check(rr.status() === 200 && rr.headers()["x-robots-tag"]?.includes("noindex"), "the routine link opens without an account, and isn't indexed");
check(await stranger.isVisible("h1:has-text('routine')") && await stranger.isVisible(".what:has-text('Cough syrup 5 ml')") && await stranger.isVisible("button:has-text('Save as PDF')"),
  "it shows her routine, with Save as PDF");
check(await stranger.isVisible("text=This link works until"), "and says when the link stops working");
await stranger.screenshot({ path: `${SHOTS}/e2e-07-routine-page.png`, fullPage: true });
await stranger.emulateMedia({ media: "print" });
check(!(await stranger.isVisible("button:has-text('Save as PDF')")), "the PDF leaves the button out");
check((await stranger.request.get(BASE + "/api/doc?path=entries/x")).status() === 401, "a link opens nothing else in the diary");

// ── Sharing a document ──
await R.click(".sections a[data-view=docs]");
await R.waitForSelector(".doc-row, [data-act=doc-back]");
if (await R.isVisible("[data-act=doc-back]")) await R.click("[data-act=doc-back]");     // still open from earlier
await R.click(".doc-row:has-text('Discharge summary')");
await R.click("[data-act=doc-share]");
await R.waitForSelector("#docShareSlot .share-box");
await R.click("#docShareSlot [data-act=share-create]");
await R.waitForSelector("#docShareSlot #shareUrl");
const docUrl = await R.inputValue("#shareUrl");
await stranger.emulateMedia({ media: "screen" });
await stranger.goto(docUrl);
check(await stranger.isVisible("h1:has-text('Discharge summary')") && await stranger.isVisible(".brief"), "a document link shows its title and brief");
const fileRes = await stranger.request.get(docUrl + "/file");
check(fileRes.status() === 200 && fileRes.headers()["content-type"] === "application/pdf", "and opens the file");
const dlRes = await stranger.request.get(docUrl + "/file?download=1");
check(/attachment/.test(dlRes.headers()["content-disposition"] || ""), "or downloads it");
await stranger.screenshot({ path: `${SHOTS}/e2e-08-document-page.png` });

// Turning links off in About Divisha
await R.click("#settingsBtn");
await R.waitForSelector("#sharedList .link-row");
check(await R.locator("#sharedList .link-row").count() === 2, "About Divisha lists both shared links");
await R.click("#sharedList .link-row:has-text('routine') [data-act=share-revoke]");
await R.waitForFunction(() => document.querySelectorAll("#sharedList .link-row").length === 1);
await R.keyboard.press("Escape");
const gone = await stranger.goto(routineUrl);
check(gone.status() === 404 && await stranger.isVisible("text=isn't available"), "a link that's turned off stops working");
check((await raw(V, "POST", "/api/shares", JSON.stringify({ kind: "routine" }))).status === 403, "a viewer can't make share links");

// "Send the file" hands the real file to the phone's share sheet.
const sCtx = await context();
await sCtx.addInitScript(() => {
  window.__shared = null;
  navigator.canShare = (d) => !!d?.files?.length;
  navigator.share = async (d) => { window.__shared = { title: d.title, text: d.text, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }; };
});
const SP = await signIn(sCtx, "rohit", "test-password-rohit");
await SP.click(".sections a[data-view=docs]");
await SP.click(".doc-row:has-text('Discharge summary')");
await SP.waitForTimeout(800);
await SP.click("[data-act=doc-share]");
await SP.click("[data-act=share-file]");
await SP.waitForFunction(() => !!window.__shared);
const sharedFile = await SP.evaluate(() => window.__shared);
check(sharedFile.files.length === 1 && sharedFile.files[0].name === "discharge.pdf" && sharedFile.files[0].type === "application/pdf" && sharedFile.files[0].size > 1000,
  `"Send the file" shares the PDF itself (${sharedFile.files[0]?.name}, ${sharedFile.files[0]?.size} bytes)`);

// ── Installable as an Android app ──
const man = await anon.request.get(BASE + "/manifest.webmanifest");
const manifest = await man.json();
check(man.status() === 200 && manifest.name === "Divisha Wellness" && manifest.display === "standalone", "the app manifest is served, signed in or not");
check(manifest.icons.some(i => i.purpose === "maskable") && manifest.icons.some(i => i.sizes === "512x512"), "with a 512 px icon and an Android maskable icon");
for (const icon of manifest.icons) check((await anon.request.get(BASE + icon.src)).status() === 200, `icon ${icon.src} loads`);
const iCtx = await context({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" });
const I = await signIn(iCtx, "ananya", "test-password-ananya");
await I.evaluate(() => navigator.serviceWorker.ready.then(() => true));
check(true, "the offline helper registers");
const cdp = await iCtx.newCDPSession(I);
const appManifest = await cdp.send("Page.getAppManifest");
check(!appManifest.errors?.length, `Chrome reads the manifest without errors${appManifest.errors?.length ? ": " + JSON.stringify(appManifest.errors) : ""}`);
const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
const blocking = installabilityErrors.filter(e => e.errorId !== "in-incognito");
check(!blocking.length, `Chrome says it can be installed${blocking.length ? ": " + blocking.map(e => e.errorId).join(", ") : ""}`);
await I.reload();
await I.waitForSelector("#messages[data-state=ready]");
await I.waitForFunction(() => !!navigator.serviceWorker.controller);
await iCtx.setOffline(true);
await I.reload();
await I.waitForSelector(".brand h1");
check((await I.textContent(".brand h1")).includes("Wellness") && await I.isVisible("#offline"), "with no connection, the installed app still opens and says it's offline");
await I.screenshot({ path: `${SHOTS}/e2e-05-android-offline.png` });
await iCtx.setOffline(false);
const out = await anon.request.get(BASE + "/logout", { maxRedirects: 0 });
check(/"cache"/.test(out.headers()["clear-site-data"] || ""), "Sign out also clears the app's saved copy on that device");

// ── Signing out ──
await R.goto(BASE + "/logout");
check(R.url().endsWith("/login"), "Sign out goes back to the sign-in page");
const after = await R.request.get(BASE + "/api/me");
check(after.status() === 401, "and the old session no longer works");

console.log(errors.length ? `PAGE ERRORS:\n${errors.join("\n")}` : "No page errors");
console.log(failed ? `${failed} FAILED` : "All passed");
await browser.close();
