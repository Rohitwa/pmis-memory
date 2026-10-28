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
