// Run with:  node --test divisha/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey, addDays, ageInMonths, ageText, cleanEntry, parseReply, visiblePart,
  buildTurns, ideasForToday, checkWarnings, temperatures, doseNote,
} from "../app/helper.js";

const TODAY = "2026-10-28";
const toddler = { name: "Divisha", dob: "2024-06-15" };   // 28 months
const baby = { name: "Divisha", dob: "2026-09-10" };      // 1 month

test("dates add and age reads plainly", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(ageInMonths("2024-06-15", TODAY), 28);
  assert.equal(ageText("2024-06-15", TODAY), "2 years 4 months old");
  assert.equal(ageText("", TODAY), "");
  assert.match(dayKey(new Date(2026, 0, 5)), /^2026-01-05$/);
});

test("entries are cleaned, and bad ones dropped", () => {
  assert.deepEqual(cleanEntry({ type: "care", what: " Kadha ", details: "before bed", date: TODAY }, TODAY),
    { date: TODAY, type: "care", what: "Kadha", details: "before bed" });
  assert.equal(cleanEntry({ type: "health", what: "theek thi" }, TODAY).what, "well");
  assert.equal(cleanEntry({ type: "health", what: "sick" }, TODAY).what, "sick");
  assert.equal(cleanEntry({ type: "care", what: "x", date: "2027-01-01" }, TODAY).date, TODAY, "future dates become today");
  assert.equal(cleanEntry({ type: "mood", what: "happy" }, TODAY), null);
  assert.equal(cleanEntry({ type: "care", what: "" }, TODAY), null);
});

test("a reply splits into words and entries", () => {
  const text = 'Sorry she is unwell. Keep fluids going.\n\n```json\n{"entries":[{"type":"symptom","what":"Fever 38.4","date":"2026-10-28"},{"type":"care","what":"Paracetamol 5 ml"},{"type":"bogus","what":"x"}]}\n```';
  const { reply, entries } = parseReply(text, TODAY);
  assert.equal(reply, "Sorry she is unwell. Keep fluids going.");
  assert.equal(entries.length, 2);
  assert.equal(entries[1].date, TODAY);
});

test("a reply with a broken or missing block keeps the words", () => {
  assert.deepEqual(parseReply("All good!\n```json\n{oops}\n```", TODAY), { reply: "All good!", entries: [] });
  assert.deepEqual(parseReply("Just words", TODAY), { reply: "Just words", entries: [] });
  assert.equal(visiblePart("Hello there\n```json\n{\"entr"), "Hello there");
});

test("the conversation starts and ends on the parent, with the packet first", () => {
  const history = [
    { role: "assistant", text: "orphan reply" },
    { role: "user", text: "cough at night" },
    { role: "assistant", text: "Try steam." },
    { role: "user", text: "failed send" },
  ];
  const entries = [
    { date: "2026-10-27", type: "care", what: "Steam", details: "" },
    { date: "2026-09-01", type: "care", what: "Old entry", details: "" },
  ];
  const { turns, saw } = buildTurns({ profile: toddler, entries, history, newText: "She's better", today: TODAY });
  assert.equal(turns[0].role, "user");
  assert.equal(turns.at(-1).role, "user");
  assert.ok(turns.every((t, i) => i === 0 || t.role !== turns[i - 1].role), "roles alternate");
  assert.match(turns[0].content, /Divisha Wellness/);
  assert.match(turns.at(-1).content, /failed send\n\nShe's better/);
  assert.match(saw, /Steam/);
  assert.doesNotMatch(saw, /Old entry/, "only the last 14 days are sent");
});

test("temperatures are read in °C and °F, and other numbers ignored", () => {
  assert.deepEqual(temperatures("fever 38.4 since evening"), [38.4]);
  assert.deepEqual(temperatures("temp was 102F"), [38.9]);
  assert.deepEqual(temperatures("weight 12.3 kg, gave 5 ml"), []);
  assert.deepEqual(temperatures("she slept 10 hours"), []);
});

test("fever warnings depend on her age", () => {
  assert.deepEqual(checkWarnings({ profile: toddler, text: "fever 38.4", today: TODAY }), []);
  assert.equal(checkWarnings({ profile: toddler, text: "fever 39.2", today: TODAY })[0].id, "fever_high");
  assert.equal(checkWarnings({ profile: baby, text: "temp 38.1", today: TODAY })[0].id, "fever_high");
  assert.equal(checkWarnings({ profile: {}, text: "103 F bukhar", today: TODAY })[0].id, "fever_high");
});

test("other warning signs are caught in plain and Hindi words", () => {
  const ids = (text) => checkWarnings({ profile: toddler, text, today: TODAY }).map(w => w.id);
  assert.deepEqual(ids("she is having trouble breathing"), ["breathing"]);
  assert.deepEqual(ids("very sleepy and floppy"), ["drowsy"]);
  assert.deepEqual(ids("not drinking anything since morning"), ["fluids"]);
  assert.deepEqual(ids("she had a fit in the afternoon"), ["seizure"]);
  assert.deepEqual(ids("rash on her tummy and fever"), ["rash_fever"]);
  assert.deepEqual(ids("cough at night, gave kadha"), []);
});

test("five fever days in six raises a warning", () => {
  const entries = [-1, -2, -3, -4].map(n => ({ date: addDays(TODAY, n), type: "symptom", what: "Fever 38", details: "" }));
  const ids = checkWarnings({ profile: toddler, text: "still fever today", entries, today: TODAY }).map(w => w.id);
  assert.ok(ids.includes("fever_long"));
});

test("warnings also look at the entries Claude proposed", () => {
  const w = checkWarnings({ profile: toddler, text: "she's hot", proposed: [{ what: "Fever 39.5", details: "" }], today: TODAY });
  assert.equal(w[0].id, "fever_high");
});

test("dose questions get the last noted dose, never a calculation", () => {
  const entries = [
    { date: "2026-10-20", type: "care", what: "Paracetamol 5 ml", details: "" },
    { date: "2026-10-25", type: "care", what: "Kadha", details: "" },
  ];
  assert.match(doseNote({ text: "how much paracetamol can I give?", entries }), /Paracetamol 5 ml/);
  assert.match(doseNote({ text: "kitna dena hai?", entries: [] }), /doesn't work out medicine doses/);
  assert.equal(doseNote({ text: "she slept well", entries }), null);
});

test("ideas follow the rules and stop at three", () => {
  const evening = new Date(2026, 9, 28, 19, 0);
  const entries = [
    { date: "2026-10-27", type: "symptom", what: "Cough at night", details: "" },
    { date: "2026-10-20", type: "care", what: "Steam", details: "" },
    { date: "2026-10-12", type: "care", what: "Steam", details: "" },
  ];
  const profile = { ...toddler, routine: [{ what: "Vitamin D", often: "daily" }] };
  const ideas = ideasForToday({ profile, entries, now: evening }).map(i => i.label);
  assert.deepEqual(ideas, ["Is the cough at night better?", "Steam tonight?", "Vitamin D done today?"]);

  const morning = new Date(2026, 9, 28, 9, 0);
  assert.deepEqual(ideasForToday({ profile: toddler, entries: [], now: morning }).map(i => i.label), ["How was Divisha today?"]);
});

// ─── Look back ──────────────────────────────────────────────────────────
import {
  makeSpan, stepSpan, spanLabel, previousName, compareText, comparisonSpan, dayLevels, baseLabel,
  countSpan, notesRequest, readNotes, changedSince,
} from "../app/helper.js";

test("spans cover a Monday-to-Sunday week, a month and a year", () => {
  assert.deepEqual(makeSpan("week", "2026-10-28"), { kind: "week", from: "2026-10-26", to: "2026-11-01", key: "week-2026-10-26" });
  assert.deepEqual(makeSpan("month", "2026-02-14"), { kind: "month", from: "2026-02-01", to: "2026-02-28", key: "month-2026-02-01" });
  assert.equal(makeSpan("year", "2026-10-28").to, "2026-12-31");
  assert.equal(stepSpan(makeSpan("month", "2026-01-10"), -1).from, "2025-12-01");
  assert.equal(stepSpan(makeSpan("week", "2026-10-28"), -1).from, "2026-10-19");
});

test("spans are named the way people say them", () => {
  assert.equal(spanLabel(makeSpan("month", TODAY), TODAY), "October 2026");
  assert.equal(spanLabel(makeSpan("week", TODAY), TODAY), "This week");
  assert.equal(spanLabel(makeSpan("week", "2026-10-20"), TODAY), "Last week");
  assert.equal(spanLabel(makeSpan("week", "2026-10-07"), TODAY), "5 – 11 Oct");
  assert.equal(spanLabel(makeSpan("week", "2026-09-30"), TODAY), "28 Sept – 4 Oct");
  assert.equal(previousName(makeSpan("month", TODAY)), "September");
  assert.equal(compareText(6, 10, "September"), "4 fewer than September");
  assert.equal(compareText(3, 3, "2025"), "Same as 2025");
});

test("each day takes the latest 'How she is', and a lone symptom counts as a bit off", () => {
  const levels = dayLevels([
    { date: "2026-10-01", type: "health", what: "sick", createdAt: "2026-10-01T08:00" },
    { date: "2026-10-01", type: "health", what: "well", createdAt: "2026-10-01T20:00" },
    { date: "2026-10-02", type: "symptom", what: "Cough" },
    { date: "2026-10-03", type: "symptom", what: "Cough" },
    { date: "2026-10-03", type: "health", what: "sick", createdAt: "x" },
    { date: "2026-10-04", type: "care", what: "Vitamin D" },
  ]);
  assert.deepEqual(levels, { "2026-10-01": "well", "2026-10-02": "off", "2026-10-03": "sick" });
});

test("labels group the same thing with different numbers", () => {
  assert.equal(baseLabel("Fever 39.4"), "Fever");
  assert.equal(baseLabel("fever 101 F"), "Fever");
  assert.equal(baseLabel("Paracetamol 5 ml"), "Paracetamol");
  assert.equal(baseLabel("Antibiotic day 3"), "Antibiotic");
  assert.equal(baseLabel("Cough at night"), "Cough at night");
});

const october = [
  { id: "a", date: "2026-10-01", type: "health", what: "well" },
  { id: "b", date: "2026-10-05", type: "symptom", what: "Cough at night" },
  { id: "c", date: "2026-10-06", type: "health", what: "sick" },
  { id: "d", date: "2026-10-06", type: "care", what: "Steam" },
  { id: "e", date: "2026-10-07", type: "health", what: "off" },
  { id: "f", date: "2026-10-08", type: "health", what: "well" },
  { id: "g", date: "2026-10-12", type: "doctor", what: "Dr Mehta", details: "viral" },
  { id: "h", date: "2026-10-20", type: "symptom", what: "Fever 38.2" },
  { id: "i", date: "2026-10-20", type: "care", what: "Steam" },
  { id: "j", date: "2026-10-22", type: "symptom", what: "Fever 38" },
  { id: "k", date: "2026-09-10", type: "health", what: "sick" },
  { id: "l", date: "2026-09-11", type: "health", what: "sick" },
];

test("a month in progress is counted up to today only", () => {
  const s = countSpan(october, makeSpan("month", TODAY), TODAY);
  assert.equal(s.days.total, 28);
  assert.deepEqual([s.days.well, s.days.off, s.days.sick], [2, 4, 1]);
  assert.equal(s.days.none, 21);
  assert.equal(s.unwellDays, 5);
  assert.equal(s.spells, 3, "5–7 Oct, 20 Oct and 22 Oct are three separate runs");
  assert.deepEqual(s.longest, { from: "2026-10-05", to: "2026-10-07", days: 3, worst: "sick" });
  assert.equal(s.doctor, 1);
  assert.deepEqual(s.symptoms.map(x => [x.label, x.count]), [["Fever", 2], ["Cough at night", 1]]);
  assert.deepEqual(s.care[0], { label: "Steam", count: 2, ids: ["d", "i"] });
  assert.equal(s.inProgress, true);
});

test("a span in the future counts nothing", () => {
  const s = countSpan(october, makeSpan("month", "2026-12-01"), TODAY);
  assert.equal(s.days.total, 0);
  assert.equal(s.future, true);
});

test("the notes request numbers the entries and carries the app's counts", () => {
  const { prompt, refs, stats } = notesRequest({ profile: toddler, span: makeSpan("month", TODAY), entries: october, today: TODAY });
  assert.equal(refs.length, 10, "only October's entries");
  assert.deepEqual(refs.slice(0, 3), ["a", "b", "c"], "oldest first");
  assert.match(prompt, /\[1\] 2026-10-01 · How she is · Well/);
  assert.match(prompt, /Well: 2\. A bit off: 4\. Sick: 1\. Not noted: 21\./);
  assert.match(prompt, /September so far, for comparison: well 0, off or sick 2/);
  assert.match(prompt, /warm, plain and specific/);
  assert.equal(stats.entryCount, 10);
});

test("notes keep only points that point at real entries", () => {
  const refs = ["a", "b", "c"];
  const body = readNotes({
    now: [{ text: "She's well again.", see: [1] }, { text: "No evidence.", see: [] }],
    working: [{ text: "Steam helped.", see: [2, 2, 9, "3"] }],
    tryNext: "not a list",
    moments: [{ text: "", see: [1] }],
  }, refs);
  assert.deepEqual(body.now, [{ text: "She's well again.", see: ["a"] }]);
  assert.deepEqual(body.working, [{ text: "Steam helped.", see: ["b", "c"] }]);
  assert.deepEqual(body.tryNext, []);
  assert.deepEqual(body.moments, []);
  assert.equal(readNotes({ now: [{ text: "x", see: [7] }] }, refs), null, "nothing usable means no notes");
});

test("notes know how many entries changed after they were written", () => {
  const span = makeSpan("month", TODAY);
  const list = [
    { date: "2026-10-01", createdAt: "2026-10-10T00:00" },
    { date: "2026-10-02", createdAt: "2026-10-30T00:00" },
    { date: "2026-10-03", createdAt: "2026-10-01T00:00", editedAt: "2026-10-29T00:00" },
    { date: "2026-09-03", createdAt: "2026-10-30T00:00" },
  ];
  assert.equal(changedSince(list, span, "2026-10-20T00:00"), 2);
});

test("a span still in progress is compared with the same days of the one before", () => {
  const cmp = comparisonSpan(makeSpan("month", TODAY), TODAY);
  assert.deepEqual([cmp.span.from, cmp.span.to, cmp.name], ["2026-09-01", "2026-09-28", "September so far"]);
  const feb = comparisonSpan(makeSpan("month", "2026-03-31"), "2026-03-31");
  assert.equal(feb.span.to, "2026-02-28", "never runs past the end of a shorter month");
  const done = comparisonSpan(makeSpan("month", "2026-09-15"), TODAY);
  assert.deepEqual([done.span.from, done.span.to, done.name], ["2026-08-01", "2026-08-31", "August"]);
});

// ─── Keep a copy ────────────────────────────────────────────────────────
import { readableDiary, backupFile, copyFileNames } from "../app/helper.js";

test("the readable diary lists About Divisha, entries by month, and notes with their dates", () => {
  const text = readableDiary({
    profile: { ...toddler, doctorName: "Dr Mehta", doctorPhone: "98200 12345", routine: [{ what: "Vitamin D", often: "daily" }] },
    entries: [
      { id: "a", date: "2026-09-30", type: "health", what: "sick", by: "u1", createdAt: "1" },
      { id: "b", date: "2026-10-02", type: "care", what: "Steam", details: "before bed", by: "u2", createdAt: "2" },
      { id: "c", date: "2026-10-02", type: "symptom", what: "Cough at night", by: "u2", createdAt: "1" },
    ],
    notes: [{ kind: "month", from: "2026-10-01", writtenAt: "2026-10-20T10:00:00", body: { working: [{ text: "Steam helps.", see: ["b", "gone"] }] } }],
    names: { u1: "Rohit", u2: "Ananya" },
    today: TODAY,
  });
  assert.match(text, /^# Divisha Wellness: diary/);
  assert.match(text, /3 entries from Wed, 30 Sept 2026 to Fri, 2 Oct 2026/);
  assert.match(text, /- Doctor: Dr Mehta, 98200 12345/);
  assert.match(text, /- Usual routine: Vitamin D \(every day\)/);
  assert.ok(text.indexOf("### October 2026") < text.indexOf("### September 2026"), "newest month first");
  assert.ok(text.indexOf("Cough at night") < text.indexOf("Care given: Steam"), "within a day, in the order they were added");
  assert.match(text, /- How she is: Sick \(added by Rohit\)/);
  assert.match(text, /- Care given: Steam, before bed \(added by Ananya\)/);
  assert.match(text, /### October 2026 \(written Tue, 20 Oct 2026\)/);
  assert.match(text, /- Steam helps\. \(from entries on 2 Oct\)/);
  assert.match(text, /It is not a doctor\./);
});

test("an empty diary still makes a sensible file", () => {
  const text = readableDiary({ today: TODAY });
  assert.match(text, /0 entries\./);
  assert.match(text, /Nothing noted yet\./);
  assert.doesNotMatch(text, /Claude's notes/);
});

test("the backup holds everything and says what it is", () => {
  const data = JSON.parse(backupFile({ profile: { name: "Divisha" }, entries: [{ id: "a" }], chats: [{ id: "2026-10-01", messages: {} }], exportedAt: "x" }));
  assert.equal(data.app, "Divisha Wellness");
  assert.deepEqual(data.counts, { entries: 1, chatDays: 1, notes: 0 });
  assert.equal(data.profile.name, "Divisha");
  assert.deepEqual(copyFileNames(TODAY), { readable: "divisha-wellness-diary-2026-10-28.md", backup: "divisha-wellness-backup-2026-10-28.json" });
});
