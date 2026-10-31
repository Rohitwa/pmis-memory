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
  readableDiary, backupFile, copyFileNames,
  REPEATS, cleanSchedule, scheduleLine,
} from "./helper.js";

const $ = (id) => document.getElementById(id);

const state = {
  diary: null,
  sample: null,
  downloads: null,
  online: navigator.onLine !== false,
  loading: true,
  problem: null,            // "signed-out" when the diary can't open
  canWrite: true,
  profile: {},
  entries: [],
  chatList: [],
  messages: [],
  schedules: [],
  documents: [],
  today: dayKey(),
  day: dayKey(),            // which day's chat is open
  view: "talk",             // talk, docs or look
  busy: false,              // Claude is answering
  controller: null,
  streamText: "",
  liveWarnings: [],
  failed: null,             // { text, error } when Claude couldn't answer
  drafts: {},               // edits to a "note this down?" card, by message id
  names: {},
  // Documents
  docOpen: null,            // the id of the document being shown
  docForm: null,            // { id: "new" or a document id, title, brief, date, file, busy, status }
  docConfirmDelete: false,
  // Time-based analysis
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
    renderDocs();
  });
}

// ─── Top bar and the three sections ──────────────────────────────────────

const VIEWS = { talk: "talkView", docs: "docsView", look: "lookView" };

function renderTop() {
  const age = ageText(state.profile.dob, state.today);
  $("ageLine").textContent = age ? `${name()} is ${age}` : "";
  document.querySelector(".brand h1").textContent = `${name()} Wellness`;
  for (const [view, id] of Object.entries(VIEWS)) $(id).hidden = state.view !== view;
  for (const a of document.querySelectorAll(".sections a")) {
    if (a.dataset.view === state.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  $("docCount").textContent = state.documents.length || "";
}

// Talk is the default. #documents and #analysis open the other two
// (#look-back, the old name, still works).
function readHash() {
  const h = location.hash;
  state.view = h === "#documents" ? "docs" : h === "#analysis" || h === "#look-back" ? "look" : "talk";
  closeDrawer();
  renderTop();
  renderChatList();
}

// ─── Talk: past chats ────────────────────────────────────────────────────

function renderChatList() {
  const days = [{ day: state.today, firstLine: "" }, ...state.chatList.filter(c => c.day !== state.today)];
  const today = state.chatList.find(c => c.day === state.today);
  if (today) days[0] = today;
  patch($("chatItems"), days.map(c => `
    <li><button type="button" data-act="open-day" data-day="${esc(c.day)}" ${c.day === state.day && state.view === "talk" ? 'aria-current="true"' : ""}>
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

// ─── The left pane ───────────────────────────────────────────────────────
// Open by default, like ChatGPT's sidebar. The top-left button collapses it,
// and this device remembers. On a phone it's a menu that slides in instead.

const phoneWidth = matchMedia("(max-width: 599px)");

function paneCollapsed() { return $("mainArea").classList.contains("collapsed"); }

function setPaneCollapsed(collapsed) {
  $("mainArea").classList.toggle("collapsed", collapsed);
  try { localStorage.setItem("divisha-pane", collapsed ? "closed" : "open"); } catch { /* storage off: just don't remember */ }
  updatePaneButton();
}

function updatePaneButton() {
  const open = phoneWidth.matches ? $("chatPane").classList.contains("open") : !paneCollapsed();
  $("chatsBtn").setAttribute("aria-expanded", String(open));
  $("chatsBtn").setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar");
}

function togglePane() {
  if (phoneWidth.matches) { if ($("chatPane").classList.contains("open")) closeDrawer(); else openDrawer(); }
  else setPaneCollapsed(!paneCollapsed());
}

function openDrawer() { $("chatPane").classList.add("open"); $("scrim").hidden = false; updatePaneButton(); }
function closeDrawer() { $("chatPane").classList.remove("open"); $("scrim").hidden = true; updatePaneButton(); }

// ─── Talk: the conversation ──────────────────────────────────────────────

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
  if (!state.drafts[m.id]) {
    state.drafts[m.id] = {
      entries: (m.proposal || []).map(e => ({ ...e })),
      schedules: (m.proposedSchedules || []).map(x => ({ ...x })),
    };
  }
  return state.drafts[m.id];
}

function noteRowHtml(msgId, e, i) {
  const base = `d-${msgId}-e${i}`;
  const attrs = (f) => `data-draft="${msgId}" data-g="entries" data-i="${i}" data-f="${f}"`;
  const typeOptions = Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  const what = e.type === "health"
    ? `<select id="${base}-what" ${attrs("what")} aria-label="How she is">${Object.entries(HEALTH).map(([k, l]) => `<option value="${k}" ${k === e.what ? "selected" : ""}>${l}</option>`).join("")}</select>`
    : `<input id="${base}-what" ${attrs("what")} value="${esc(e.what)}" aria-label="What">`;
  return `<div class="note-row">
    <select id="${base}-type" ${attrs("type")} aria-label="Type">${typeOptions}</select>
    ${what}
    <input class="f-details" id="${base}-details" ${attrs("details")} value="${esc(e.details)}" placeholder="Details" aria-label="Details">
    <input class="f-date" type="date" id="${base}-date" ${attrs("date")} value="${esc(e.date)}" max="${state.today}" aria-label="Date">
    <button type="button" class="icon-btn remove" data-act="draft-remove" data-msg="${msgId}" data-g="entries" data-i="${i}" aria-label="Don't note this"><svg><use href="#i-close"/></svg></button>
  </div>`;
}

function repeatOptions(current) {
  return Object.entries(REPEATS).map(([k, l]) => `<option value="${k}" ${k === current ? "selected" : ""}>${l}</option>`).join("");
}

function schedNoteRowHtml(msgId, x, i) {
  const base = `d-${msgId}-s${i}`;
  const attrs = (f) => `data-draft="${msgId}" data-g="schedules" data-i="${i}" data-f="${f}"`;
  return `<div class="sched-row">
    <input class="f-what" id="${base}-what" ${attrs("what")} value="${esc(x.what)}" aria-label="What">
    <select class="f-repeat" id="${base}-repeat" ${attrs("repeat")} aria-label="How often">${repeatOptions(x.repeat)}</select>
    <button type="button" class="icon-btn f-remove" data-act="draft-remove" data-msg="${msgId}" data-g="schedules" data-i="${i}" aria-label="Don't add this"><svg><use href="#i-close"/></svg></button>
    <label class="f-date">${x.repeat === "once" ? "On" : "From"} <input type="date" id="${base}-date" ${attrs("date")} value="${esc(x.date)}"></label>
    <label class="f-time">Time <input type="time" id="${base}-time" ${attrs("time")} value="${esc(x.time)}"></label>
    <label class="f-until" ${x.repeat === "once" ? "hidden" : ""}>Until <input type="date" id="${base}-until" ${attrs("until")} value="${esc(x.until)}"></label>
  </div>`;
}

function savedScheduleHtml(x) {
  return `<li><span class="tag schedule">Schedule</span> <span>${esc(scheduleLine(x, state.today))}</span></li>`;
}

function cardHtml(m) {
  const offered = (m.proposal?.length || 0) + (m.proposedSchedules?.length || 0);
  if (offered && state.canWrite) {
    const d = draftFor(m);
    const n = d.entries.length + d.schedules.length;
    if (!n) {
      return `<div class="note-card"><footer><span>Nothing left to save.</span><button type="button" class="btn quiet" data-act="skip" data-msg="${m.id}">Done</button></footer></div>`;
    }
    const both = d.entries.length && d.schedules.length;
    const title = both ? "Save these?" : d.schedules.length ? "Add to her schedule?" : "Note in the diary?";
    return `<div class="note-card">
      <header><h3>${title}</h3><span>Fix anything first</span></header>
      ${both ? `<div class="group-title">In the diary</div>` : ""}
      ${d.entries.map((e, i) => noteRowHtml(m.id, e, i)).join("")}
      ${both ? `<div class="group-title">In her schedule</div>` : ""}
      ${d.schedules.map((x, i) => schedNoteRowHtml(m.id, x, i)).join("")}
      <footer>
        <button type="button" class="btn quiet" data-act="skip" data-msg="${m.id}">Don't save</button>
        <button type="button" class="btn primary" data-act="save-all" data-msg="${m.id}">Save ${n === 1 ? "it" : `all ${n}`}</button>
      </footer>
    </div>`;
  }
  if (offered) {
    return `<div class="note-card"><header><h3>Suggested</h3></header><ul class="saved-list">${(m.proposal || []).map(e => `<li>${tagHtml(e)} ${esc(whatText(e))}</li>`).join("")}${(m.proposedSchedules || []).map(savedScheduleHtml).join("")}</ul></div>`;
  }
  const savedEntries = (m.savedEntryIds || []).map(entryById).filter(Boolean);
  const savedScheds = (m.savedScheduleIds || []).map(id => state.schedules.find(x => x.id === id)).filter(Boolean);
  if (m.savedEntryIds?.length || m.savedScheduleIds?.length) {
    const any = savedEntries.length + savedScheds.length;
    return `<div class="note-card">
      <div class="saved-head">Saved</div>
      <ul class="saved-list">${any
        ? savedEntries.map(e => `<li>${tagHtml(e)} <span>${esc(whatText(e))}${e.details ? ` · ${esc(e.details)}` : ""}</span></li>`).join("") + savedScheds.map(savedScheduleHtml).join("")
        : "<li>These were later removed.</li>"}</ul>
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
    if (!state.messages.length && !isToday) html = `<div class="empty">No messages on this day.</div>`;
    if (state.busy) {
      html += `<div class="msg assistant">${warningHtml(state.liveWarnings)}<div class="text${state.streamText ? "" : " thinking"}" id="streamText">${esc(state.streamText || "Thinking…")}</div></div>`;
    }
    if (state.failed && !state.busy) {
      html += `<div class="msg assistant"><p class="error">${esc(state.failed.error)} <button type="button" class="btn" data-act="retry">Try again</button></p></div>`;
    }
  }
  patch(box, html);
  box.dataset.state = state.loading ? "loading" : state.problem ? "problem" : "ready";
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
  $("sendBtn").disabled = !state.sample || !state.online || !$("composerText").value.trim();
  $("footnote").textContent = state.sample || state.loading
    ? `${name()} Wellness keeps a diary and shares ideas. It is not a doctor.`
    : "Claude can't answer on this view. You can still add entries yourself in Time-based analysis.";

  const ideas = showForm && !state.busy ? ideasForToday({ profile: state.profile, entries: state.entries, schedules: state.schedules, now: new Date() }) : [];
  patch($("ideas"), ideas.map(i => i.action
    ? `<button type="button" class="chip action" data-act="${esc(i.action)}">${esc(i.label)}</button>`
    : `<button type="button" class="chip${i.schedule ? " schedule" : ""}" data-act="prefill" data-text="${esc(i.prefill)}">${esc(i.label)}</button>`).join(""));
}

function growComposer() {
  const t = $("composerText");
  t.style.height = "auto";
  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  $("sendBtn").disabled = !state.sample || !state.online || !t.value.trim();
}

// ─── Talk: sending a message ─────────────────────────────────────────────

async function send(text, { retry = false } = {}) {
  text = text.trim();
  if (!text || state.busy || !state.sample) return;
  if (!state.online) { toast("You're offline. Try again when you're back online."); return; }
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
  const { turns, saw } = buildTurns({ profile: state.profile, entries: state.entries, schedules: state.schedules, documents: state.documents, history: past, newText: text, today: day });
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

  const { reply, entries: proposed, schedules: proposedSchedules } = parseReply(raw, day);
  const warnings = checkWarnings({ profile: state.profile, text, proposed, entries: state.entries, today: day });
  const dose = doseNote({ text, entries: state.entries, profile: state.profile });
  try {
    await state.diary.addMessage(day, {
      role: "assistant",
      text: reply || "Noted.",
      proposal: proposed.length ? proposed : null,
      proposedSchedules: proposedSchedules.length ? proposedSchedules : null,
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
  const d = state.drafts[msgId] || { entries: [], schedules: [] };
  const entries = d.entries.map(e => cleanEntry(e, state.today)).filter(Boolean);
  const schedules = d.schedules.map(x => cleanSchedule(x, state.today)).filter(Boolean);
  if (!entries.length && !schedules.length) return skip(msgId);
  try {
    const entryIds = entries.length ? await state.diary.addEntries(entries, msgId) : [];
    const scheduleIds = schedules.length ? await state.diary.addSchedules(schedules, msgId) : [];
    await state.diary.updateMessage(state.day, msgId, {
      proposal: null, proposedSchedules: null, savedEntryIds: entryIds, savedScheduleIds: scheduleIds,
    });
    delete state.drafts[msgId];
    const parts = [];
    if (entries.length) parts.push(entries.length === 1 ? "1 diary entry" : `${entries.length} diary entries`);
    if (schedules.length) parts.push(schedules.length === 1 ? "1 schedule item" : `${schedules.length} schedule items`);
    toast(`Saved ${parts.join(" and ")}`);
  } catch (e) {
    onWriteError(e);
  }
}

async function skip(msgId) {
  try {
    await state.diary.updateMessage(state.day, msgId, { proposal: null, proposedSchedules: null, skipped: true });
    delete state.drafts[msgId];
  } catch (e) {
    onWriteError(e);
  }
}

// ─── Documents ───────────────────────────────────────────────────────────
// Each document is a file (a photo or PDF) with a title and a brief.
// Nothing is kept without all three.

const MONTH_FMT = { month: "long", year: "numeric" };
const isImage = (d) => /^image\//.test(d.fileType || "");
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);
const docById = (id) => state.documents.find(d => d.id === id);

function docRowHtml(d) {
  const by = d.by ? `Added by ${who(d.by) === "You" ? "you" : who(d.by)}` : "";
  return `<button type="button" class="doc-row" data-act="doc-open" data-id="${d.id}">
    <span class="doc-icon${isImage(d) ? " img" : ""}"><svg><use href="#${isImage(d) ? "i-image" : "i-doc"}"/></svg></span>
    <span class="doc-text"><strong>${esc(d.title)}</strong><span class="brief">${esc(d.brief)}</span>${by ? `<span class="meta">${esc(by)}</span>` : ""}</span>
    <span class="doc-date">${esc(dayLabel(d.date, state.today))}</span>
  </button>`;
}

function docFormReady(f) {
  return (f.id !== "new" || f.file) && f.title.trim() && f.brief.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.date);
}

function docNeedText(f) {
  const missing = [];
  if (f.id === "new" && !f.file) missing.push("a file");
  if (!f.title.trim()) missing.push("a title");
  if (!f.brief.trim()) missing.push("a brief");
  if (!missing.length) return "";
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}` : missing[0];
  return `Add ${list} to save.`;
}

function docFormHtml(f) {
  const isNew = f.id === "new";
  return `<div class="doc-form">
    <h3>${isNew ? "Add a document" : "Edit title and brief"}</h3>
    ${isNew ? `<label class="file-pick">File <input type="file" id="docFile" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"><span>${f.file ? `${esc(f.file.name)} · ${sizeText(f.file.size)}` : "A photo or PDF, up to 20 MB"}</span></label>` : ""}
    <div class="two">
      <label>Title <input id="docTitle" data-doc="title" maxlength="120" value="${esc(f.title)}" placeholder="Blood test report"></label>
      <label>Date of the document <input id="docDate" data-doc="date" type="date" value="${esc(f.date)}" max="${state.today}"></label>
    </div>
    <label>Brief <textarea id="docBrief" data-doc="brief" maxlength="600" placeholder="What it is and what matters in it. For example: haemoglobin a little low, recheck in 3 months.">${esc(f.brief)}</textarea></label>
    <p class="need" id="docNeed">${esc(docNeedText(f))}</p>
    <div class="row">
      <span class="status${f.problem ? " problem" : ""}">${esc(f.status || "")}</span>
      <button type="button" class="btn quiet" data-act="doc-cancel" ${f.busy ? "disabled" : ""}>Cancel</button>
      <button type="button" class="btn primary" id="docSave" data-act="doc-save" ${docFormReady(f) && !f.busy ? "" : "disabled"}>${isNew ? "Save document" : "Save changes"}</button>
    </div>
  </div>`;
}

function docViewHtml(d) {
  const by = d.by ? ` · Added by ${who(d.by) === "You" ? "you" : who(d.by)}` : "";
  const [y, m, day] = d.date.split("-").map(Number);
  const long = new Date(y, m - 1, day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const actions = [
    state.downloads ? `<button type="button" class="btn" data-act="doc-download" data-id="${d.id}">Download</button>` : "",
    state.canWrite ? `<button type="button" class="btn" data-act="doc-edit" data-id="${d.id}">Edit title and brief</button>` : "",
    state.canWrite ? (state.docConfirmDelete
      ? `<span class="confirm">Remove this document? <button type="button" class="btn danger" data-act="doc-del-yes" data-id="${d.id}">Remove</button><button type="button" class="btn quiet" data-act="doc-del-no">Keep</button></span>`
      : `<button type="button" class="btn quiet danger" data-act="doc-del" data-id="${d.id}">Remove</button>`) : "",
  ].join("");
  const url = state.diary.fileUrl(d.fileId);
  const file = isImage(d)
    ? `<img src="${esc(url)}" alt="${esc(d.title)}" id="docImg">`
    : `<p class="missing">Opening the PDF…</p>`;
  return `<div class="doc-view">
    <button type="button" class="btn quiet back" data-act="doc-back"><svg><use href="#i-left"/></svg>All documents</button>
    <h2>${esc(d.title)}</h2>
    <p class="meta">${esc(long)} · ${isImage(d) ? "Photo" : "PDF"}${d.fileSize ? ` · ${sizeText(d.fileSize)}` : ""}${esc(by)}</p>
    <p class="brief">${esc(d.brief)}</p>
    ${actions ? `<div class="doc-actions">${actions}</div>` : ""}
    <div class="doc-file" id="docFile${isImage(d) ? "" : "Pdf"}">${file}</div>
  </div>`;
}

function renderDocs() {
  if (!$("docsView")) return;
  $("docCount").textContent = state.documents.length || "";
  const canAdd = state.canWrite && state.diary?.canUpload;
  $("addDocBtn").hidden = !canAdd || !!state.docForm || !!state.docOpen;
  $("docsHint").hidden = !!state.docOpen;
  patch($("docForm"), state.docForm ? docFormHtml(state.docForm) : "");

  const body = $("docBody");
  if (state.loading || state.problem) { body.innerHTML = `<div class="empty">${state.problem ? "Sign in to claude.ai to open the documents." : "Opening the documents…"}</div>`; return; }
  const open = state.docOpen && docById(state.docOpen);
  if (open && !(state.docForm && state.docForm.id === open.id)) {
    if (!body.querySelector(`.doc-view[data-id="${open.id}"]`) || body.dataset.sig !== `${open.title}|${open.brief}|${open.date}|${state.docConfirmDelete}|${who(open.by)}`) {
      body.innerHTML = docViewHtml(open).replace('<div class="doc-view">', `<div class="doc-view" data-id="${open.id}">`);
      body.dataset.sig = `${open.title}|${open.brief}|${open.date}|${state.docConfirmDelete}|${who(open.by)}`;
      $("docImg")?.addEventListener("error", (e) => { e.target.replaceWith(Object.assign(document.createElement("p"), { className: "missing", textContent: "This photo can't be shown here. Try Download." })); });
      if ($("docFilePdf")) showPdf($("docFilePdf"), open.fileId);
    }
    return;
  }
  pdfRun += 1;                      // stop drawing a PDF that's no longer open
  body.dataset.sig = "";
  if (state.docForm && state.docForm.id !== "new") { body.innerHTML = ""; return; }
  const noUpload = state.canWrite && !state.diary?.canUpload
    ? `<p class="hint">Only people who can edit this page can add documents. Ask the page's owner to make you an Editor.</p>` : "";
  if (!state.documents.length) {
    body.innerHTML = `${noUpload}<div class="empty">No documents yet. Add a prescription, a test report or a vaccination card, with a short brief on what it says.</div>`;
    return;
  }
  const byMonth = new Map();
  for (const d of state.documents) {
    const k = d.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(d);
  }
  body.innerHTML = noUpload + [...byMonth.entries()].map(([k, list]) => {
    const [y, m] = k.split("-").map(Number);
    return `<section class="doc-month"><h3>${esc(new Date(y, m - 1, 1).toLocaleDateString("en-GB", MONTH_FMT))}</h3>${list.map(docRowHtml).join("")}</section>`;
  }).join("");
}

// ── Showing a PDF ──
// claude.ai's frame won't run the browser's own PDF viewer, so the pages are
// drawn here with PDF.js (Mozilla's PDF reader). It loads from cdnjs only the
// first time a PDF is opened. Loading its worker file as a plain script first
// lets it run on the page itself, which the frame allows.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const PDF_PAGE_LIMIT = 40;
let pdfjsReady = null;
let pdfRun = 0;

function loadScript(src) {
  return new Promise((ok, fail) => {
    const el = Object.assign(document.createElement("script"), { src, onload: ok, onerror: () => fail(new Error(`couldn't load ${src}`)) });
    document.head.append(el);
  });
}

function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = loadScript(`${PDFJS}pdf.worker.min.js`)
      .then(() => loadScript(`${PDFJS}pdf.min.js`))
      .then(() => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`;
        return window.pdfjsLib;
      })
      .catch((e) => { pdfjsReady = null; throw e; });
  }
  return pdfjsReady;
}

async function showPdf(box, fileId) {
  const run = ++pdfRun;
  const fail = (text) => { if (run === pdfRun) box.innerHTML = `<p class="missing">${esc(text)}</p>`; };
  try {
    const [lib, blob] = await Promise.all([loadPdfJs(), state.diary.fileBlob(fileId)]);
    const data = new Uint8Array(await blob.arrayBuffer());
    const pdf = await lib.getDocument({ data, isEvalSupported: false }).promise;
    if (run !== pdfRun) return;
    box.innerHTML = "";
    box.classList.add("pages");
    const width = Math.max(240, box.clientWidth - 24);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const count = Math.min(pdf.numPages, PDF_PAGE_LIMIT);
    for (let n = 1; n <= count; n += 1) {
      const page = await pdf.getPage(n);
      if (run !== pdfRun) return;
      const scale = Math.min(width / page.getViewport({ scale: 1 }).width, 2.5);
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Page ${n} of ${pdf.numPages}`);
      box.append(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
    if (pdf.numPages > count && run === pdfRun) {
      box.append(Object.assign(document.createElement("p"), { className: "missing", textContent: `Showing the first ${count} of ${pdf.numPages} pages. Use Download to see the rest.` }));
    }
  } catch (e) {
    fail(e?.name === "PasswordException" ? "This PDF has a password, so it can't be shown here. Use Download to open it."
      : e?.code === "not_found" ? "This file can't be reached right now. Try again later, or use Download."
      : "This PDF can't be shown here. Use Download to open it.");
  }
}

const UPLOAD_PROBLEM = {
  too_large: "That file is over 20 MB. Try a smaller photo or PDF.",
  unsupported_type: "Only photos (JPG, PNG, WebP, GIF) and PDFs can be kept.",
  quota_or_state: "This page's file storage is full. Remove an old document to make room.",
  not_granted: "Only people who can edit this page can add documents.",
  rate_limited: "Too many uploads at once. Wait a minute and try again.",
};

async function saveDoc() {
  const f = state.docForm;
  if (!f || f.busy || !docFormReady(f)) return;
  const details = { title: f.title.trim(), brief: f.brief.trim(), date: f.date };
  f.busy = true;
  f.problem = false;
  f.status = f.id === "new" ? "Uploading…" : "Saving…";
  renderDocs();
  try {
    if (f.id === "new") {
      const id = await state.diary.addDocument(f.file, details);
      state.docOpen = id;
      toast("Document saved");
    } else {
      await state.diary.updateDocument(f.id, details);
      toast("Saved");
    }
    state.docForm = null;
    state.docConfirmDelete = false;
  } catch (e) {
    f.busy = false;
    f.problem = true;
    f.status = UPLOAD_PROBLEM[e?.code] || (e?.code === "invalid_argument" ? "You can't add to this diary." : "Couldn't save. Check your connection and try again.");
  }
  renderDocs();
}

async function downloadDoc(d) {
  if (!state.downloads) return;
  try {
    const blob = await state.diary.fileBlob(d.fileId);
    const ext = isImage(d) ? (d.fileType.split("/")[1] || "jpg").replace("jpeg", "jpg") : "pdf";
    const base = (d.fileName || d.title).replace(/\.[a-z0-9]+$/i, "");
    await state.downloads.save({ filename: `${base}.${ext}`, data: blob });
    toast("Saved");
  } catch (e) {
    if (e?.code === "declined") return;
    toast(e?.code === "not_found" ? "This file can't be reached right now. Try again later." : "Couldn't download it here. Try opening the page on claude.ai.");
  }
}

// ─── Time-based analysis ─────────────────────────────────────────────────
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
  const { prompt, refs, saw, stats } = notesRequest({ profile: state.profile, span, entries: state.look.list, documents: state.documents, today: state.today });
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

let scheduleDraft = [];

function renderScheduleRows() {
  const disabled = state.canWrite ? "" : "disabled";
  $("scheduleRows").innerHTML = scheduleDraft.map((x, i) => `
    <div class="sched-row">
      <input class="f-what" id="sc-${i}-what" data-sched="${i}" data-f="what" value="${esc(x.what)}" placeholder="Vitamin D drops" aria-label="What" ${disabled}>
      <select class="f-repeat" id="sc-${i}-repeat" data-sched="${i}" data-f="repeat" aria-label="How often" ${disabled}>${repeatOptions(x.repeat)}</select>
      <button type="button" class="icon-btn f-remove" data-act="sched-remove" data-i="${i}" aria-label="Remove" ${disabled}><svg><use href="#i-close"/></svg></button>
      <label class="f-date">${x.repeat === "once" ? "On" : "From"} <input type="date" id="sc-${i}-date" data-sched="${i}" data-f="date" value="${esc(x.date)}" ${disabled}></label>
      <label class="f-time">Time <input type="time" id="sc-${i}-time" data-sched="${i}" data-f="time" value="${esc(x.time)}" ${disabled}></label>
      <label class="f-until" ${x.repeat === "once" ? "hidden" : ""}>Until <input type="date" id="sc-${i}-until" data-sched="${i}" data-f="until" value="${esc(x.until)}" ${disabled}></label>
    </div>`).join("") || `<p class="hint">Nothing set yet.</p>`;
}

function openSettings() {
  const p = state.profile;
  $("sName").value = p.name || "";
  $("sDob").value = p.dob || "";
  $("sDob").max = state.today;
  $("sAllergies").value = p.allergies || "";
  $("sDoctor").value = p.doctorName || "";
  $("sPhone").value = p.doctorPhone || "";
  scheduleDraft = state.schedules.map(x => ({ ...x }));
  renderScheduleRows();
  for (const el of $("settingsForm").querySelectorAll("#sName, #sDob, #sAllergies, #sDoctor, #sPhone, #addScheduleBtn, #settingsSave")) el.disabled = !state.canWrite;
  $("keepCopy").hidden = !state.downloads || !state.diary;
  $("copyStatus").textContent = "";
  $("settings").showModal();
}

async function saveSettings() {
  const profile = {
    name: $("sName").value.trim() || "Divisha",
    dob: $("sDob").value,
    allergies: $("sAllergies").value.trim(),
    doctorName: $("sDoctor").value.trim(),
    doctorPhone: $("sPhone").value.trim(),
  };
  try {
    await state.diary.saveProfile(profile);
    // Her schedule: add new rows, save changed ones, remove deleted ones.
    const kept = new Set();
    for (const row of scheduleDraft) {
      const clean = cleanSchedule(row, state.today);
      if (!clean) continue;
      if (!row.id) { await state.diary.addSchedules([clean]); continue; }
      kept.add(row.id);
      const was = state.schedules.find(x => x.id === row.id);
      if (was && ["what", "repeat", "date", "time", "until", "details"].some(k => (was[k] || "") !== (clean[k] || ""))) {
        await state.diary.updateSchedule(row.id, clean);
      }
    }
    for (const x of state.schedules) if (!kept.has(x.id)) await state.diary.deleteSchedule(x.id);
    $("settings").close();
    toast("Saved");
  } catch (e) {
    onWriteError(e);
  }
}

// ─── Keep a copy ─────────────────────────────────────────────────────────

const SAVE_PROBLEM = {
  declined: null,
  rate_limited: "A save prompt is already open. Finish it, then try again.",
  too_large: "The copy is too big to save here. Try from a computer.",
};

async function downloadCopy() {
  const btn = $("downloadBtn");
  if (!state.downloads || !state.diary || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "Gathering the diary…";
  $("copyStatus").textContent = "";
  let saved = 0, problem = null;
  try {
    const all = await state.diary.everything();
    const names = { ...(await state.diary.names(all.entries.map(e => e.by))) };
    const files = copyFileNames(dayKey());
    const plan = [
      { filename: files.readable, data: readableDiary({ ...all, names, today: dayKey() }) },
      { filename: files.backup, data: backupFile(all) },
    ];
    for (const f of plan) {
      btn.textContent = `Saving ${saved + 1} of 2…`;
      try {
        await state.downloads.save(f);
        saved += 1;
      } catch (e) {
        if (e?.code in SAVE_PROBLEM) problem = problem || SAVE_PROBLEM[e.code];
        else { problem = "Downloads aren't available here. Try opening the page on claude.ai."; break; }
      }
    }
  } catch {
    problem = "Couldn't gather the diary. Check your connection and try again.";
  }
  btn.disabled = false;
  btn.textContent = "Download a copy";
  // Shown inside the sheet: a toast would sit behind it.
  const status = $("copyStatus");
  status.textContent = problem || (saved === 2 ? "Saved both files." : saved === 1 ? "Saved one of the two files." : "Nothing was saved.");
  status.classList.toggle("problem", saved < 2);
}

function renderOnline() {
  $("offline").hidden = state.online;
  renderComposer();
}

// ─── Everything ──────────────────────────────────────────────────────────

function render() {
  renderTop();
  renderChatList();
  renderDayBar();
  renderMessages();
  renderComposer();
  renderDocs();
  renderLook();
}

function wire() {
  window.addEventListener("hashchange", readHash);

  $("chatsBtn").addEventListener("click", togglePane);
  phoneWidth.addEventListener("change", closeDrawer);
  try { if (localStorage.getItem("divisha-pane") === "closed") $("mainArea").classList.add("collapsed"); } catch { /* open by default */ }
  updatePaneButton();
  $("closeChatsBtn").addEventListener("click", closeDrawer);
  $("scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  $("settingsBtn").addEventListener("click", openSettings);
  $("downloadBtn").addEventListener("click", downloadCopy);
  window.addEventListener("online", () => { state.online = true; renderOnline(); });
  window.addEventListener("offline", () => { state.online = false; renderOnline(); });
  $("settingsClose").addEventListener("click", () => $("settings").close());
  $("settingsCancel").addEventListener("click", () => $("settings").close());
  $("settingsForm").addEventListener("submit", (e) => { e.preventDefault(); saveSettings(); });
  $("addScheduleBtn").addEventListener("click", () => {
    scheduleDraft.push({ what: "", repeat: "daily", date: state.today, time: "", until: "", details: "" });
    renderScheduleRows();
    $(`sc-${scheduleDraft.length - 1}-what`).focus();
  });

  $("addDocBtn").addEventListener("click", () => {
    state.docForm = { id: "new", title: "", brief: "", date: state.today, file: null, busy: false, status: "" };
    state.docOpen = null;
    renderDocs();
    $("docFile")?.focus();
  });

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

  // Typing into a card, an edit form, a schedule row or a document form
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset.draft) {
      const row = state.drafts[t.dataset.draft]?.[t.dataset.g]?.[Number(t.dataset.i)];
      if (row) row[t.dataset.f] = t.value;
    } else if (t.dataset.edit && state.edit) {
      state.edit[t.dataset.edit] = t.value;
    } else if (t.dataset.sched) {
      scheduleDraft[Number(t.dataset.sched)][t.dataset.f] = t.value;
    } else if (t.dataset.doc && state.docForm) {
      state.docForm[t.dataset.doc] = t.value;
      $("docSave").disabled = !docFormReady(state.docForm) || state.docForm.busy;
      $("docNeed").textContent = docNeedText(state.docForm);
    }
  });
  // Changing the type swaps the "what" field (How she is uses a fixed list)
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.draft && t.dataset.f === "type") {
      const row = state.drafts[t.dataset.draft]?.entries?.[Number(t.dataset.i)];
      if (row) { row.type = t.value; row.what = t.value === "health" ? "well" : (HEALTH[row.what] ? "" : row.what); renderMessages(); }
    } else if (t.dataset.draft && t.dataset.f === "repeat") {
      renderMessages();                                   // "Until" shows only for repeats
    } else if (t.dataset.sched && t.dataset.f === "repeat") {
      renderScheduleRows();
    } else if (t.id === "docFile" && state.docForm) {
      const file = t.files?.[0] || null;
      state.docForm.file = file;
      if (file && !state.docForm.title.trim()) {
        state.docForm.title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
      }
      renderDocs();
      $("docBrief")?.focus();
    } else if (t.dataset.edit === "type" && state.edit) {
      state.edit.what = t.value === "health" ? "well" : (HEALTH[state.edit.what] ? "" : state.edit.what);
      renderEntries();
    }
  });

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "open-day") { if (state.view !== "talk") location.hash = "#talk"; openDay(b.dataset.day); }
    else if (act === "prefill") { const t = $("composerText"); t.value = b.dataset.text; growComposer(); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    else if (act === "settings") openSettings();
    else if (act === "retry" && state.failed) send(state.failed.text, { retry: true });
    else if (act === "save-all") saveAll(b.dataset.msg);
    else if (act === "skip") skip(b.dataset.msg);
    else if (act === "draft-remove") { state.drafts[b.dataset.msg]?.[b.dataset.g]?.splice(Number(b.dataset.i), 1); renderMessages(); }
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
    else if (act === "sched-remove") { scheduleDraft.splice(Number(b.dataset.i), 1); renderScheduleRows(); }
    else if (act === "doc-open") { state.docOpen = b.dataset.id; state.docForm = null; state.docConfirmDelete = false; renderDocs(); $("docsView").scrollTop = 0; }
    else if (act === "doc-back") { state.docOpen = null; state.docConfirmDelete = false; pdfRun += 1; renderDocs(); }
    else if (act === "doc-cancel") { state.docForm = null; renderDocs(); }
    else if (act === "doc-save") saveDoc();
    else if (act === "doc-edit") {
      const d = docById(b.dataset.id);
      if (d) { state.docForm = { id: d.id, title: d.title, brief: d.brief, date: d.date, busy: false, status: "" }; renderDocs(); $("docTitle")?.focus(); }
    }
    else if (act === "doc-del") { state.docConfirmDelete = true; renderDocs(); }
    else if (act === "doc-del-no") { state.docConfirmDelete = false; renderDocs(); }
    else if (act === "doc-del-yes") {
      const d = docById(b.dataset.id);
      if (d) state.diary.deleteDocument(d).then(() => { state.docOpen = null; state.docConfirmDelete = false; toast("Document removed"); renderDocs(); }).catch(onWriteError);
    }
    else if (act === "doc-download") { const d = docById(b.dataset.id); if (d) downloadDoc(d); }
  });
}

async function start() {
  wire();
  readHash();
  $("offline").hidden = state.online;
  render();

  const diary = await openDiary();
  state.loading = false;
  if (!diary) { state.problem = "signed-out"; render(); return; }
  state.diary = diary;
  state.canWrite = diary.canWrite;
  render();

  window.claude.use("sample").then(s => { state.sample = s; renderComposer(); renderNotes(); });
  window.claude.use("downloads").then(d => { state.downloads = d; });

  diary.watchProfile((p) => { state.profile = p || {}; render(); }, () => toast("Couldn't load About Divisha. Reload the page."));
  diary.watchEntries((list) => {
    state.entries = list;
    resolveNames(list.map(e => e.by));
    renderMessages();
    renderComposer();
    renderLook();
  }, () => toast("Couldn't load the diary. Reload the page."));
  diary.watchChatList((list) => { state.chatList = list; renderChatList(); }, () => {});
  diary.watchSchedules((list) => { state.schedules = list; renderComposer(); renderMessages(); }, () => {});
  diary.watchDocuments((list) => {
    state.documents = list;
    if (state.docOpen && !docById(state.docOpen)) state.docOpen = null;
    resolveNames(list.map(d => d.by));
    renderTop();
    renderDocs();
  }, () => toast("Couldn't load the documents. Reload the page."));
  openDay(state.today);
  openSpan(state.span);
}

start();
