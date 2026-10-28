// helper.js — the app's thinking.
//
// It talks to Claude, makes the "ideas for today", and checks for warning
// signs. Apart from askClaude(), every function here is plain: it takes data
// in and gives data back, so tests can check it without a browser.

// ─── The five kinds of entry ─────────────────────────────────────────────

export const TYPES = {
  health:  { label: "How she is", hint: "Well, a bit off or sick" },
  symptom: { label: "Symptom",    hint: "Fever 38.4, cough at night" },
  care:    { label: "Care given", hint: "Kadha, steam, paracetamol 5 ml" },
  doctor:  { label: "Doctor",     hint: "Visit, and what the doctor said" },
  growth:  { label: "Growth",     hint: "Weight, height, milestones, happy moments" },
};

export const HEALTH = { well: "Well", off: "A bit off", sick: "Sick" };

// ─── Dates ───────────────────────────────────────────────────────────────
// A "day key" is a plain "YYYY-MM-DD" string in local time.

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function dayLabel(key, today = dayKey()) {
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = String(y) === today.slice(0, 4);
  return date.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function ageInMonths(dob, today = dayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || "")) return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  return months < 0 ? null : months;
}

export function ageText(dob, today = dayKey()) {
  const m = ageInMonths(dob, today);
  if (m === null) return "";
  if (m < 1) return "under a month old";
  if (m < 24) return `${m} month${m === 1 ? "" : "s"} old`;
  const years = Math.floor(m / 12);
  const rest = m % 12;
  return `${years} years${rest ? ` ${rest} month${rest === 1 ? "" : "s"}` : ""} old`;
}

// ─── Cleaning what Claude suggests ───────────────────────────────────────

function healthLevel(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(sick|ill|unwell|bimar|bad)\b/.test(t)) return "sick";
  if (/\b(off|mild|a bit|thoda|so-so|cranky|low)\b/.test(t)) return "off";
  if (/\b(well|fine|good|ok|okay|theek|thik|accha|achha|healthy|great)\b/.test(t)) return "well";
  return "off";
}

// Turns one suggested entry into a clean one, or null if it can't be used.
export function cleanEntry(raw, today = dayKey()) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").toLowerCase().trim();
  if (!TYPES[type]) return null;

  let what = String(raw.what ?? "").trim().slice(0, 120);
  if (type === "health") what = HEALTH[what] ? what : healthLevel(what);
  if (!what) return null;

  let date = String(raw.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) date = today;

  const details = String(raw.details ?? "").trim().slice(0, 300);
  return { date, type, what, details };
}

// Claude replies in words, then one ```json block listing entries to note.
// This splits the two. Anything that doesn't parse is simply left out.
export function parseReply(text, today = dayKey()) {
  const fences = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const last = fences[fences.length - 1];
  if (!last) {
    return { reply: visiblePart(text), entries: [] };
  }
  const reply = (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
  let entries = [];
  try {
    const data = JSON.parse(last[1]);
    const list = Array.isArray(data) ? data : data?.entries;
    if (Array.isArray(list)) entries = list.map(e => cleanEntry(e, today)).filter(Boolean);
  } catch { /* a broken block means nothing to note */ }
  return { reply, entries };
}

// While Claude is still writing, show only the words, never the JSON block.
export function visiblePart(text) {
  const cut = String(text).indexOf("```");
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

// ─── What Claude sees ────────────────────────────────────────────────────

export function entryLine(e) {
  const what = e.type === "health" ? HEALTH[e.what] || e.what : e.what;
  return `- ${e.date} · ${TYPES[e.type]?.label || e.type} · ${what}${e.details ? ` · ${e.details}` : ""}`;
}

// The short packet the app hands Claude: about Divisha + the last two weeks.
export function contextPacket({ profile = {}, entries = [], today = dayKey() }) {
  const name = profile.name || "Divisha";
  const from = addDays(today, -13);
  const recent = entries
    .filter(e => e.date >= from && e.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const routine = (profile.routine || []).filter(r => r.what).map(r => `${r.what} (${r.often || "daily"})`);
  const lines = [
    `About ${name}:`,
    `- Age: ${ageText(profile.dob, today) || "not given"}`,
    `- Allergies: ${profile.allergies || "none noted"}`,
    `- Doctor: ${profile.doctorName || "not given"}`,
    `- Usual routine: ${routine.length ? routine.join(", ") : "none noted"}`,
    "",
    `Diary, last 14 days (${recent.length} entries):`,
    ...(recent.length ? recent.map(entryLine) : ["- nothing yet"]),
  ];
  return lines.join("\n");
}

export function instructions({ profile = {}, today = dayKey() }) {
  const name = profile.name || "Divisha";
  const [y, m, d] = today.split("-").map(Number);
  const pretty = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `You are the helper inside Divisha Wellness, a diary two parents keep about their daughter ${name}. The aim is to make her life better over time.

Today is ${pretty} (${today}). Yesterday was ${addDays(today, -1)}.

How to reply:
- Reply in 1 to 4 short, warm, practical sentences. Parents often mix English and Hindi (kadha, crocin, bhaap, bukhar). Reply in the same style.
- You are not a doctor. Never diagnose. Never work out or suggest a medicine dose. If asked about a dose, say to follow what the doctor advised.
- If anything sounds serious, say plainly to call the doctor now.
- Offer at most one idea or one question.

After your reply, always add one block exactly like this, listing what the parent told you that should go in the diary (use an empty list if nothing new):
\`\`\`json
{"entries":[{"date":"${today}","type":"symptom","what":"Fever 38.4","details":"since evening"}]}
\`\`\`
Types:
- health: how she is overall. "what" must be exactly "well", "off" or "sick".
- symptom: fever, cough, cold, ear pain, loose motions, rash and so on. Put temperatures in "what".
- care: home remedies and medicines given. Keep any dose exactly as the parent said it.
- doctor: a visit or call, and what the doctor said.
- growth: weight, height, milestones, happy moments.
Rules for entries: one thing per entry. Only note what the parent says happened. Do not repeat anything already in the diary below. Use today's date unless they mention another day.`;
}

// Builds the conversation for one message: the packet goes first, then the
// chat so far (last 20 messages), then the new message.
export function buildTurns({ profile, entries, history = [], newText, today = dayKey() }) {
  const saw = contextPacket({ profile, entries, today });
  const packet = `${instructions({ profile, today })}\n\n${saw}`;

  const raw = history.slice(-20).map(m => ({ role: m.role, content: String(m.text || "").trim() }))
    .filter(t => t.content && (t.role === "user" || t.role === "assistant"));
  raw.push({ role: "user", content: String(newText).trim() });

  while (raw.length && raw[0].role !== "user") raw.shift();
  const turns = [];
  for (const t of raw) {
    const prev = turns[turns.length - 1];
    if (prev && prev.role === t.role) prev.content += `\n\n${t.content}`;
    else turns.push({ ...t });
  }
  turns[0].content = `${packet}\n\n---\n\nParent's message:\n${turns[0].content}`;
  return { turns, saw };
}

// ─── Talking to Claude ───────────────────────────────────────────────────

export async function askClaude(sample, turns, { signal, onText } = {}) {
  const result = await sample(turns, { modelTier: "default", cache: false, signal, onText });
  return result.text;
}

export function errorText(code) {
  switch (code) {
    case "cancelled": return "Stopped.";
    case "not_granted": return "Claude isn't allowed on this page yet. Allow it when the page asks, or from the page's Permissions menu.";
    case "rate_limited": return "Claude is busy or you've hit your usage limit. Wait a minute and try again.";
    case "session_expired": return "Your claude.ai sign-in has expired. Sign in again, then try again.";
    case "sampling_disabled": return "Claude isn't available on this account.";
    case "refused": return "Claude didn't answer that. Try saying it another way.";
    case "prompt_too_large": return "There's too much to send at once. Try a shorter message or a shorter time span.";
    case "invalid_json": return "Claude's notes came back in a form the app couldn't read. Try again.";
    default: return "Claude couldn't answer just now. Try again.";
  }
}

// ─── Ideas for today ─────────────────────────────────────────────────────
// Simple rules, checked in order. At most three ideas come back.

export function ideasForToday({ profile = {}, entries = [], now = new Date() }) {
  const today = dayKey(now);
  const yesterday = addDays(today, -1);
  const name = profile.name || "Divisha";
  const ideas = [];
  const add = (label, prefill) => {
    if (ideas.length < 3 && !ideas.some(i => i.label === label)) ideas.push({ label, prefill });
  };
  const todays = entries.filter(e => e.date === today);
  const loggedToday = (word) => todays.some(e => e.type === "care" && e.what.toLowerCase().includes(word.toLowerCase()));

  // 1. A symptom in the last two days, and nothing says she's well today.
  const wellToday = todays.some(e => e.type === "health" && e.what === "well");
  const lastSymptom = entries
    .filter(e => e.type === "symptom" && (e.date === today || e.date === yesterday))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (lastSymptom && !wellToday) {
    add(`Is the ${lastSymptom.what.toLowerCase()} better?`, `Update on the ${lastSymptom.what.toLowerCase()}: `);

    // 2. Suggest the care you've used most in the last two months, if not given today.
    const since = addDays(today, -60);
    const counts = {};
    for (const e of entries) {
      if (e.type === "care" && e.date >= since) {
        const key = e.what.trim();
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    const favourite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (favourite && favourite[1] >= 2 && !loggedToday(favourite[0])) {
      add(`${favourite[0]} tonight?`, `Gave ${favourite[0].toLowerCase()} tonight`);
    }
  }

  // 3. Routine items not noted yet (daily: today; weekly: this past week).
  for (const r of profile.routine || []) {
    if (!r.what) continue;
    const word = r.what.trim();
    const done = r.often === "weekly"
      ? entries.some(e => e.type === "care" && e.date > addDays(today, -7) && e.what.toLowerCase().includes(word.toLowerCase()))
      : loggedToday(word);
    if (!done) add(`${word} done${r.often === "weekly" ? " this week" : " today"}?`, `Gave ${word.toLowerCase()} today`);
  }

  // 4. Evening, and nothing yet about how she was.
  const healthToday = todays.some(e => e.type === "health");
  if (!healthToday && now.getHours() >= 17) add(`How was ${name} today?`, `${name} was `);

  // 5. A good run: well on each of the last 7 days that have an entry.
  const levels = {};
  for (const e of entries) if (e.type === "health" && e.date > addDays(today, -7)) {
    if (!levels[e.date] || e.what !== "well") levels[e.date] = e.what;
  }
  const days = Object.values(levels);
  if (days.length >= 5 && days.every(l => l === "well")) add("Note a happy moment?", `Happy moment: `);

  if (!ideas.length && !healthToday) add(`How was ${name} today?`, `${name} was `);
  return ideas;
}

// ─── Warning signs ───────────────────────────────────────────────────────
// Checked by the app itself, so the message appears even if Claude misses it.

export const WARNINGS = {
  fever_high: (d) => `A temperature of ${d}°C is high for her age.`,
  fever_long: () => "She has had fever on five of the last six days.",
  breathing:  () => "Trouble breathing needs a doctor straight away.",
  drowsy:     () => "Unusual sleepiness, floppiness or being hard to wake needs a doctor straight away.",
  fluids:     () => "Not drinking or not peeing can mean she is getting dehydrated.",
  seizure:    () => "A fit needs a doctor straight away. If it lasts more than five minutes, call 112.",
  rash_fever: () => "A rash together with fever should be seen by a doctor today.",
};

const FEVER_WORDS = /fever|temp|bukhar|bukhaar|°|degree|thermometer/i;

export function temperatures(text) {
  const t = String(text || "");
  const found = [];
  for (const m of t.matchAll(/(\d{2,3}(?:\.\d{1,2})?)\s*(°\s*[cf]|deg\w*|\b[cf]\b)?/gi)) {
    const n = parseFloat(m[1]);
    const unit = (m[2] || "").toLowerCase();
    const hasContext = unit || FEVER_WORDS.test(t);
    if (!hasContext) continue;
    if (unit.includes("f") || (n >= 95 && n <= 110)) {
      if (n >= 95 && n <= 110) found.push(Math.round(((n - 32) * 5 / 9) * 10) / 10);
    } else if (n >= 35 && n <= 43) {
      found.push(n);
    }
  }
  return found;
}

function feverLimit(months) {
  if (months === null) return 39;
  if (months < 3) return 38;
  if (months < 36) return 39;
  return 40;
}

// Returns a list like [{id: "fever_high", detail: 39.6}]. Empty means no warning.
export function checkWarnings({ profile = {}, text = "", proposed = [], entries = [], today = dayKey() }) {
  const all = [text, ...proposed.map(e => `${e.what} ${e.details || ""}`)].join("\n");
  const found = [];
  const add = (id, detail) => { if (!found.some(w => w.id === id)) found.push({ id, detail }); };

  const temps = temperatures(all);
  const limit = feverLimit(ageInMonths(profile.dob, today));
  const highest = temps.length ? Math.max(...temps) : null;
  if (highest !== null && highest >= limit) add("fever_high", highest);

  if (/(trouble|difficult\w*|hard|fast|struggl\w*|laboured|heavy)\s+(to\s+)?breath|breathless|can'?t breathe|gasping|ribs? (pulling|sucking)|saans (nahi|phool|lene)/i.test(all)) add("breathing");
  if (/very sleepy|unusually sleepy|lethargic|\blimp\b|floppy|hard to wake|not waking|won'?t wake|unresponsive|\bsust\b/i.test(all)) add("drowsy");
  if (/no (wet nappies|wet diapers|pee|urine)|not peeing|hasn'?t peed|not drinking|refus\w* (to )?(drink|fluids|water|milk)|dry mouth|no tears/i.test(all)) add("fluids");
  if (/seizure|convuls|\bfits?\b|jhatke|daura/i.test(all)) add("seizure");
  if (/rash|daane|chakatte/i.test(all) && (temps.length || /fever|bukhar/i.test(all))) add("rash_fever");

  const feverDays = new Set([
    ...entries.filter(e => e.type === "symptom" && /fever|bukhar|temp/i.test(`${e.what} ${e.details || ""}`)).map(e => e.date),
    ...(/fever|bukhar/i.test(all) || temps.length ? [today] : []),
  ].filter(d => d > addDays(today, -6) && d <= today));
  if (feverDays.size >= 5) add("fever_long");

  return found;
}

// ─── Dose questions ──────────────────────────────────────────────────────
// The app never works out a dose. It shows the last dose you noted instead.

export function doseNote({ text = "", entries = [], profile = {} }) {
  if (!/\b(how much|kitna|kitni|what dose|which dose|dose|dosage)\b/i.test(text)) return null;
  const words = String(text).toLowerCase().match(/[a-z]{4,}/g) || [];
  const dosed = entries
    .filter(e => e.type === "care" && /\d+(\.\d+)?\s*(ml|mg|drops?|tabs?|tablets?)/i.test(`${e.what} ${e.details || ""}`))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const match = dosed.find(e => words.some(w => e.what.toLowerCase().includes(w))) || dosed[0];
  const doctor = profile.doctorName ? ` with ${profile.doctorName}` : " with the doctor";
  if (!match) return `The app doesn't work out medicine doses. Please check${doctor}.`;
  return `The app doesn't work out medicine doses. The last dose you noted was "${match.what}" on ${dayLabel(match.date)}. Check${doctor} before changing it.`;
}

// ═════════════════════════════════════════════════════════════════════════
// Look back
// ═════════════════════════════════════════════════════════════════════════

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function toDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDay(key) {
  return toDate(key).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Time spans: a week (Monday to Sunday), a month, or a year ───────────

export function makeSpan(kind, anyDay) {
  const d = toDate(anyDay);
  let from, to;
  if (kind === "week") {
    from = addDays(anyDay, -((d.getDay() + 6) % 7));
    to = addDays(from, 6);
  } else if (kind === "year") {
    from = `${d.getFullYear()}-01-01`;
    to = `${d.getFullYear()}-12-31`;
  } else {
    kind = "month";
    from = dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
    to = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  return { kind, from, to, key: `${kind}-${from}` };
}

export function stepSpan(span, dir) {
  if (span.kind === "week") return makeSpan("week", addDays(span.from, 7 * dir));
  if (span.kind === "year") return makeSpan("year", `${Number(span.from.slice(0, 4)) + dir}-01-01`);
  const d = toDate(span.from);
  return makeSpan("month", dayKey(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
}

export function spanLabel(span, today = dayKey()) {
  if (span.kind === "year") return span.from.slice(0, 4);
  if (span.kind === "month") {
    const d = toDate(span.from);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (span.from <= today && today <= span.to) return "This week";
  if (makeSpan("week", addDays(today, -7)).from === span.from) return "Last week";
  const a = toDate(span.from), b = toDate(span.to);
  const sameMonth = a.getMonth() === b.getMonth();
  const left = sameMonth ? String(a.getDate()) : shortDay(span.from);
  return `${left} – ${shortDay(span.to)}`;
}

// How the previous span is named in "4 fewer than ...".
export function previousName(span) {
  if (span.kind === "week") return "the week before";
  const prev = stepSpan(span, -1);
  if (span.kind === "year") return prev.from.slice(0, 4);
  return MONTHS[toDate(prev.from).getMonth()];
}

// What to compare with. While a span is still going, compare with the same
// number of days of the one before ("September so far"), so a month
// that's half over isn't measured against a whole month.
export function comparisonSpan(span, today = dayKey()) {
  const prev = stepSpan(span, -1);
  if (!(span.from <= today && today <= span.to)) return { span: prev, name: previousName(span) };
  let elapsed = 0;
  for (let d = span.from; d <= today; d = addDays(d, 1)) elapsed += 1;
  const to = addDays(prev.from, elapsed - 1);
  return { span: { ...prev, to: to < prev.to ? to : prev.to }, name: `${previousName(span)} so far` };
}

export function compareText(now, before, prevName) {
  const diff = now - before;
  if (diff === 0) return `Same as ${prevName}`;
  return `${Math.abs(diff)} ${diff < 0 ? "fewer" : "more"} than ${prevName}`;
}

// ─── Counting ────────────────────────────────────────────────────────────

// How each day went. A "How she is" entry decides it (the latest one that
// day wins). A day with a symptom but no "How she is" counts as a bit off.
// A day with neither is "not noted".
export function dayLevels(entries) {
  const byDay = {};
  for (const e of entries) {
    const cur = byDay[e.date];
    if (e.type === "health") {
      if (!cur || cur.from !== "health" || (e.createdAt || "") >= cur.at) {
        byDay[e.date] = { level: HEALTH[e.what] ? e.what : "off", from: "health", at: e.createdAt || "" };
      }
    } else if (e.type === "symptom" && !cur) {
      byDay[e.date] = { level: "off", from: "symptom", at: "" };
    }
  }
  return Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, v.level]));
}

// "Fever 39.4" and "Fever 38" are both "Fever"; "Paracetamol 5 ml" is "Paracetamol".
export function baseLabel(what) {
  const t = String(what || "")
    .replace(/\bday\s*\d+\b/gi, "")
    .replace(/\d+(\.\d+)?\s*(°\s*[cf]\b|ml\b|mg\b|kg\b|cm\b|drops?\b|tabs?\b|tablets?\b|[cf]\b)?/gi, "")
    .replace(/[()\[\]\-–,.:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
}

function mostCommon(list) {
  const groups = new Map();
  for (const e of list) {
    const label = baseLabel(e.what) || e.what;
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label, count: 0, ids: [] });
    const g = groups.get(key);
    g.count += 1;
    if (e.id) g.ids.push(e.id);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5);
}

export function countSpan(entries, span, today = dayKey()) {
  const inSpan = entries.filter(e => e.date >= span.from && e.date <= span.to);
  const levels = dayLevels(inSpan);
  const last = span.to < today ? span.to : today;
  const days = { well: 0, off: 0, sick: 0, none: 0, total: 0 };
  const spells = [];
  let run = null;
  for (let d = span.from; d <= last; d = addDays(d, 1)) {
    const level = levels[d];
    days.total += 1;
    days[level || "none"] += 1;
    if (level === "off" || level === "sick") {
      if (run) { run.to = d; run.days += 1; if (level === "sick") run.worst = "sick"; }
      else { run = { from: d, to: d, days: 1, worst: level }; spells.push(run); }
    } else {
      run = null;
    }
  }
  const longest = spells.reduce((best, s) => (!best || s.days > best.days ? s : best), null);
  return {
    days,
    unwellDays: days.off + days.sick,
    spells: spells.length,
    longest,
    doctor: inSpan.filter(e => e.type === "doctor").length,
    symptoms: mostCommon(inSpan.filter(e => e.type === "symptom")),
    care: mostCommon(inSpan.filter(e => e.type === "care")),
    entryCount: inSpan.length,
    levels,
    inProgress: span.from <= today && today <= span.to,
    future: span.from > today,
  };
}

// ─── Claude's notes ──────────────────────────────────────────────────────

export const NOTE_SECTIONS = [
  { key: "now", title: "How she is now", most: 2 },
  { key: "working", title: "What's working", most: 3 },
  { key: "tryNext", title: "Try next", most: 3 },
  { key: "moments", title: "Important moments", most: 5 },
];

function numbersBlock(span, stats, prevStats, prevName, today) {
  const label = spanLabel(span, today);
  const sp = stats.longest ? ` Longest: ${stats.longest.days} day${stats.longest.days === 1 ? "" : "s"} (${shortDay(stats.longest.from)} to ${shortDay(stats.longest.to)}).` : "";
  const list = (items) => (items.length ? items.map(i => `${i.label.toLowerCase()} (${i.count})`).join(", ") : "none");
  return [
    `Numbers for ${label}, counted by the app:`,
    `- Days ${stats.inProgress ? "so far" : "in this span"}: ${stats.days.total}. Well: ${stats.days.well}. A bit off: ${stats.days.off}. Sick: ${stats.days.sick}. Not noted: ${stats.days.none}.`,
    `- Sick spells (off or sick days in a row): ${stats.spells}.${sp}`,
    `- Doctor visits: ${stats.doctor}.`,
    `- Most common symptoms: ${list(stats.symptoms)}.`,
    `- Care given most: ${list(stats.care)}.`,
    `- ${prevName[0].toUpperCase() + prevName.slice(1)}, for comparison: well ${prevStats.days.well}, off or sick ${prevStats.unwellDays}, sick spells ${prevStats.spells}, doctor visits ${prevStats.doctor}.`,
  ].join("\n");
}

// Builds what Claude reads to write the notes. Entries are numbered [1], [2]…
// so Claude can point at them; `refs` turns those numbers back into entries.
export function notesRequest({ profile = {}, span, entries, today = dayKey() }) {
  const name = profile.name || "Divisha";
  const stats = countSpan(entries, span, today);
  const cmp = comparisonSpan(span, today);
  const prevStats = countSpan(entries, cmp.span, today);
  let list = entries
    .filter(e => e.date >= span.from && e.date <= span.to)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.createdAt || "") < (b.createdAt || "") ? -1 : 1));
  // A very full year: the day counts already cover "How she is", so leave those lines out.
  if (list.length > 1500) list = list.filter(e => e.type !== "health");
  const refs = list.map(e => e.id);
  const lines = list.map((e, i) => `[${i + 1}] ${entryLine(e).slice(2)}`);
  const label = spanLabel(span, today);
  const age = ageText(profile.dob, today);

  const saw = [
    numbersBlock(span, stats, prevStats, cmp.name, today),
    "",
    `Diary entries for ${label} (${lines.length}):`,
    ...lines,
  ].join("\n");

  const prompt = `You are writing the Look back notes in Divisha Wellness, a diary two parents keep about their daughter ${name}${age ? `, who is ${age}` : ""}. The aim is to make her life better over time.

You are looking at ${label} (${span.from} to ${span.to}${stats.inProgress ? `, still in progress, today is ${today}` : ""}).

Write like a caring friend who has read the diary carefully: warm, plain and specific. Talk to the parents as "you" and call her ${name}. Use short sentences and everyday words, with no medical jargon.

Rules:
- The numbers below were counted by the app. Use them exactly as given. Never recount or make up numbers.
- Days that are "not noted" are unknown. Never treat them as well days.
- You are not a doctor. Never diagnose. Never suggest a medicine or a dose. Ideas in "tryNext" are everyday care, routines, or "ask the doctor about ...".
- Every point must list, in "see", the numbers of the diary entries it is based on. Leave out any point you can't back with entries.
- If there are only a few entries, say so kindly in "now" and keep everything short.

Reply with only this JSON:
{"now":[{"text":"...","see":[1,2]}],"working":[{"text":"...","see":[3]}],"tryNext":[{"text":"...","see":[4]}],"moments":[{"text":"12 Oct: ...","see":[5]}]}
- now: 1 or 2 points on how ${name} is at the end of this span.
- working: up to 3 things that seem to help, and what the diary shows.
- tryNext: 1 to 3 gentle ideas.
- moments: up to 5 important moments such as doctor visits, new medicines or milestones. Start each with its date, like "12 Oct:".

${saw}`;

  return { prompt, refs, saw, stats };
}

// Checks Claude's notes: keeps only points that point at real entries.
export function readNotes(raw, refs) {
  const body = {};
  let total = 0;
  for (const { key, most } of NOTE_SECTIONS) {
    const items = Array.isArray(raw?.[key]) ? raw[key] : [];
    body[key] = items.map(p => {
      const text = String(p?.text ?? "").trim().slice(0, 400);
      const see = [...new Set((Array.isArray(p?.see) ? p.see : [])
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= 1 && n <= refs.length)
        .map(n => refs[n - 1]))];
      return text && see.length ? { text, see } : null;
    }).filter(Boolean).slice(0, most);
    total += body[key].length;
  }
  return total ? body : null;
}

export async function writeNotes(sample, prompt, { signal } = {}) {
  return sample.json(prompt, { modelTier: "default", cache: false, signal });
}

// How many entries in the span were added or changed after the notes were written.
export function changedSince(entries, span, writtenAt) {
  if (!writtenAt) return 0;
  return entries.filter(e => e.date >= span.from && e.date <= span.to
    && ((e.createdAt || "") > writtenAt || (e.editedAt || "") > writtenAt)).length;
}
