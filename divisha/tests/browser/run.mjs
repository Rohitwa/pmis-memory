const pw = await import(process.env.PLAYWRIGHT || "playwright"); const { chromium } = pw.default || pw;
const S = process.argv[2] || ".";
const base = `http://127.0.0.1:${process.env.PORT || 8765}/index.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

const painter = await (await browser.newContext()).newPage();
const PNG = Buffer.from((await painter.evaluate(() => {
  const c = Object.assign(document.createElement("canvas"), { width: 640, height: 820 });
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 640, 820);
  g.fillStyle = "#222"; g.font = "bold 34px sans-serif"; g.fillText("City Child Clinic", 40, 70);
  g.font = "22px sans-serif"; g.fillText("Patient: Divisha   Age: 2y 4m", 40, 120);
  g.fillText("Haemoglobin ........ 10.4 g/dL  (low)", 40, 190);
  g.fillText("WBC ................ 8,200 /uL", 40, 230);
  g.fillText("Platelets .......... 3.1 lakh /uL", 40, 270);
  g.strokeStyle = "#999"; g.strokeRect(30, 150, 580, 150);
  return c.toDataURL("image/png").split(",")[1];
})), "base64");

// A two-page PDF, made by the browser itself.
await painter.setContent(`<style>body{font:16px sans-serif;margin:40px} h1{font-size:26px} .p2{page-break-before:always}</style>
  <h1>Discharge summary</h1><p>Patient: Divisha, 2 years 4 months</p><p>Diagnosis: lower respiratory infection</p><p>Advice: nebuliser at home for 5 days; review with Dr Mehta.</p>
  <div class="p2"><h1>Page 2: medicines</h1><p>Salbutamol nebules as prescribed. Paracetamol only as advised by the doctor.</p></div>`);
const PDF = await painter.pdf({ format: "A5" });

// Stored files: an uploaded one comes back as uploaded; the example PDF is the
// one above; any other example file is the clinic picture.
async function serveBlob(r) {
  const id = r.request().url().split("/").pop();
  if (id === "c".repeat(32)) return r.fulfill({ body: PDF, contentType: "application/pdf" });
  const pg = r.request().frame()?.page();
  const got = pg ? await pg.evaluate(async (id) => {
    const b = window.__assetBlobs?.[id];
    if (!b) return null;
    const u = new Uint8Array(await b.arrayBuffer());
    let s = "";
    for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
    return [btoa(s), b.type];
  }, id).catch(() => null) : null;
  if (got) return r.fulfill({ body: Buffer.from(got[0], "base64"), contentType: got[1] });
  return r.fulfill({ body: PNG, contentType: "image/png" });
}

async function page(opts, url = base, { pdfjs = true } = {}) {
  const ctx = await browser.newContext(opts);
  ctx.setDefaultTimeout(30000);
  await ctx.route("**/_blob/**", serveBlob);
  // PDF.js comes from cdnjs. Set PDFJS_DIR to serve a downloaded copy instead.
  await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**", r => {
    if (!pdfjs) return r.abort();
    if (process.env.PDFJS_DIR) return r.fulfill({ path: `${process.env.PDFJS_DIR}/${r.request().url().split("/").pop()}`, contentType: "text/javascript" });
    return r.continue();
  });
  const p = await ctx.newPage();
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", e => errors.push(String(e)));
  await p.goto(url);
  return p;
}

// ── Desktop, light, empty diary: the real first-use flow ──
const d = await page({ viewport: { width: 1280, height: 820 }, colorScheme: "light" });
await d.waitForSelector("#messages[data-state=ready]");
check(!(await d.isVisible(".welcome")) && await d.isVisible(".ideas .chip.action:has-text('Add her birth date')"), "no welcome card; an idea asks for her birth date");
check(await d.isVisible(".sections a[data-view=talk][aria-current=page]"), "Talk is the default section");
await d.screenshot({ path: `${S}/shots/1-desktop-empty.png` });

await d.click("#settingsBtn");
await d.fill("#sDob", "2024-06-15");
await d.fill("#sDoctor", "Dr Mehta");
await d.fill("#sPhone", "98200 12345");
await d.click("#addScheduleBtn");
await d.fill("#sc-0-what", "Vitamin D");
await d.fill("#sc-0-time", "09:00");
await d.screenshot({ path: `${S}/shots/2-settings.png` });
await d.click("#settingsSave");
await d.waitForSelector("#ageLine:has-text('2 years')");
check(true, "settings saved and age shows in the top bar");

await d.fill("#composerText", "Fever 39.4 since evening, gave 5 ml crocin and kadha before bed");
await d.keyboard.press("Enter");
await d.waitForSelector(".note-card .note-row");
const rows = await d.locator(".note-card .note-row").count();
check(rows === 4, `card offers 4 entries (got ${rows})`);
check(await d.isVisible(".warning:has-text('Please call Dr Mehta now')"), "warning shows for 39.4 at 2 years");
check(await d.isVisible(".warning .phone:has-text('98200 12345')"), "warning shows the doctor's number");
check(!(await d.locator(".msg.assistant .text").first().innerText()).includes("```"), "JSON block is hidden from the reply");
const turns = await d.evaluate(() => window.__lastTurns);
check(turns[0].role === "user" && turns.at(-1).role === "user", "conversation sent to Claude starts and ends on the parent");
check(/Age: 2 years 4 months old|Age: 2 years/.test(turns[0].content), "Claude was told her age");
await d.screenshot({ path: `${S}/shots/3-desktop-card.png` });

// Fix one thing, drop one, then save
await d.fill(".note-row >> nth=1 >> input[data-f=details]", "crocin, given at 9 pm");
await d.click(".note-row >> nth=2 >> button.remove");
check(await d.locator(".note-card .note-row").count() === 3, "removing a row leaves 3");
await d.click("[data-act=save-all]");
await d.waitForSelector(".saved-head");
const saved = await d.evaluate(() => [...window.__store.keys()].filter(k => k.startsWith("entries/")).map(k => window.__store.get(k)));
check(saved.length === 3, `3 entries saved (got ${saved.length})`);
check(saved.some(e => e.details === "crocin, given at 9 pm"), "the edit made on the card was saved");
check(saved.every(e => e.by === "u_me" && e.fromMessage), "entries record who added them and which chat");
check(await d.isVisible(".chat-items >> text=Fever 39.4 since evening"), "today's chat appears in Past chats");
await d.screenshot({ path: `${S}/shots/4-desktop-saved.png` });

// Look back: edit and remove
await d.click(".sections a[data-view=look]");
await d.waitForSelector(".entry");
check(await d.locator(".entry").count() === 3, "Look back lists the 3 entries");
await d.click(".entry >> nth=0 >> [data-act=edit]");
await d.fill("#eDetails", "edited in Look back");
await d.click("[data-act=edit-save]");
await d.waitForSelector(".entry .details:has-text('edited in Look back')");
check(true, "an entry can be edited");
await d.click(".entry >> nth=0 >> [data-act=del]");
await d.click("[data-act=del-yes]");
await d.waitForFunction(() => document.querySelectorAll(".entry").length === 2);
check(true, "an entry can be removed after confirming");
await d.click("#addEntryBtn");
await d.selectOption("#eType", "growth");
await d.fill("#eWhat", "Height 89 cm");
await d.click("[data-act=edit-save]");
await d.waitForSelector(".entry .what:has-text('Height 89 cm')");
check(true, "an entry can be added by hand");
await d.screenshot({ path: `${S}/shots/5-desktop-lookback.png` });

// Stop mid-answer keeps the words written so far
await d.click(".sections a[data-view=talk]");
await d.fill("#composerText", "She was fine all day");
await d.keyboard.press("Enter");
await d.waitForSelector("#stopBtn:not([hidden])");
await d.click("#stopBtn");
await d.waitForSelector("#sendBtn:not([hidden])");
check(true, "Stop ends the answer and brings the Send button back");

// ── Phone, dark, with example data ──
const p = await page({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true }, base + "?seed=1");
await p.waitForSelector("#messages[data-state=ready]");
await p.screenshot({ path: `${S}/shots/6-phone-dark-talk.png` });
const wide = await p.evaluate(() => document.documentElement.scrollWidth);
check(wide <= 390, `no sideways scroll on a phone (width ${wide})`);
await p.click("#chatsBtn");
await p.waitForSelector(".side.open");
await p.screenshot({ path: `${S}/shots/7-phone-drawer.png` });
await p.click(".chat-items li >> nth=1 >> button");
await p.waitForSelector(".msg.user");
check(await p.isVisible(".past-note"), "a past day shows 'Back to today' instead of the typing box");
await p.screenshot({ path: `${S}/shots/8-phone-past-chat.png` });
await p.goto(base + "?seed=1#look-back");
await p.waitForSelector(".entry");
await p.screenshot({ path: `${S}/shots/9-phone-dark-lookback.png`, fullPage: true });
check(await p.isVisible(".entry .by:has-text('Ananya')"), "entries show the other parent's first name");

// ── Phone, light, Claude unavailable ──
const n = await page({ viewport: { width: 390, height: 844 }, colorScheme: "light" }, base + "?nosample=1");
await n.waitForSelector("#messages[data-state=ready]");
check(await n.isVisible("text=Claude can't answer on this view"), "says plainly when Claude isn't available");
check(await n.isDisabled("#sendBtn"), "Send is off when Claude isn't available");
await n.screenshot({ path: `${S}/shots/10-phone-light-nosample.png` });


// ── Look back with two months of example data (desktop, light) ──
const L = await page({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, base + "?seed=1#analysis");
await L.waitForSelector(".tiles .tile");
const monthName = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
check((await L.textContent("#spanTitle")) === monthName, `opens on this month (${monthName})`);
check(await L.locator(".tiles .tile").count() === 4, "four numbers: well, off or sick, spells, doctor");
const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
check(await L.locator(".cal .day").count() === daysInMonth, `one square per day of the month (${daysInMonth})`);
check(await L.locator(".cal .day.is-today").count() === 1, "today is marked on the calendar");
check(await L.isDisabled("#spanNext"), "can't step into the future");
const counted = await L.evaluate(() => {
  const tiles = [...document.querySelectorAll(".tile b")].map(b => Number(b.textContent));
  const cells = [...document.querySelectorAll(".cal .day")];
  const n = (c) => cells.filter(x => x.classList.contains(c)).length;
  return { tiles, well: n("lv-well"), unwell: n("lv-off") + n("lv-sick") };
});
check(counted.tiles[0] === counted.well && counted.tiles[1] === counted.unwell, `tiles match the calendar (${counted.well} well, ${counted.unwell} off or sick)`);
check(await L.locator(".common-row").count() > 0, "most common symptoms and care are listed");
check(await L.isVisible("text=Write Claude's notes"), "notes wait for a tap");
check(!(await L.evaluate(() => window.__notesCalls)), "Claude is not asked until you tap");
await L.screenshot({ path: `${S}/shots/12-lookback-before-notes.png`, fullPage: true });

await L.click("[data-act=notes-write]");
await L.waitForSelector(".note-sec");
check(await L.isVisible(".note-sec h3:has-text('How she is now')"), "notes show 'How she is now'");
check(await L.isVisible(".note-sec h3:has-text(\"What's working\")"), "notes show 'What's working'");
check(!(await L.isVisible("text=A point with nothing behind it")), "a point with no real entries is dropped");
const prompt = await L.evaluate(() => window.__notesPrompt);
check(/warm, plain and specific/.test(prompt) && /counted by the app/.test(prompt), "Claude is asked for warm, plain notes using the app's numbers");
const savedNotes = await L.evaluate(() => [...window.__store.keys()].find(k => k.startsWith("notes/month-")));
check(!!savedNotes, `notes are saved (${savedNotes})`);
await L.screenshot({ path: `${S}/shots/13-lookback-notes.png`, fullPage: true });

const seeBtn = L.locator(".note-sec.working .see").first();
const seeN = Number((await seeBtn.textContent()).replace(/\D/g, ""));
await seeBtn.click();
await L.waitForSelector(".focus-bar");
check(await L.locator("#entryList .entry").count() === seeN, `'see ${seeN}' opens exactly ${seeN} entries`);
await L.screenshot({ path: `${S}/shots/14-lookback-see.png` });
await L.click("[data-act=unfocus]");
check(!(await L.isVisible(".focus-bar")), "'Show all' goes back to every entry");

await L.click(".cal .day.lv-sick >> nth=0");
await L.waitForSelector(".focus-bar:has-text('on ')");
check(await L.locator("#entryList .entry").count() > 0, "tapping a day shows that day's entries");

await L.click("[data-act=unfocus]");
await L.click("#addEntryBtn");
await L.selectOption("#eType", "growth");
await L.fill("#eWhat", "Weight 12.5 kg");
await L.click("[data-act=edit-save]");
await L.waitForSelector(".notes-foot:has-text('1 new or changed entry since')");
check(true, "notes say when entries changed after they were written");

await L.click("[data-act=span-kind][data-kind=year]");
await L.waitForSelector(".year-grid");
check(await L.locator(".year-row").count() === 12, "Year shows twelve rows");
check((await L.textContent("#spanTitle")) === String(new Date().getFullYear()), "Year is this year");
await L.screenshot({ path: `${S}/shots/15-lookback-year.png`, fullPage: true });
await L.click("[data-act=span-kind][data-kind=week]");
check((await L.textContent("#spanTitle")) === "This week", "Week opens on this week");
await L.click("#spanPrev");
check((await L.textContent("#spanTitle")) === "Last week", "the arrow steps back to last week");
check(!(await L.isDisabled("#spanNext")), "and forward again is allowed");

// ── Look back on a phone, dark ──
const LP = await page({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true }, base + "?seed=1#look-back");
await LP.waitForSelector(".tiles .tile");
await LP.click("[data-act=notes-write]");
await LP.waitForSelector(".note-sec");
const phoneWidth = await LP.evaluate(() => document.documentElement.scrollWidth);
check(phoneWidth <= 390, `Look back has no sideways scroll on a phone (width ${phoneWidth})`);
await LP.screenshot({ path: `${S}/shots/16-phone-lookback.png`, fullPage: true });

// ── Keep a copy ──
const K = await page({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, base + "?seed=1");
await K.waitForSelector("#messages[data-state=ready]");
await K.click("#settingsBtn");
check(await K.isVisible("#downloadBtn"), "About Divisha offers 'Download a copy'");
await K.click("#downloadBtn");
await K.waitForSelector("#copyStatus:has-text('Saved both files')");
const files = await K.evaluate(() => window.__saved);
check(files.length === 2, "two files are saved");
check(/^divisha-wellness-diary-\d{4}-\d{2}-\d{2}\.md$/.test(files[0].filename), `readable diary is named ${files[0].filename}`);
check(/^divisha-wellness-backup-\d{4}-\d{2}-\d{2}\.json$/.test(files[1].filename), `backup is named ${files[1].filename}`);
check(/Cough at night, dry, woke twice \(added by Ananya\)/.test(files[0].data), "the readable diary has entries with who added them");
check(/added by Rohit/.test(files[0].data) && !/added by you/.test(files[0].data), "it names each parent, never 'you'");
const backup = JSON.parse(files[1].data);
const storeCounts = await K.evaluate(() => ({ entries: [...window.__store.keys()].filter(k => k.startsWith("entries/")).length, chats: [...window.__store.keys()].filter(k => k.startsWith("chats/")).length }));
check(backup.counts.entries === storeCounts.entries && backup.counts.chatDays === storeCounts.chats, `the backup holds every entry (${backup.counts.entries}) and chat day (${backup.counts.chatDays})`);
await K.screenshot({ path: `${S}/shots/17-keep-copy.png` });

const KD = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&decline=1");
await KD.waitForSelector("#messages[data-state=ready]");
await KD.click("#settingsBtn");
await KD.click("#downloadBtn");
await KD.waitForSelector("#copyStatus:has-text('Nothing was saved')");
check(true, "saying no to both saves is reported plainly");
const KN = await page({ viewport: { width: 1280, height: 900 } }, base + "?nodownloads=1");
await KN.waitForSelector("#messages[data-state=ready]");
await KN.click("#settingsBtn");
check(!(await KN.isVisible("#downloadBtn")), "no download button where downloads don't work");

// ── Someone who can view but not edit ──
const R = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&readonly=1");
await R.waitForSelector(".past-note:has-text('You can read')");
check(!(await R.isVisible("#composer")), "view-only: no typing box");
check(!(await R.isVisible(".ideas .chip")), "view-only: no ideas to act on");
await R.goto(base + "?seed=1&readonly=1#look-back");
await R.waitForSelector(".tiles .tile");
check(!(await R.isVisible("#addEntryBtn")), "view-only: no 'Add an entry'");
check(await R.locator("[data-act=edit], [data-act=del]").count() === 0, "view-only: no Edit or Remove");
check(!(await R.isVisible("[data-act=notes-write]")) && await R.isVisible("text=You can read notes here"), "view-only: can't ask for new notes, and says why");
await R.click("#settingsBtn");
check(await R.isDisabled("#settingsSave") && await R.isDisabled("#sDob"), "view-only: About Divisha can be read but not changed");
check(await R.isVisible("#downloadBtn"), "view-only: can still download a copy");

// ── Offline ──
const offCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const O = await offCtx.newPage();
O.on("pageerror", e => errors.push(String(e)));
await O.goto(base + "?seed=1");
await O.waitForSelector("#messages[data-state=ready]");
await offCtx.setOffline(true);
await O.waitForSelector("#offline:not([hidden])");
await O.fill("#composerText", "She was fine");
check(await O.isDisabled("#sendBtn"), "offline: Send is off and a notice says why");
await O.screenshot({ path: `${S}/shots/18-offline.png` });
await offCtx.setOffline(false);
await O.waitForSelector("#offline", { state: "hidden" });
check(!(await O.isDisabled("#sendBtn")), "back online: Send works again");

// ── Keyboard only ──
const KB = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1");
await KB.waitForSelector("#messages[data-state=ready]");
await KB.focus(".sections a[data-view=look]");
await KB.keyboard.press("Enter");
await KB.waitForSelector(".tiles .tile");
check(true, "keyboard: Enter on a section opens it");
await KB.focus(".cal .day.lv-sick");
await KB.keyboard.press("Enter");
await KB.waitForSelector(".focus-bar");
check(true, "keyboard: a calendar day opens its entries");
await KB.focus("#settingsBtn");
await KB.keyboard.press("Enter");
await KB.waitForSelector("#settings[open]");
await KB.keyboard.press("Escape");
await KB.waitForSelector("#settings:not([open])", { state: "attached" });
check(!(await KB.evaluate(() => document.getElementById("settings").open)), "keyboard: Escape closes About Divisha");
const ring = await KB.evaluate(() => { const b = document.getElementById("spanPrev"); b.focus(); return getComputedStyle(b, ":focus-visible").outlineStyle; });
check(ring !== "none", "keyboard: focused buttons show a ring");

// ── The narrowest phones ──
const N = await page({ viewport: { width: 320, height: 640 }, colorScheme: "light", isMobile: true, hasTouch: true }, base + "?seed=1");
await N.waitForSelector("#messages[data-state=ready]");
const talkW = await N.evaluate(() => document.documentElement.scrollWidth);
await N.screenshot({ path: `${S}/shots/19-320-talk.png` });
await N.goto(base + "?seed=1#look-back");
await N.waitForSelector(".tiles .tile");
const lookW = await N.evaluate(() => document.documentElement.scrollWidth);
await N.screenshot({ path: `${S}/shots/20-320-lookback.png`, fullPage: true });
check(talkW <= 320 && lookW <= 320, `320 px phone: no sideways scroll (Talk ${talkW}, Look back ${lookW})`);

// ── Left pane ──
const NAV = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1");
await NAV.waitForSelector("#messages[data-state=ready]");
const order = await NAV.$$eval(".side .sections a, .side .pane-title", els => els.map(e => e.textContent.replace(/\d+$/, "").trim()));
check(order.join(" | ") === "Talk | Documents | Time-based analysis | Past chats", `left pane, top to bottom: ${order.join(" | ")}`);
await NAV.goto(base + "?seed=1#look-back");
await NAV.waitForSelector(".tiles .tile");
check(await NAV.isVisible(".sections a[data-view=look][aria-current=page]"), "old #look-back links still open Time-based analysis");

// ── Her schedule, from Talk ──
const SC = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1");
await SC.waitForSelector("#messages[data-state=ready]");
check(await SC.isVisible(".ideas .chip.schedule:has-text('Coming up: Dr Mehta follow-up')"), "ideas include something coming up in her schedule");
check(await SC.locator(".ideas .chip").count() <= 4, "ideas stop at four");
await SC.fill("#composerText", "Remind me to give vitamin D drops every day at 9 am");
await SC.keyboard.press("Enter");
await SC.waitForSelector(".note-card .sched-row");
check(await SC.isVisible(".note-card h3:has-text('Add to her schedule?')"), "Claude offers a schedule item in the card");
const scTurns = await SC.evaluate(() => window.__lastTurns[0].content);
check(/Her schedule \(3\):/.test(scTurns) && /Blood test report/.test(scTurns), "Claude is told her schedule and the documents kept");
await SC.fill(".note-card .sched-row input[data-f=time]", "08:30");
await SC.screenshot({ path: `${S}/shots/21-schedule-card.png` });
await SC.click("[data-act=save-all]");
await SC.waitForSelector(".saved-list .tag.schedule");
const scheds = await SC.evaluate(() => [...window.__store.entries()].filter(([k]) => k.startsWith("schedules/")).map(([, v]) => v));
check(scheds.length === 4 && scheds.some(x => x.time === "08:30" && x.repeat === "daily" && x.fromMessage), "saved to her schedule, with the time changed on the card");
await SC.click("#settingsBtn");
check(await SC.locator(".sched-row").count() === 4, "About Divisha lists her whole schedule");
await SC.screenshot({ path: `${S}/shots/22-settings-schedule.png` });
await SC.click(".sched-row >> nth=0 >> [data-act=sched-remove]");
await SC.click("#settingsSave");
await SC.waitForFunction(() => [...window.__store.keys()].filter(k => k.startsWith("schedules/")).length === 3);
check(true, "removing an item in About Divisha deletes it");

// ── Documents ──
const D = await page({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, base + "?seed=1#documents");
await D.waitForSelector(".doc-row");
check(await D.locator(".doc-row").count() === 3, "documents are listed");
check(await D.locator(".doc-month h3").count() === 2, "grouped by month");
check((await D.textContent(".sections a[data-view=docs] .count")) === "3", "the left pane shows how many");
await D.screenshot({ path: `${S}/shots/23-documents.png` });
await D.click("#addDocBtn");
check(await D.isDisabled("#docSave"), "nothing to save without a file, title and brief");
await D.setInputFiles("#docFile", { name: "prescription_oct.png", mimeType: "image/png", buffer: PNG });
check((await D.inputValue("#docTitle")) === "prescription oct", "the title starts from the file name");
check(await D.isDisabled("#docSave") && /a brief/.test(await D.textContent("#docNeed")), "a brief is still required");
await D.fill("#docTitle", "Cough syrup prescription");
await D.fill("#docBrief", "Dr Mehta, 26 Oct: dry cough, no antibiotic. Steam at night, review in a week if not better.");
check(!(await D.isDisabled("#docSave")), "with a file, title and brief, Save works");
await D.screenshot({ path: `${S}/shots/24-add-document.png` });
await D.click("#docSave");
await D.waitForSelector(".doc-view h2:has-text('Cough syrup prescription')");
const kept = await D.evaluate(() => [...window.__store.entries()].filter(([k]) => k.startsWith("documents/")).map(([, v]) => v).find(x => x.title === "Cough syrup prescription"));
check(kept && /^Dr Mehta, 26 Oct/.test(kept.brief) && kept.fileType === "image/png", "saved with its title, brief and file type");
check(await D.evaluate((id) => !!window.__assets[id], kept.fileId), "the file is uploaded and linked");
await D.waitForFunction(() => document.getElementById("docImg")?.naturalWidth > 0);
check(true, "opening a document shows the file");
await D.screenshot({ path: `${S}/shots/25-document-view.png`, fullPage: true });
await D.click("[data-act=doc-download]");
await D.waitForFunction(() => window.__saved.length === 1);
check((await D.evaluate(() => window.__saved[0].filename)) === "prescription_oct.png", "Download saves it under its own name");
await D.click("[data-act=doc-edit]");
await D.fill("#docBrief", "Edited: steam at night, review in a week.");
await D.click("#docSave");
await D.waitForSelector(".doc-view .brief:has-text('Edited: steam')");
check(true, "the title and brief can be edited");
await D.click("[data-act=doc-del]");
await D.click("[data-act=doc-del-yes]");
await D.waitForFunction(() => document.querySelectorAll(".doc-row").length === 3);
check(await D.locator(".doc-row").count() === 3 && !(await D.evaluate((id) => !!window.__assets[id], kept.fileId)), "removing a document removes its file too");

const DR = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&readonly=1#documents");
await DR.waitForSelector(".doc-row");
check(!(await DR.isVisible("#addDocBtn")), "view-only: no 'Add a document'");
await DR.click(".doc-row >> nth=0");
await DR.waitForSelector(".doc-view");
check(await DR.locator("[data-act=doc-edit], [data-act=doc-del]").count() === 0 && await DR.isVisible("[data-act=doc-download]"), "view-only: can open and download, not edit or remove");
const DN = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&noassets=1#documents");
await DN.waitForSelector(".doc-row");
check(!(await DN.isVisible("#addDocBtn")) && await DN.isVisible("text=Only people who can edit this page can add documents"), "without file storage: says who can add documents");

const DP = await page({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true }, base + "?seed=1#documents");
await DP.waitForSelector(".doc-row");
await DP.screenshot({ path: `${S}/shots/26-phone-documents.png` });
await DP.click(".doc-row >> nth=0");
await DP.waitForFunction(() => document.getElementById("docImg")?.naturalWidth > 0);
const dpw = await DP.evaluate(() => document.documentElement.scrollWidth);
check(dpw <= 390, `documents fit a phone (width ${dpw})`);
await DP.screenshot({ path: `${S}/shots/27-phone-document.png`, fullPage: true });
await DP.click("#chatsBtn");
await DP.waitForSelector(".side.open");
await DP.waitForTimeout(400);
await DP.screenshot({ path: `${S}/shots/28-phone-menu.png` });
await DP.click(".side .sections a[data-view=talk]");
await DP.waitForSelector(".side.open", { state: "detached" }).catch(() => {});
check(!(await DP.evaluate(() => document.getElementById("chatPane").classList.contains("open"))) && await DP.isVisible("#composer"), "phone: choosing a section closes the menu and opens it");

// ── PDFs ──
const PD = await page({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, base + "?seed=1#documents");
await PD.waitForSelector(".doc-row");
await PD.click(".doc-row:has-text('Discharge summary')");
await PD.waitForFunction(() => document.querySelectorAll("#docFilePdf canvas").length === 2, null, { timeout: 30000 });
const drawn = await PD.evaluate(() => {
  const c = document.querySelector("#docFilePdf canvas");
  const px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 120) dark += 1;
  return { w: c.getBoundingClientRect().width, dark, label: c.getAttribute("aria-label") };
});
check(drawn.w > 300 && drawn.dark > 500, `a two-page PDF shows both pages, with text drawn (${drawn.dark} dark pixels)`);
check(drawn.label === "Page 1 of 2", "each page is labelled for screen readers");
await PD.screenshot({ path: `${S}/shots/29-pdf-view.png`, fullPage: true });
await PD.click("[data-act=doc-back]");
await PD.click("#addDocBtn");
await PD.setInputFiles("#docFile", { name: "eye-checkup.pdf", mimeType: "application/pdf", buffer: PDF });
await PD.fill("#docBrief", "Routine eye check, all normal.");
await PD.click("#docSave");
await PD.waitForFunction(() => document.querySelectorAll("#docFilePdf canvas").length === 2, null, { timeout: 30000 });
check(true, "an uploaded PDF opens and shows its pages");
const PF = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1#documents", { pdfjs: false });
await PF.waitForSelector(".doc-row");
await PF.click(".doc-row:has-text('Discharge summary')");
await PF.waitForSelector("#docFilePdf .missing:has-text('Use Download')");
check(await PF.isVisible("[data-act=doc-download]"), "if the PDF reader can't load, it says so and Download is there");
const PPh = await page({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true }, base + "?seed=1#documents");
await PPh.waitForSelector(".doc-row");
await PPh.click(".doc-row:has-text('Discharge summary')");
await PPh.waitForFunction(() => document.querySelectorAll("#docFilePdf canvas").length === 2, null, { timeout: 30000 });
const ppw = await PPh.evaluate(() => document.documentElement.scrollWidth);
check(ppw <= 390, `a PDF fits a phone (width ${ppw})`);
await PPh.screenshot({ path: `${S}/shots/30-phone-pdf.png`, fullPage: true });

// ── The left pane stays open, like ChatGPT ──
const paneState = (pg) => pg.evaluate(() => {
  const side = document.getElementById("chatPane");
  const r = side.getBoundingClientRect();
  const cs = getComputedStyle(side);
  return { shown: cs.display !== "none" && cs.visibility !== "hidden" && r.right > 0, overlay: cs.position === "absolute", width: Math.round(r.width) };
});
for (const w of [1280, 760, 600]) {
  const W = await page({ viewport: { width: w, height: 820 } }, base + "?seed=1");
  await W.waitForSelector("#messages[data-state=ready]");
  const st = await paneState(W);
  check(st.shown && !st.overlay, `${w} px: the left pane is open beside the page (${st.width} px wide)`);
  const sw = await W.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= w, `${w} px: nothing scrolls sideways (${sw})`);
  if (w === 760) {
    await W.screenshot({ path: `${S}/shots/31-760-pane-open.png` });
    await W.click("#chatsBtn");
    check(!(await paneState(W)).shown && (await W.getAttribute("#chatsBtn", "aria-label")) === "Open sidebar", "760 px: the top-left button collapses it");
    await W.screenshot({ path: `${S}/shots/32-760-pane-collapsed.png` });
    await W.reload();
    await W.waitForSelector("#messages[data-state=ready]");
    check(!(await paneState(W)).shown, "a collapsed pane stays collapsed after a reload");
    await W.click("#chatsBtn");
    check((await paneState(W)).shown, "and the button opens it again");
    await W.click(".sections a[data-view=docs]");
    await W.waitForSelector(".doc-row");
    check((await paneState(W)).shown, "picking a section keeps the pane open");
    await W.screenshot({ path: `${S}/shots/33-760-documents.png` });
    await W.click(".sections a[data-view=look]");
    await W.waitForSelector(".tiles .tile");
    const lw = await W.evaluate(() => document.documentElement.scrollWidth);
    check(lw <= w, `760 px: Time-based analysis fits beside the pane (${lw})`);
    await W.screenshot({ path: `${S}/shots/34-760-analysis.png`, fullPage: true });
  }
}
const PH = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, base + "?seed=1");
await PH.waitForSelector("#messages[data-state=ready]");
check(!(await paneState(PH)).shown, "phone: the pane starts closed, as a slide-in menu");

// ── Attachments in the chat ──
const AT = await page({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, base + "?seed=1");
await AT.waitForSelector("#messages[data-state=ready]");
check(await AT.isVisible("#attachBtn"), "the typing box has a paperclip");
const assetsBefore = await AT.evaluate(() => Object.keys(window.__assets).length);
await AT.setInputFiles("#attachInput", [
  { name: "prescription.png", mimeType: "image/png", buffer: PNG },
  { name: "discharge.pdf", mimeType: "application/pdf", buffer: PDF },
]);
check(await AT.locator("#attachList .att").count() === 2, "attached files wait above the typing box");
check(!(await AT.isDisabled("#sendBtn")), "Send works with files, even before typing");
await AT.screenshot({ path: `${S}/shots/35-attach-pending.png` });
await AT.click("#attachList .att >> nth=1 >> [data-act=attach-remove]");
check(await AT.locator("#attachList .att").count() === 1, "a waiting file can be removed");
await AT.setInputFiles("#attachInput", [{ name: "discharge.pdf", mimeType: "application/pdf", buffer: PDF }]);
await AT.fill("#composerText", "Prescription and discharge summary from today");
await AT.keyboard.press("Enter");
await AT.waitForSelector(".note-card .doc-offer", { timeout: 60000 });
const sent = await AT.evaluate(() => ({
  images: window.__lastImages,
  turn: window.__lastTurns.at(-1).content,
  assets: Object.keys(window.__assets).length,
  msg: Object.values(window.__store.get(`chats/${Object.keys(Object.fromEntries([...window.__store.keys()].filter(k => k.startsWith("chats/")).map(k => [k.slice(6), 1]))).sort().at(-1)}`).messages).find(m => m.attachments),
}));
check(sent.assets === assetsBefore + 2, "both files are uploaded and kept with the message");
check(sent.msg?.attachments?.length === 2 && sent.msg.attachments.every(a => a.fileId), "the message remembers its two files");
check(sent.images.length === 3 && sent.images[0].type === "image/png" && sent.images.slice(1).every(i => i.type === "image/jpeg"), `Claude is shown the photo and both PDF pages as pictures (${sent.images.length})`);
check(/\[Attached: 1\. prescription\.png \(photo\); 2\. discharge\.pdf \(PDF, first 2 pages shown as pictures\)\]/.test(sent.turn), "Claude is told what each file is");
check(await AT.locator(".msg.user .msg-files .att").count() === 2, "the chat shows the files on the message");
check(await AT.locator(".note-card .doc-offer").count() === 2, "the card offers to keep both in Documents");
check((await AT.inputValue(".doc-offer >> nth=0 >> .f-title")) === "Cough syrup prescription", "with Claude's suggested title");
check(await AT.isVisible(".note-card .group-title:has-text('In her schedule')"), "and the syrup for her schedule");
await AT.screenshot({ path: `${S}/shots/36-attach-card.png`, fullPage: true });
await AT.fill(".doc-offer >> nth=1 >> .f-brief", "");
await AT.click("[data-act=save-all]");
await AT.waitForSelector("#toast:has-text('needs a title and a brief')");
check(true, "a document without a brief isn't saved");
await AT.fill(".doc-offer >> nth=1 >> .f-brief", "Chest infection in September; nebuliser at home for 5 days.");
await AT.click("[data-act=save-all]");
await AT.waitForSelector(".saved-list .tag.document");
const kept2 = await AT.evaluate(() => ({ docs: [...window.__store.entries()].filter(([k]) => k.startsWith("documents/")).map(([, v]) => v), assets: Object.keys(window.__assets).length }));
check(kept2.docs.some(d => d.title === "Cough syrup prescription" && d.fileType === "image/png") && kept2.docs.some(d => /nebuliser at home/.test(d.brief)), "both are kept in Documents with their titles and briefs");
check(kept2.assets === sent.assets, "keeping them doesn't upload the files again");
await AT.click(".msg.user .msg-files .att >> nth=1");
await AT.waitForFunction(() => document.querySelectorAll("#fvBody canvas").length === 2, null, { timeout: 30000 });
check(true, "tapping an attached PDF opens it in a viewer");
await AT.screenshot({ path: `${S}/shots/37-attach-viewer.png` });
await AT.click("#fvClose");
await AT.click(".saved-list [data-act=doc-open-chat] >> nth=0");
await AT.waitForSelector(".doc-view h2");
check(await AT.isVisible(".sections a[data-view=docs][aria-current=page]"), "a saved document's link opens it in Documents");

await AT.click(".sections a[data-view=talk]");
await AT.setInputFiles("#attachInput", [{ name: "rash.png", mimeType: "image/png", buffer: PNG }]);
await AT.click("#sendBtn");
await AT.waitForFunction(() => document.querySelectorAll(".msg.user").length >= 2);
check(true, "a file can be sent with no message");

const ATR = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&readonly=1");
await ATR.waitForSelector("#messages[data-state=ready]");
check(!(await ATR.isVisible("#attachBtn")), "view-only: no paperclip");
const ATN = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&noassets=1");
await ATN.waitForSelector("#messages[data-state=ready]");
check(await ATN.isVisible("#attachBtn"), "without file storage, Claude can still be shown a photo");
await ATN.setInputFiles("#attachInput", [{ name: "rash.png", mimeType: "image/png", buffer: PNG }]);
await ATN.fill("#composerText", "Rash on her arm");
await ATN.keyboard.press("Enter");
await ATN.waitForSelector(".msg.user .att:has-text('not kept')");
await ATN.waitForSelector(".msg.assistant .text");
check(await ATN.locator(".doc-offer").count() === 0, "and a file that wasn't kept isn't offered for Documents");
const ATX = await page({ viewport: { width: 1280, height: 900 } }, base + "?seed=1&noassets=1&noimages=1");
await ATX.waitForSelector("#messages[data-state=ready]");
check(!(await ATX.isVisible("#attachBtn")), "with neither storage nor pictures, no paperclip");
const ATP = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, base + "?seed=1");
await ATP.waitForSelector("#messages[data-state=ready]");
await ATP.setInputFiles("#attachInput", [{ name: "prescription.png", mimeType: "image/png", buffer: PNG }, { name: "discharge.pdf", mimeType: "application/pdf", buffer: PDF }]);
await ATP.click("#sendBtn");
await ATP.waitForSelector(".note-card .doc-offer", { timeout: 60000 });
const apw = await ATP.evaluate(() => document.documentElement.scrollWidth);
check(apw <= 390, `phone: attachments and the card fit (width ${apw})`);
await ATP.screenshot({ path: `${S}/shots/38-phone-attach-card.png`, fullPage: true });

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join("\n")}` : "No console errors");
await browser.close();
