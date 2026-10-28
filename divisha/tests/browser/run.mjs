const pw = await import(process.env.PLAYWRIGHT || "playwright"); const { chromium } = pw.default || pw;
const S = process.argv[2] || ".";
const base = `http://127.0.0.1:${process.env.PORT || 8765}/index.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function page(opts, url = base) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", e => errors.push(String(e)));
  await p.goto(url);
  return p;
}

// ── Desktop, light, empty diary: the real first-use flow ──
const d = await page({ viewport: { width: 1280, height: 820 }, colorScheme: "light" });
await d.waitForSelector(".welcome");
check(await d.isVisible("text=How was Divisha today?"), "welcome asks how she was");
await d.screenshot({ path: `${S}/shots/1-desktop-empty.png` });

await d.click("#settingsBtn");
await d.fill("#sDob", "2024-06-15");
await d.fill("#sDoctor", "Dr Mehta");
await d.fill("#sPhone", "98200 12345");
await d.fill("#r-0-what", "Vitamin D");
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
await d.click("#tabLook");
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
await d.click("#tabTalk");
await d.fill("#composerText", "She was fine all day");
await d.keyboard.press("Enter");
await d.waitForSelector("#stopBtn:not([hidden])");
await d.click("#stopBtn");
await d.waitForSelector("#sendBtn:not([hidden])");
check(true, "Stop ends the answer and brings the Send button back");

// ── Phone, dark, with example data ──
const p = await page({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true }, base + "?seed=1");
await p.waitForSelector(".welcome");
await p.screenshot({ path: `${S}/shots/6-phone-dark-talk.png` });
const wide = await p.evaluate(() => document.documentElement.scrollWidth);
check(wide <= 390, `no sideways scroll on a phone (width ${wide})`);
await p.click("#chatsBtn");
await p.waitForSelector(".chat-pane.open");
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
await n.waitForSelector(".welcome");
check(await n.isVisible("text=Claude can't answer on this view"), "says plainly when Claude isn't available");
check(await n.isDisabled("#sendBtn"), "Send is off when Claude isn't available");
await n.screenshot({ path: `${S}/shots/10-phone-light-nosample.png` });

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join("\n")}` : "No console errors");
await browser.close();
