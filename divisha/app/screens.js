// screens.js — draws the screens and handles taps.
//
// It never saves or loads by itself (that's diary.js) and never talks to
// Claude by itself (that's helper.js). It keeps what's on screen in `state`,
// and every render function draws one part of the page from `state`.

import { openDiary } from "./diary.js";
import {
  TYPES, HEALTH, dayKey, dayLabel, ageText, cleanEntry, parseReply, visiblePart,
  buildTurns, askClaude, errorText, ideasForToday, checkWarnings, WARNINGS, doseNote,
  addDays, makeSpan, stepSpan, spanLabel, comparisonSpan, compareText, countSpan,
  NOTE_SECTIONS, notesRequest, readNotes, writeNotes, changedSince,
} from "./helper.js";

const $ = (id) => document.getElementById(id);

const state = {
  diary: null,
  sample: null,
  loading: true,
  problem: null,            // "signed-out" when the diary can't open
  canWrite: true,
  profile: {},
  entries: [],
  chatList: [],
  messages: [],
  today: dayKey(),
  day: dayKey(),            // which day's chat is open
  view: "talk",
  busy: false,              // Claude is answering
  controller: null,
  streamText: "",
  liveWarnings: [],
  failed: null,             // { text, error } when Claude couldn't answer
  drafts: {},               // edits to a "note this down?" card, by message id
  names: {},
  // Look back
  span: makeSpan("month", dayKey()),
  look: null,               // this span's entries and the app's counts
  range: null,              // entries read month by month, for a long span
  notes: undefined,         // Claude's saved notes for this span
  notesBusy: false,
  notesController: null,
  notesError: null,
  focus: null,              // { title, ids } when digging into some entries
  filter: "all",
  edit: null,               // the entry being edited or added
  confirmDelete: null,
};

let stopChat = null;

// ─── Small helpers ───────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function name() { return state.profile.name || "Divisha"; }

function who(id) {
  if (id && state.diary && id === state.diary.me) return "You";
  return state.names[id] || "Parent";
}

function timeOf(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

function entryById(id) { return state.entries.find(e => e.id === id) || state.look?.list.find(e => e.id === id); }

function tagHtml(e) {
  const level = e.type === "health" ? ` ${esc(e.what)}` : "";
  const label = TYPES[e.type]?.label || e.type;
  return `<span class="tag ${esc(e.type)}${level}">${esc(label)}</span>`;
}

function whatText(e) { return e.type === "health" ? `${HEALTH[e.what] || e.what}` : e.what; }

// Redraws a region but keeps the cursor where it was.
function patch(el, html) {
  const active = document.activeElement;
  const id = active && el.contains(active) ? active.id : null;
  let sel = null;
  try { sel = id && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch { /* not a text field */ }
  el.innerHTML = html;
  if (id) {
    const next = document.getElementById(id);
    if (next) {
      next.focus({ preventScroll: true });
      if (sel) { try { next.setSelectionRange(sel[0], sel[1]); } catch { /* not a text field */ } }
    }
  }
}

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function onWriteError(e) {
  if (e?.code === "invalid_argument") {
    state.canWrite = false;
    render();
    toast("You can read the diary but not add to it. Ask whoever shared it to make you a Contributor.");
  } else if (e?.code === "quota_exceeded") {
    toast("The diary is full. Download a copy and remove old chats to make room.");
  } else {
    toast("Couldn't save. Check your connection and try again.");
  }
}

function resolveNames(ids) {
  if (!state.diary) return;
  const missing = [...new Set(ids)].filter(id => id && id !== state.diary.me && !(id in state.names));
  if (!missing.length) return;
  state.diary.names(missing).then(map => {
    state.names = { ...map };
    renderMessages();
    renderNotes();
    renderEntries();
  });
}

// ─── Top bar and screen switch ───────────────────────────────────────────

function renderTop() {
  const age = ageText(state.profile.dob, state.today);
  $("ageLine").textContent = age ? `${name()} is ${age}` : "";
  document.querySelector(".brand h1").textContent = `${name()} Wellness`;
  const talk = state.view === "talk";
  $("talkView").hidden = !talk;
  $("lookView").hidden = talk;
  for (const [tab, on] of [[$("tabTalk"), talk], [$("tabLook"), !talk]]) {
    if (on) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  }
  $("chatsBtn").style.visibility = talk ? "visible" : "hidden";
}

function readHash() {
  state.view = location.hash === "#look-back" ? "look" : "talk";
  closeDrawer();
  renderTop();
}

// ─── Talk: past chats ────────────────────────────────────────────────────

function renderChatList() {
  const days = [{ day: state.today, firstLine: "" }, ...state.chatList.filter(c => c.day !== state.today)];
  const today = state.chatList.find(c => c.day === state.today);
  if (today) days[0] = today;
  patch($("chatItems"), days.map(c => `
    <li><button type="button" data-act="open-day" data-day="${esc(c.day)}" ${c.day === state.day ? 'aria-current="true"' : ""}>
      <span class="when">${esc(dayLabel(c.day, state.today))}</span>
      <span class="first">${esc(c.firstLine || (c.day === state.today ? "Start today's chat" : ""))}</span>
    </button></li>`).join(""));
}

function openDay(day) {
  if (stopChat) stopChat();
  state.day = day;
  state.messages = [];
  state.failed = null;
  stopChat = state.diary.watchChat(day, (list) => {
    state.messages = list;
    resolveNames(list.map(m => m.by));
    renderMessages();
  }, () => toast("Couldn't load this chat. Reload the page."));
  closeDrawer();
  render();
}

function openDrawer() { $("chatPane").classList.add("open"); $("scrim").hidden = false; $("chatsBtn").setAttribute("aria-expanded", "true"); }
function closeDrawer() { $("chatPane").classList.remove("open"); $("scrim").hidden = true; $("chatsBtn").setAttribute("aria-expanded", "false"); }

// ─── Talk: the conversation ──────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function welcomeHtml() {
  const examples = [
    `${name()} was well all day and ate properly`,
    "Cough at night, gave steam before bed",
    "Weight 12.4 kg at the clinic today",
  ];
  const needsProfile = !state.profile.dob;
  return `<div class="welcome">
    <h2>${greeting()}. How was ${esc(name())} today?</h2>
    <p>Write it the way you'd text each other. Claude will reply and offer to note things in the diary. Nothing is saved until you tap Save all.</p>
    ${state.canWrite && state.sample ? `<div class="examples">${examples.map(x => `<button type="button" class="chip" data-act="prefill" data-text="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
    ${needsProfile && state.canWrite ? `<p><button type="button" class="link-btn" data-act="settings">Add her birth date and routine</button> so warnings and ideas fit her age.</p>` : ""}
  </div>`;
}

function warningHtml(list) {
  if (!list?.length) return "";
  const phone = state.profile.doctorPhone;
  const doctor = state.profile.doctorName || "the doctor";
  return `<div class="warning" role="alert">
    <strong>Please call ${esc(doctor)} now.</strong>
    <ul>${list.map(w => `<li>${esc((WARNINGS[w.id] || (() => ""))(w.detail))}</li>`).join("")}</ul>
    ${phone ? `<span>${esc(doctor)}: <span class="phone">${esc(phone)}</span></span>` : ""}
  </div>`;
}

function draftFor(m) {
  if (!state.drafts[m.id]) state.drafts[m.id] = (m.proposal || []).map(e => ({ ...e }));
  return state.drafts[m.id];
}

function noteRowHtml(msgId, e, i) {
  const base = `d-${msgId}-${i}`;
  const typeOptions = Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  const what = e.type === "health"
    ? `<select id="${base}-what" data-draft="${msgId}" data-i="${i}" data-f="what" aria-label="How she is">${Object.entries(HEALTH).map(([k, l]) => `<option value="${k}" ${k === e.what ? "selected" : ""}>${l}</option>`).join("")}</select>`
    : `<input id="${base}-what" data-draft="${msgId}" data-i="${i}" data-f="what" value="${esc(e.what)}" aria-label="What">`;
  return `<div class="note-row">
    <select id="${base}-type" data-draft="${msgId}" data-i="${i}" data-f="type" aria-label="Type">${typeOptions}</select>
    ${what}
    <input class="f-details" id="${base}-details" data-draft="${msgId}" data-i="${i}" data-f="details" value="${esc(e.details)}" placeholder="Details" aria-label="Details">
    <input class="f-date" type="date" id="${base}-date" data-draft="${msgId}" data-i="${i}" data-f="date" value="${esc(e.date)}" max="${state.today}" aria-label="Date">
    <button type="button" class="icon-btn remove" data-act="draft-remove" data-msg="${msgId}" data-i="${i}" aria-label="Don't note this"><svg><use href="#i-close"/></svg></button>
  </div>`;
}

function cardHtml(m) {
  if (m.proposal?.length && state.canWrite) {
    const rows = draftFor(m);
    if (!rows.length) {
      return `<div class="note-card"><footer><span>Nothing left to note.</span><button type="button" class="btn quiet" data-act="skip" data-msg="${m.id}">Done</button></footer></div>`;
    }
    return `<div class="note-card">
      <header><h3>Note in the diary?</h3><span>Fix anything first</span></header>
      ${rows.map((e, i) => noteRowHtml(m.id, e, i)).join("")}
      <footer>
        <button type="button" class="btn quiet" data-act="skip" data-msg="${m.id}">Don't save</button>
        <button type="button" class="btn primary" data-act="save-all" data-msg="${m.id}">Save ${rows.length === 1 ? "it" : `all ${rows.length}`}</button>
      </footer>
    </div>`;
  }
  if (m.proposal?.length) {
    return `<div class="note-card"><header><h3>Suggested for the diary</h3></header><ul class="saved-list">${m.proposal.map(e => `<li>${tagHtml(e)} ${esc(whatText(e))}</li>`).join("")}</ul></div>`;
  }
  if (m.savedEntryIds?.length) {
    const saved = m.savedEntryIds.map(entryById).filter(Boolean);
    return `<div class="note-card">
      <div class="saved-head">Saved to the diary</div>
      <ul class="saved-list">${saved.length ? saved.map(e => `<li>${tagHtml(e)} <span>${esc(whatText(e))}${e.details ? ` · ${esc(e.details)}` : ""}</span></li>`).join("") : "<li>These entries were later removed.</li>"}</ul>
    </div>`;
  }
  return "";
}

function messageHtml(m) {
  if (m.role === "user") {
    return `<div class="msg user"><div class="bubble">${esc(m.text)}</div><span class="who">${esc(who(m.by))} · ${esc(timeOf(m.createdAt))}</span></div>`;
  }
  return `<div class="msg assistant">
    ${warningHtml(m.warnings)}
    <div class="text">${esc(m.text)}</div>
    ${m.dose ? `<div class="dose-note">${esc(m.dose)}</div>` : ""}
    ${cardHtml(m)}
    ${m.saw ? `<details class="saw"><summary>What Claude saw</summary><pre>${esc(m.saw)}</pre></details>` : ""}
  </div>`;
}

function renderMessages(forceScroll = false) {
  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const isToday = state.day === state.today;
  let html;
  if (state.loading) {
    html = `<div class="state"><h2>Opening the diary…</h2></div>`;
  } else if (state.problem) {
    html = `<div class="state"><h2>Sign in to open the diary</h2><p>${esc(name())}'s diary is kept in your claude.ai account. Open this page while signed in to claude.ai.</p></div>`;
  } else {
    html = state.messages.map(messageHtml).join("");
    if (!state.messages.length && isToday && !state.busy) html = welcomeHtml();
    if (!state.messages.length && !isToday) html = `<div class="empty">No messages on this day.</div>`;
    if (state.busy) {
      html += `<div class="msg assistant">${warningHtml(state.liveWarnings)}<div class="text${state.streamText ? "" : " thinking"}" id="streamText">${esc(state.streamText || "Thinking…")}</div></div>`;
    }
    if (state.failed && !state.busy) {
      html += `<div class="msg assistant"><p class="error">${esc(state.failed.error)} <button type="button" class="btn" data-act="retry">Try again</button></p></div>`;
    }
  }
  patch(box, html);
  if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
}

function renderDayBar() {
  const isToday = state.day === state.today;
  const [y, m, d] = state.day.split("-").map(Number);
  const long = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  $("dayBar").innerHTML = `<span><strong>${esc(isToday ? "Today" : dayLabel(state.day, state.today))}</strong> · ${esc(long)}</span>`
    + (isToday ? "" : `<button type="button" class="link-btn" data-act="open-day" data-day="${state.today}">Back to today</button>`);
}

function renderComposer() {
  const isToday = state.day === state.today;
  const area = $("composerArea");
  const form = $("composer");
  let note = area.querySelector(".past-note");
  if (!note) { note = document.createElement("div"); note.className = "past-note"; area.prepend(note); }

  const showForm = isToday && state.canWrite && !state.loading && !state.problem;
  form.hidden = !showForm;
  note.hidden = showForm;
  if (!showForm) {
    note.innerHTML = state.loading || state.problem ? ""
      : !state.canWrite ? `You can read ${esc(name())}'s diary but not add to it.`
      : `This is the chat from ${esc(dayLabel(state.day, state.today))}. <button type="button" class="link-btn" data-act="open-day" data-day="${state.today}">Back to today</button>`;
  }

  $("composerText").placeholder = `How was ${name()} today?`;
  $("sendBtn").hidden = state.busy;
  $("stopBtn").hidden = !state.busy;
  $("sendBtn").disabled = !state.sample || !$("composerText").value.trim();
  $("footnote").textContent = state.sample || state.loading
    ? `${name()} Wellness keeps a diary and shares ideas. It is not a doctor.`
    : "Claude can't answer on this view. You can still add entries yourself in Look back.";

  const ideas = showForm && !state.busy ? ideasForToday({ profile: state.profile, entries: state.entries, now: new Date() }) : [];
  patch($("ideas"), ideas.map(i => `<button type="button" class="chip" data-act="prefill" data-text="${esc(i.prefill)}">${esc(i.label)}</button>`).join(""));
}

function growComposer() {
  const t = $("composerText");
  t.style.height = "auto";
  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  $("sendBtn").disabled = !state.sample || !t.value.trim();
}

// ─── Talk: sending a message ─────────────────────────────────────────────

async function send(text, { retry = false } = {}) {
  text = text.trim();
  if (!text || state.busy || !state.sample) return;
  state.today = dayKey();
  if (state.day !== state.today) openDay(state.today);
  const day = state.today;
  const history = state.messages.slice();

  state.failed = null;
  state.busy = true;
  state.streamText = "";
  state.liveWarnings = checkWarnings({ profile: state.profile, text, entries: state.entries, today: day });
  $("composerText").value = "";
  growComposer();
  render();
  renderMessages(true);

  try {
    if (!retry) {
      await state.diary.addMessage(day, { role: "user", text }, { isFirst: history.length === 0 });
    }
  } catch (e) {
    state.busy = false;
    $("composerText").value = text;
    onWriteError(e);
    render();
    return;
  }

  // On a retry, the message is already in the chat history.
  const past = retry ? history.slice(0, history.map(m => m.role).lastIndexOf("user")) : history;
  const { turns, saw } = buildTurns({ profile: state.profile, entries: state.entries, history: past, newText: text, today: day });
  state.controller = new AbortController();

  let raw;
  try {
    raw = await askClaude(state.sample, turns, {
      signal: state.controller.signal,
      onText: ({ text: t }) => {
        state.streamText = visiblePart(t);
        const el = $("streamText");
        if (el) { el.textContent = state.streamText || "Thinking…"; el.classList.toggle("thinking", !state.streamText); }
        const box = $("messages");
        if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
      },
    });
  } catch (e) {
    state.busy = false;
    state.failed = { text, error: errorText(e?.code) };
    if (e?.code === "cancelled" && e?.text) raw = e.text;     // keep what was written before Stop
    else { render(); renderMessages(true); return; }
  }

  const { reply, entries: proposed } = parseReply(raw, day);
  const warnings = checkWarnings({ profile: state.profile, text, proposed, entries: state.entries, today: day });
  const dose = doseNote({ text, entries: state.entries, profile: state.profile });
  try {
    await state.diary.addMessage(day, {
      role: "assistant",
      text: reply || "Noted.",
      proposal: proposed.length ? proposed : null,
      warnings,
      dose,
      saw,
    });
    state.failed = null;
  } catch (e) {
    onWriteError(e);
  }
  state.busy = false;
  state.streamText = "";
  state.liveWarnings = [];
  render();
  renderMessages(true);
}

async function saveAll(msgId) {
  const list = (state.drafts[msgId] || []).map(e => cleanEntry(e, state.today)).filter(Boolean);
  if (!list.length) return skip(msgId);
  try {
    const ids = await state.diary.addEntries(list, msgId);
    await state.diary.updateMessage(state.day, msgId, { proposal: null, savedEntryIds: ids });
    delete state.drafts[msgId];
    toast(list.length === 1 ? "Saved to the diary" : `Saved ${list.length} entries to the diary`);
  } catch (e) {
    onWriteError(e);
  }
}

async function skip(msgId) {
  try {
    await state.diary.updateMessage(state.day, msgId, { proposal: null, skipped: true });
    delete state.drafts[msgId];
  } catch (e) {
    onWriteError(e);
  }
}

// ─── Look back ───────────────────────────────────────────────────────────
// Four moves: pick a span, the app counts, Claude explains, you dig in.

function toDay(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }

// Entries from the start of the previous span (for the comparison) to the
// end of this one. Usually the live list already has them all.
function spanEntries() {
  const from = stepSpan(state.span, -1).from;
  const live = state.entries;
  const full = state.diary && live.length >= state.diary.LIVE_LIMIT;
  const oldest = live.length ? live[live.length - 1].date : "9999";
  if (!full || oldest < from) return live;
  if (state.range?.key === state.span.key) return state.range.list;
  loadRange(from);
  return null;
}

let rangeLoading = null;
function loadRange(from) {
  const key = state.span.key;
  if (rangeLoading === key) return;
  rangeLoading = key;
  state.diary.loadEntries(from, state.span.to).then(list => {
    rangeLoading = null;
    if (state.span.key === key) { state.range = { key, list: list.sort((a, b) => (a.date < b.date ? 1 : -1)) }; renderLook(); }
  }).catch(() => { rangeLoading = null; toast("Couldn't load this span. Reload the page."); });
}

let stopNotes = null;
function openSpan(span) {
  state.span = span;
  state.focus = null;
  state.notesError = null;
  state.range = null;
  state.notes = undefined;                 // undefined: still loading; null: none written yet
  if (stopNotes) stopNotes();
  if (state.diary) {
    stopNotes = state.diary.watchNotes(span.key, (n) => {
      state.notes = n;
      if (n?.writtenBy) resolveNames([n.writtenBy]);
      renderNotes();
    }, () => { state.notes = null; renderNotes(); });
  }
  renderLook();
}

function renderLook() {
  renderSpanBar();
  const list = state.loading ? null : spanEntries();
  if (!list) {
    state.look = null;
    $("numbers").innerHTML = `<div class="empty">${state.problem ? "Sign in to claude.ai to open the diary." : "Opening the diary…"}</div>`;
    for (const id of ["strip", "notes", "common"]) $(id).innerHTML = "";
    renderEntries();
    return;
  }
  const span = state.span;
  const cmp = comparisonSpan(span, state.today);
  state.look = {
    list,
    stats: countSpan(list, span, state.today),
    prev: countSpan(list, cmp.span, state.today),
    prevName: cmp.name,
    label: spanLabel(span, state.today),
  };
  renderNumbers();
  renderStrip();
  renderNotes();
  renderCommon();
  renderEntries();
}

function renderSpanBar() {
  for (const b of $("spanKinds").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.kind === state.span.kind));
  $("spanTitle").textContent = spanLabel(state.span, state.today);
  $("spanNext").disabled = state.span.to >= state.today;
}

// ── 2. Count: the app's own numbers ──────────────────────────────────────

function tile(value, label, delta, tone = "") {
  return `<div class="tile"><b>${value}</b><span class="label">${esc(label)}</span>${delta ? `<span class="delta ${tone}">${esc(delta)}</span>` : ""}</div>`;
}

function renderNumbers() {
  const { stats: s, prev: p, prevName } = state.look;
  const span = state.span;
  if (s.future) { $("numbers").innerHTML = `<div class="empty">This ${span.kind} hasn't started yet.</div>`; return; }
  const noPrev = p.entryCount === 0;
  const compare = (now, before, better) => {
    if (noPrev) return { text: "", tone: "" };
    const text = compareText(now, before, prevName);
    const diff = now - before;
    const tone = diff === 0 || !better ? "" : (better === "more" ? diff > 0 : diff < 0) ? "good" : "worse";
    return { text, tone };
  };
  const w = compare(s.days.well, p.days.well, "more");
  const u = compare(s.unwellDays, p.unwellDays, "fewer");
  const sp = compare(s.spells, p.spells, "fewer");
  const dr = compare(s.doctor, p.doctor, null);
  const longest = s.longest ? `Longest ${s.longest.days} day${s.longest.days === 1 ? "" : "s"}` : "";
  $("numbers").innerHTML = `
    <div class="tiles">
      ${tile(s.days.well, "Well days", w.text, w.tone)}
      ${tile(s.unwellDays, "Off or sick days", u.text, u.tone)}
      ${tile(s.spells, s.spells === 1 ? "Sick spell" : "Sick spells", [longest, sp.text].filter(Boolean).join(" · "), sp.tone)}
      ${tile(s.doctor, s.doctor === 1 ? "Doctor visit" : "Doctor visits", dr.text)}
    </div>
    <p class="counted">Counted by the app from ${s.days.total} day${s.days.total === 1 ? "" : "s"}${s.inProgress ? " so far" : ""}.${s.days.none ? ` ${s.days.none} ${s.days.none === 1 ? "day has" : "days have"} nothing noted about how she was.` : ""}${noPrev ? ` Nothing was noted in ${esc(prevName.replace(" so far", ""))} to compare with.` : ""}</p>`;
}

const LEVEL_NAME = { well: "Well", off: "A bit off", sick: "Sick", none: "Not noted" };

function dayCell(d, levels, small) {
  const future = d > state.today;
  const level = future ? "future" : levels[d] || "none";
  const label = `${dayLabel(d, state.today)}: ${future ? "still to come" : LEVEL_NAME[level]}`;
  return `<button type="button" class="day lv-${level}${d === state.today ? " is-today" : ""}" data-act="day" data-day="${d}" ${future ? "disabled" : ""} aria-label="${esc(label)}" title="${esc(label)}">${small ? "" : `<span>${toDay(d).getDate()}</span>`}</button>`;
}

function renderStrip() {
  const { stats: s } = state.look;
  const span = state.span;
  let grid;
  if (span.kind === "year") {
    const year = Number(span.from.slice(0, 4));
    grid = `<div class="year-grid">${Array.from({ length: 12 }, (_, m) => {
      const days = new Date(year, m + 1, 0).getDate();
      const cells = Array.from({ length: days }, (_, i) => dayCell(dayKey(new Date(year, m, i + 1)), s.levels, true)).join("");
      return `<div class="year-row"><span class="year-m">${toDay(`${year}-${String(m + 1).padStart(2, "0")}-01`).toLocaleDateString("en-GB", { month: "short" })}</span><div class="year-days">${cells}</div></div>`;
    }).join("")}</div>`;
  } else {
    const heads = ["M", "T", "W", "T", "F", "S", "S"].map(h => `<span class="dow">${h}</span>`).join("");
    const offset = (toDay(span.from).getDay() + 6) % 7;
    const cells = [];
    for (let d = span.from; d <= span.to; d = addDays(d, 1)) cells.push(dayCell(d, s.levels, false));
    grid = `<div class="cal ${span.kind}">${heads}${"<span></span>".repeat(offset)}${cells.join("")}</div>`;
  }
  $("strip").innerHTML = `
    ${grid}
    <div class="legend">
      <span><i class="lv-well"></i>Well</span><span><i class="lv-off"></i>A bit off</span><span><i class="lv-sick"></i>Sick</span><span><i class="lv-none"></i>Not noted</span>
    </div>
    <p class="legend-note">A day with a symptom but no "How she is" counts as a bit off. Tap a day to see its entries.</p>`;
}

// ── 3. Explain: Claude's notes ───────────────────────────────────────────

function whenText(iso) {
  if (!iso) return "";
  const day = dayKey(new Date(iso));
  return day === state.today ? `today at ${timeOf(iso)}` : dayLabel(day, state.today);
}

function notesBody(n) {
  const live = new Set(state.look.list.map(e => e.id));
  return NOTE_SECTIONS.filter(sec => n.body?.[sec.key]?.length).map(sec => `
    <div class="note-sec ${sec.key}">
      <h3>${esc(sec.title)}</h3>
      <ul>${n.body[sec.key].map((p, i) => {
        const left = p.see.filter(id => live.has(id)).length;
        const link = left
          ? `<button type="button" class="see" data-act="see" data-sec="${sec.key}" data-i="${i}">see ${left}</button>`
          : `<span class="see gone">entries removed</span>`;
        return `<li><span>${esc(p.text)}</span> ${link}</li>`;
      }).join("")}</ul>
    </div>`).join("");
}

function renderNotes() {
  if (!state.look) return;
  const { stats, label } = state.look;
  const n = state.notes;
  const canAsk = state.canWrite && !!state.sample;
  let inner;

  if (state.notesBusy) {
    inner = `<p class="writing">Claude is reading ${stats.entryCount} ${stats.entryCount === 1 ? "entry" : "entries"} for ${esc(label)}…</p>
      <button type="button" class="btn" data-act="notes-stop"><svg><use href="#i-stop"/></svg>Stop</button>`;
  } else if (n === undefined) {
    inner = `<p class="muted">Loading Claude's notes…</p>`;
  } else if (n) {
    const changed = changedSince(state.look.list, state.span, n.writtenAt);
    const by = n.writtenBy ? ` by ${who(n.writtenBy) === "You" ? "you" : who(n.writtenBy)}` : "";
    inner = `${notesBody(n)}
      <div class="notes-foot">
        <span>Written ${esc(whenText(n.writtenAt))}${esc(by)}${changed ? ` · <strong>${changed} new or changed ${changed === 1 ? "entry" : "entries"} since</strong>` : ""}</span>
        ${canAsk ? `<button type="button" class="btn${changed ? " primary" : ""}" data-act="notes-write">Rewrite</button>` : ""}
      </div>
      ${n.saw ? `<details class="saw"><summary>What Claude saw</summary><pre>${esc(n.saw)}</pre></details>` : ""}`;
  } else if (stats.future) {
    inner = `<p class="muted">Nothing to read yet.</p>`;
  } else if (!stats.entryCount) {
    inner = `<p class="muted">Nothing is noted in ${esc(label)} yet, so there's nothing for Claude to read.</p>`;
  } else {
    const thin = stats.entryCount < 5 ? `<p class="thin">Only ${stats.entryCount} ${stats.entryCount === 1 ? "entry" : "entries"} in ${esc(label)}, so the notes will be short.</p>` : "";
    const why = !state.sample ? "Claude can't write notes on this view." : !state.canWrite ? "You can read notes here but not ask for new ones." : "";
    inner = `<p>Claude will read the ${stats.entryCount} ${stats.entryCount === 1 ? "entry" : "entries"} for ${esc(label)} and the numbers above. It writes how ${esc(name())} is now, what's working and what to try next. Every point links to the entries behind it.</p>
      ${thin}
      ${why ? `<p class="muted">${esc(why)}</p>` : `<button type="button" class="btn primary" data-act="notes-write">Write Claude's notes</button>`}`;
  }

  $("notes").innerHTML = `
    <div class="notes-head"><h2>Claude's notes</h2>${state.look.stats.entryCount ? `<button type="button" class="link-btn" data-act="open-all">Open all ${esc(label)} entries</button>` : ""}</div>
    ${inner}
    ${state.notesError ? `<p class="error">${esc(state.notesError)}</p>` : ""}`;
}

async function writeNotesNow() {
  if (state.notesBusy || !state.sample || !state.look) return;
  const span = state.span;
  const { prompt, refs, saw, stats } = notesRequest({ profile: state.profile, span, entries: state.look.list, today: state.today });
  state.notesBusy = true;
  state.notesError = null;
  state.notesController = new AbortController();
  renderNotes();

  let body = null;
  try {
    const raw = await writeNotes(state.sample, prompt, { signal: state.notesController.signal });
    body = readNotes(raw, refs);
    if (!body) state.notesError = "Claude's notes didn't point at any entries, so the app left them out. Try again.";
  } catch (e) {
    if (e?.code !== "cancelled") state.notesError = errorText(e?.code);
  }
  if (body && state.span.key === span.key) {
    try {
      await state.diary.saveNotes(span.key, { span: span.key, kind: span.kind, from: span.from, to: span.to, body, saw, entryCount: stats.entryCount });
    } catch (e) {
      onWriteError(e);
    }
  }
  state.notesBusy = false;
  renderNotes();
}

// ── Most common symptoms and care ────────────────────────────────────────

function renderCommon() {
  const { stats } = state.look;
  if (!stats.entryCount) { $("common").innerHTML = ""; return; }
  const col = (title, type, items) => {
    const top = items[0]?.count || 1;
    return `<div class="common-col"><h3>${esc(title)}</h3>${items.length ? items.map((g, i) => `
      <button type="button" class="common-row" data-act="group" data-type="${type}" data-i="${i}">
        <span class="common-label">${esc(g.label)}</span>
        <span class="bar" style="--w:${Math.round((g.count / top) * 100)}%"></span>
        <span class="count">${g.count}</span>
      </button>`).join("") : `<p class="muted">None noted.</p>`}</div>`;
  };
  $("common").innerHTML = col("Most common symptoms", "symptoms", stats.symptoms) + col("Care given most", "care", stats.care);
}

// ── 4. Dig in: the entries behind the numbers and notes ──────────────────

function focusOn(title, ids) {
  state.focus = { title, ids };
  state.filter = "all";
  renderEntries();
  $("diarySection").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function editCardHtml(e, isNew) {
  const typeOptions = Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  const what = e.type === "health"
    ? `<select id="eWhat" data-edit="what">${Object.entries(HEALTH).map(([k, l]) => `<option value="${k}" ${k === e.what ? "selected" : ""}>${l}</option>`).join("")}</select>`
    : `<input id="eWhat" data-edit="what" value="${esc(e.what)}" placeholder="${esc(TYPES[e.type]?.hint || "")}">`;
  return `<div class="edit-card">
    <div class="fields">
      <label>Type <select id="eType" data-edit="type">${typeOptions}</select></label>
      <label class="f-what">What ${what}</label>
      <label>Date <input id="eDate" type="date" data-edit="date" value="${esc(e.date)}" max="${state.today}"></label>
      <label class="wide">Details <input id="eDetails" data-edit="details" value="${esc(e.details)}" placeholder="Anything else worth remembering"></label>
    </div>
    <div class="row">
      <button type="button" class="btn quiet" data-act="edit-cancel">Cancel</button>
      <button type="button" class="btn primary" data-act="edit-save">${isNew ? "Add to diary" : "Save changes"}</button>
    </div>
  </div>`;
}

function entryHtml(e) {
  if (state.edit && state.edit.id === e.id) return editCardHtml(state.edit, false);
  const actions = !state.canWrite ? "" : state.confirmDelete === e.id
    ? `<span class="confirm">Remove? <button type="button" class="btn danger" data-act="del-yes" data-id="${e.id}">Remove</button><button type="button" class="btn quiet" data-act="del-no">Keep</button></span>`
    : `<button type="button" class="link-btn" data-act="edit" data-id="${e.id}">Edit</button><button type="button" class="link-btn" data-act="del" data-id="${e.id}">Remove</button>`;
  const by = e.by ? `Added by ${who(e.by) === "You" ? "you" : who(e.by)}${e.fromMessage ? " from a chat" : ""}` : "";
  return `<div class="entry">
    ${tagHtml(e)}
    <div>
      <div class="what">${esc(whatText(e))}</div>
      ${e.details ? `<div class="details">${esc(e.details)}</div>` : ""}
      ${by ? `<div class="by">${esc(by)}</div>` : ""}
    </div>
    <div class="actions">${actions}</div>
  </div>`;
}

function renderEntries() {
  const look = state.look;
  const label = look?.label || spanLabel(state.span, state.today);
  $("diaryTitle").textContent = `Entries · ${label}`;
  $("addEntryBtn").hidden = !state.canWrite || !look || !!(state.edit && state.edit.id === "new");
  patch($("newEntry"), state.edit && state.edit.id === "new" ? editCardHtml(state.edit, true) : "");

  if (!look) { patch($("filters"), ""); $("focusBar").innerHTML = ""; patch($("entryList"), ""); return; }

  const inSpan = look.list.filter(e => e.date >= state.span.from && e.date <= state.span.to);
  const focus = state.focus;
  $("focusBar").innerHTML = focus
    ? `<div class="focus-bar"><span><strong>${focus.ids.length} ${focus.ids.length === 1 ? "entry" : "entries"}</strong> · ${esc(focus.title)}</span><button type="button" class="link-btn" data-act="unfocus">Show all ${esc(label)} entries</button></div>`
    : "";

  const counts = { all: inSpan.length };
  for (const e of inSpan) counts[e.type] = (counts[e.type] || 0) + 1;
  patch($("filters"), focus ? "" : [["all", "All"], ...Object.entries(TYPES).map(([k, t]) => [k, t.label])]
    .map(([k, l]) => `<button type="button" class="chip" data-act="filter" data-f="${k}" aria-pressed="${state.filter === k}">${esc(l)}${counts[k] ? ` · ${counts[k]}` : ""}</button>`).join(""));

  const ids = focus ? new Set(focus.ids) : null;
  const list = focus ? look.list.filter(e => ids.has(e.id)) : inSpan.filter(e => state.filter === "all" || e.type === state.filter);
  if (!list.length) {
    patch($("entryList"), `<div class="empty">${focus ? "These entries were removed." : inSpan.length ? "Nothing of this type here." : `Nothing noted in ${esc(label)}. Tell Claude about ${esc(name())}'s day in Talk, or add an entry here.`}</div>`);
    return;
  }
  const byDay = new Map();
  for (const e of list) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  patch($("entryList"), [...byDay.entries()].map(([day, items]) => `
    <section class="day-group"><h3>${esc(dayLabel(day, state.today))}</h3>${items.map(entryHtml).join("")}</section>`).join(""));
}

// After a change, a span read month by month is read again.
function afterDiaryChange() {
  if (state.range) state.range = null;
  renderLook();
}

async function saveEdit() {
  const clean = cleanEntry(state.edit, state.today);
  if (!clean) { toast("Say what happened before saving."); $("eWhat")?.focus(); return; }
  try {
    if (state.edit.id === "new") { await state.diary.addEntries([clean]); toast("Added to the diary"); }
    else { await state.diary.updateEntry(state.edit.id, clean); toast("Saved"); }
    state.edit = null;
    afterDiaryChange();
  } catch (e) {
    onWriteError(e);
  }
}

// ─── About Divisha ───────────────────────────────────────────────────────

let routineDraft = [];

function renderRoutine() {
  $("routineRows").innerHTML = routineDraft.map((r, i) => `
    <div class="routine-row">
      <input id="r-${i}-what" data-routine="${i}" data-f="what" value="${esc(r.what)}" placeholder="Kadha" aria-label="Routine item">
      <select id="r-${i}-often" data-routine="${i}" data-f="often" aria-label="How often">
        <option value="daily" ${r.often !== "weekly" ? "selected" : ""}>Every day</option>
        <option value="weekly" ${r.often === "weekly" ? "selected" : ""}>Every week</option>
      </select>
      <button type="button" class="icon-btn" data-act="routine-remove" data-i="${i}" aria-label="Remove"><svg><use href="#i-close"/></svg></button>
    </div>`).join("");
}

function openSettings() {
  const p = state.profile;
  $("sName").value = p.name || "";
  $("sDob").value = p.dob || "";
  $("sDob").max = state.today;
  $("sAllergies").value = p.allergies || "";
  $("sDoctor").value = p.doctorName || "";
  $("sPhone").value = p.doctorPhone || "";
  routineDraft = (p.routine || []).map(r => ({ ...r }));
  if (!routineDraft.length) routineDraft.push({ what: "", often: "daily" });
  renderRoutine();
  for (const el of $("settingsForm").querySelectorAll("input, select, #addRoutineBtn, #settingsSave")) el.disabled = !state.canWrite;
  $("settings").showModal();
}

async function saveSettings() {
  const profile = {
    name: $("sName").value.trim() || "Divisha",
    dob: $("sDob").value,
    allergies: $("sAllergies").value.trim(),
    doctorName: $("sDoctor").value.trim(),
    doctorPhone: $("sPhone").value.trim(),
    routine: routineDraft.filter(r => r.what.trim()).map(r => ({ what: r.what.trim(), often: r.often || "daily" })),
  };
  try {
    await state.diary.saveProfile(profile);
    $("settings").close();
    toast("Saved");
  } catch (e) {
    onWriteError(e);
  }
}

// ─── Everything ──────────────────────────────────────────────────────────

function render() {
  renderTop();
  renderChatList();
  renderDayBar();
  renderMessages();
  renderComposer();
  renderLook();
}

function wire() {
  window.addEventListener("hashchange", readHash);

  $("chatsBtn").addEventListener("click", openDrawer);
  $("closeChatsBtn").addEventListener("click", closeDrawer);
  $("scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", () => $("settings").close());
  $("settingsCancel").addEventListener("click", () => $("settings").close());
  $("settingsForm").addEventListener("submit", (e) => { e.preventDefault(); saveSettings(); });
  $("addRoutineBtn").addEventListener("click", () => { routineDraft.push({ what: "", often: "daily" }); renderRoutine(); $(`r-${routineDraft.length - 1}-what`).focus(); });

  $("composer").addEventListener("submit", (e) => { e.preventDefault(); send($("composerText").value); });
  $("composerText").addEventListener("input", growComposer);
  $("composerText").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($("composerText").value); }
  });
  $("stopBtn").addEventListener("click", () => state.controller?.abort());

  $("spanPrev").addEventListener("click", () => openSpan(stepSpan(state.span, -1)));
  $("spanNext").addEventListener("click", () => openSpan(stepSpan(state.span, 1)));

  $("addEntryBtn").addEventListener("click", () => {
    state.edit = { id: "new", type: "health", what: "well", details: "", date: state.today };
    renderEntries();
    $("eType")?.focus();
  });

  // Typing into a card, an edit form or the routine list
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset.draft) {
      const row = state.drafts[t.dataset.draft]?.[Number(t.dataset.i)];
      if (row) row[t.dataset.f] = t.value;
    } else if (t.dataset.edit && state.edit) {
      state.edit[t.dataset.edit] = t.value;
    } else if (t.dataset.routine) {
      routineDraft[Number(t.dataset.routine)][t.dataset.f] = t.value;
    }
  });
  // Changing the type swaps the "what" field (How she is uses a fixed list)
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.draft && t.dataset.f === "type") {
      const row = state.drafts[t.dataset.draft]?.[Number(t.dataset.i)];
      if (row) { row.type = t.value; row.what = t.value === "health" ? "well" : (HEALTH[row.what] ? "" : row.what); renderMessages(); }
    } else if (t.dataset.edit === "type" && state.edit) {
      state.edit.what = t.value === "health" ? "well" : (HEALTH[state.edit.what] ? "" : state.edit.what);
      renderEntries();
    }
  });

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "open-day") openDay(b.dataset.day);
    else if (act === "prefill") { const t = $("composerText"); t.value = b.dataset.text; growComposer(); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    else if (act === "settings") openSettings();
    else if (act === "retry" && state.failed) send(state.failed.text, { retry: true });
    else if (act === "save-all") saveAll(b.dataset.msg);
    else if (act === "skip") skip(b.dataset.msg);
    else if (act === "draft-remove") { state.drafts[b.dataset.msg]?.splice(Number(b.dataset.i), 1); renderMessages(); }
    else if (act === "filter") { state.filter = b.dataset.f; renderEntries(); }
    else if (act === "span-kind") {
      const s = state.span;
      const anchor = s.from <= state.today && state.today <= s.to ? state.today : s.from;
      openSpan(makeSpan(b.dataset.kind, anchor));
    }
    else if (act === "notes-write") writeNotesNow();
    else if (act === "notes-stop") state.notesController?.abort();
    else if (act === "see") {
      const p = state.notes?.body?.[b.dataset.sec]?.[Number(b.dataset.i)];
      if (p) focusOn(`behind “${p.text.length > 70 ? p.text.slice(0, 68) + "…" : p.text}”`, p.see);
    }
    else if (act === "day") {
      const d = b.dataset.day;
      focusOn(`on ${dayLabel(d, state.today)}`, state.look.list.filter(e => e.date === d).map(e => e.id));
    }
    else if (act === "group") {
      const g = state.look.stats[b.dataset.type][Number(b.dataset.i)];
      if (g) focusOn(`${g.label}`, g.ids);
    }
    else if (act === "open-all" || act === "unfocus") {
      state.focus = null;
      state.filter = "all";
      renderEntries();
      if (act === "open-all") $("diarySection").scrollIntoView({ block: "start" });
    }
    else if (act === "edit") { const e = entryById(b.dataset.id); state.edit = { ...e }; state.confirmDelete = null; renderEntries(); $("eWhat")?.focus(); }
    else if (act === "edit-cancel") { state.edit = null; renderEntries(); }
    else if (act === "edit-save") saveEdit();
    else if (act === "del") { state.confirmDelete = b.dataset.id; renderEntries(); }
    else if (act === "del-no") { state.confirmDelete = null; renderEntries(); }
    else if (act === "del-yes") {
      state.diary.deleteEntry(b.dataset.id).then(() => { toast("Removed from the diary"); afterDiaryChange(); }).catch(onWriteError);
      state.confirmDelete = null;
    }
    else if (act === "routine-remove") { routineDraft.splice(Number(b.dataset.i), 1); renderRoutine(); }
  });
}

async function start() {
  wire();
  readHash();
  render();

  const diary = await openDiary();
  state.loading = false;
  if (!diary) { state.problem = "signed-out"; render(); return; }
  state.diary = diary;
  state.canWrite = diary.canWrite;
  render();

  window.claude.use("sample").then(s => { state.sample = s; renderComposer(); renderNotes(); });

  diary.watchProfile((p) => { state.profile = p || {}; render(); }, () => toast("Couldn't load About Divisha. Reload the page."));
  diary.watchEntries((list) => {
    state.entries = list;
    resolveNames(list.map(e => e.by));
    renderMessages();
    renderComposer();
    renderLook();
  }, () => toast("Couldn't load the diary. Reload the page."));
  diary.watchChatList((list) => { state.chatList = list; renderChatList(); }, () => {});
  openDay(state.today);
  openSpan(state.span);
}

start();
