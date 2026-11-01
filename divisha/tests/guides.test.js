// Guides: made from chat messages, changed by instruction, linked from her
// schedule, downloaded as a PDF. Run with:  node --test divisha/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanGuide, cleanGuideOffer, linesOf, guideOrder, findMessages, topicWords, looseWord, guideRequest, guideRevisionRequest,
  readGuideReply, guideDiff, guideUses, guideFileName, pdfSafe, guideAsText, parseReply, buildTurns, cleanSchedule,
  readableDiary, backupFile,
} from "../app/helper.js";

const TODAY = "2026-11-01";
const toddler = { name: "Divisha", dob: "2024-06-15" };
const kadha = {
  id: "g1", createdAt: "2026-10-30T10:00:00Z", title: "How to make Kadha", forWhat: "Cough and cold", makes: "1 small cup", takes: "10 minutes",
  need: ["1 cup paani", "4 tulsi leaves", "Small piece of adrak"], steps: ["Boil the paani with tulsi and adrak.", "Simmer 5 minutes, then strain.", "Cool till warm."], tips: ["Give it warm, not hot."],
};

test("a guide keeps its parts, one item per line, and needs a title and steps", () => {
  assert.deepEqual(linesOf("1. Boil water\n2) Add tulsi\n\n- Strain\nStep 4: Cool"), ["Boil water", "Add tulsi", "Strain", "Cool"]);
  assert.deepEqual(linesOf(["• haldi", "  ", "* gud"]), ["haldi", "gud"]);
  const g = cleanGuide({ title: "  How to make   Kadha ", steps: "Boil\nStrain", need: "paani\ntulsi", tips: "" });
  assert.equal(g.title, "How to make Kadha");
  assert.deepEqual(g.steps, ["Boil", "Strain"]);
  assert.deepEqual(g.need, ["paani", "tulsi"]);
  assert.deepEqual(g.tips, []);
  assert.equal(cleanGuide({ title: "Kadha", steps: [] }), null);
  assert.equal(cleanGuide({ title: "", steps: ["Boil"] }), null);
  assert.equal(cleanGuide({ title: "x".repeat(200), steps: ["s"] }).title.length, 80);
});

test("Hinglish spellings of the same word are found together", () => {
  assert.equal(looseWord("Kadha"), looseWord("kaadha"));
  assert.equal(looseWord("kadhaa"), looseWord("KADA"));
  assert.deepEqual(topicWords("How to make Kadha"), [looseWord("kadha")]);
  const chats = [
    { day: "2026-10-28", messages: {
      a: { role: "user", text: "Kaadha recipe: 1 cup paani, 4 tulsi, adrak", by: "u1", createdAt: "2026-10-28T09:00:00Z" },
      b: { role: "assistant", text: "Kadha sounds soothing.", createdAt: "2026-10-28T09:00:05Z" },
      c: { role: "user", text: "Fever 38.4 since evening", createdAt: "2026-10-28T20:00:00Z" },
    } },
    { day: "2026-10-30", messages: { d: { role: "user", text: "kadhaa me thoda gud bhi daalna", createdAt: "2026-10-30T08:00:00Z" } } },
    { day: "2026-10-25", messages: { e: { role: "user", text: "Made KADHA today, she liked it", createdAt: "2026-10-25T08:00:00Z" } } },
  ];
  const found = findMessages(chats, "kadha");
  assert.deepEqual(found.map(m => m.id), ["e", "a", "b", "d"], "oldest first, across days, both sides of the chat");
  assert.equal(found[1].day, "2026-10-28");
  assert.deepEqual(findMessages(chats, "the"), [], "too-common words find nothing");
  assert.deepEqual(findMessages(chats, "steam").length, 0);
});

test("Claude is asked to put the messages together without adding anything", () => {
  const p = guideRequest({ profile: toddler, topic: "Kadha", today: TODAY, messages: [
    { day: "2026-10-28", role: "user", text: "Kaadha recipe: 1 cup paani, 4 tulsi" },
    { day: "2026-10-30", role: "user", text: "Add gud too. Give at 8 AM." },
  ] });
  assert.match(p, /Write the guide for: Kadha/);
  assert.match(p, /\[1\] 2026-10-28 · Parent:\nKaadha recipe/);
  assert.match(p, /If messages disagree, follow the latest one/);
  assert.match(p, /Never add a medicine, a dose or an ingredient/);
  assert.match(p, /"time" is the time of day/);
  assert.match(p, /2 years 4 months old/);
  const r = guideRevisionRequest({ profile: toddler, guide: kadha, instruction: "Give it at 8 AM", today: TODAY });
  assert.match(r, /What the parent wants changed:\nGive it at 8 AM/);
  assert.match(r, /keep everything else word for word/);
  assert.ok(r.includes(JSON.stringify(kadha.steps)));
});

test("Claude's guide is checked, with a time for her schedule and a note of what changed", () => {
  const out = readGuideReply({ ...kadha, time: "8:00", change: "Time set to 8 am" });
  assert.equal(out.time, "08:00");
  assert.equal(out.change, "Time set to 8 am");
  assert.equal(out.guide.title, "How to make Kadha");
  assert.equal("id" in out.guide, false);
  assert.equal(readGuideReply({ ...kadha, time: "8 baje" }).time, "");
  assert.equal(readGuideReply({ title: "Kadha" }), null);
  assert.equal(readGuideReply(null), null);
});

test("what changed between two versions is found part by part", () => {
  const after = { ...kadha, tips: [...kadha.tips, "Give it at 8 am."], makes: "1 cup" };
  assert.deepEqual([...guideDiff(kadha, after)].sort(), ["makes", "tips"]);
  assert.equal(guideDiff(kadha, { ...kadha }).size, 0);
});

test("guides go to Claude in Talk, numbered the same way the app reads them back", () => {
  const steam = { ...kadha, id: "g2", createdAt: "2026-10-31T10:00:00Z", title: "How to give steam", need: [], steps: ["Hot water in a bowl."], tips: [] };
  assert.deepEqual(guideOrder([steam, kadha]).map(g => g.id), ["g1", "g2"]);
  const { turns } = buildTurns({ profile: toddler, entries: [], guides: [steam, kadha], history: [], newText: "Kadha 8 baje dena hai", today: TODAY });
  const packet = turns[0].content;
  assert.match(packet, /Guides kept \(2\):\n- G1\. How to make Kadha · for Cough and cold · makes 1 small cup · takes 10 minutes · needs: 1 cup paani; 4 tulsi leaves; Small piece of adrak · steps: 1\) Boil/);
  assert.match(packet, /- G2\. How to give steam/);
  assert.match(packet, /set "guide" to its number \(G1 is 1\)/);
  assert.match(buildTurns({ profile: toddler, entries: [], history: [], newText: "hi", today: TODAY }).turns[0].content, /Guides kept \(0\):\n- none/);
});

test("guides offered in Talk are read from Claude's block: new ones and changes", () => {
  const block = { entries: [], schedules: [{ what: "Kadha", repeat: "daily", date: TODAY, times: ["08:00"] }], documents: [],
    guides: [{ guide: null, ...kadha }, { guide: 1, ...kadha, change: "Time set to 8 am" }, { guide: 99, ...kadha }, { title: "No steps" }] };
  const { guides, schedules } = parseReply(`Here it is.\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``, TODAY);
  assert.equal(guides.length, 3);
  assert.equal(guides[0].guide, null);
  assert.equal(guides[1].guide, 1);
  assert.equal(guides[1].change, "Time set to 8 am");
  assert.equal(guides[2].guide, null, "an unknown number is a new guide");
  assert.equal(schedules[0].guideId, "", "Claude can't link a schedule item by itself");
  assert.deepEqual(parseReply("Just words", TODAY).guides, []);
  assert.equal(cleanGuideOffer({ ...kadha, guide: "2" }).guide, 2);
});

test("a schedule item keeps its guide link, and the guide lists where it's used", () => {
  const s = cleanSchedule({ what: "Kadha", repeat: "daily", date: TODAY, times: ["08:00"], guideId: "g1" }, TODAY);
  assert.equal(s.guideId, "g1");
  assert.deepEqual(guideUses(kadha, [{ ...s, id: "s1" }, { ...s, id: "s2", paused: true }, { ...s, id: "s3", guideId: "" }], TODAY), ["Kadha: every day at 8 am"]);
});

test("the PDF has a plain file name and text its font can print", () => {
  assert.equal(guideFileName(kadha), "how-to-make-kadha.pdf");
  assert.equal(guideFileName({ title: "Bhaap (steam) — raat ko!" }), "bhaap-steam-raat-ko.pdf");
  assert.equal(guideFileName({ title: "" }), "guide.pdf");
  assert.equal(pdfSafe("Don’t — “warm” 38.5°C • ₹20 … 🙂"), `Don't - "warm" 38.5°C - Rs 20 ... `);
});

test("guides are in the downloaded copy", () => {
  const text = guideAsText(kadha);
  assert.match(text, /^How to make Kadha\nFor: Cough and cold · Makes: 1 small cup · Takes: 10 minutes\n\nYou need:\n- 1 cup paani/);
  assert.match(text, /Steps:\n1\. Boil the paani with tulsi and adrak\.\n2\. Simmer/);
  const md = readableDiary({ profile: toddler, guides: [kadha], today: TODAY });
  assert.match(md, /## Guides\n\n### How to make Kadha\n\nFor: Cough and cold/);
  assert.match(md, /\*\*Steps\*\*\n1\. Boil/);
  const backup = JSON.parse(backupFile({ guides: [kadha] }));
  assert.equal(backup.counts.guides, 1);
  assert.equal(backup.guides[0].title, "How to make Kadha");
});
