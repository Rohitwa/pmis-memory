// Stand-in for claude.ai's runtime: in-memory db, a user, and a canned Claude.
(() => {
  const store = new Map();
  const listeners = new Set();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") merge(a[k], v); else a[k] = clone(v); } return a; };
  const notify = () => setTimeout(() => listeners.forEach(fn => fn()), 5);
  const snapDoc = (path) => ({ id: path.split("/").pop(), exists: store.has(path), data: () => store.has(path) ? clone(store.get(path)) : undefined });
  window.__store = store;
  window.__writes = [];

  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      get: async () => snapDoc(path),
      set: async (d) => { window.__writes.push(["set", path]); store.set(path, clone(d)); notify(); },
      update: async (d) => { window.__writes.push(["update", path]); if (!store.has(path)) throw { code: "invalid_argument", message: "missing" }; merge(store.get(path), d); notify(); },
      delete: async () => { store.delete(path); notify(); },
      onSnapshot(next) { const fn = () => next(snapDoc(path)); listeners.add(fn); setTimeout(fn, 5); return () => listeners.delete(fn); },
      collection: (p) => collRef(`${path}/${p}`),
    };
  }
  function collRef(path, q = {}) {
    const run = () => {
      let docs = [...store.keys()].filter(k => k.startsWith(path + "/") && k.split("/").length === path.split("/").length + 1).map(snapDoc);
      for (const [f, op, v] of q.where || []) {
        docs = docs.filter(d => { const x = d.data()[f]; return op === ">=" ? x >= v : op === "<=" ? x <= v : op === "==" ? x === v : op === ">" ? x > v : op === "<" ? x < v : true; });
      }
      if (q.order) docs.sort((a, b) => { const x = a.data()[q.order[0]], y = b.data()[q.order[0]]; return (x < y ? -1 : x > y ? 1 : 0) * (q.order[1] === "desc" ? -1 : 1); });
      if (q.limit) docs = docs.slice(0, q.limit);
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [] };
    };
    return {
      path,
      orderBy: (f, d = "asc") => collRef(path, { ...q, order: [f, d] }),
      limit: (n) => collRef(path, { ...q, limit: n }),
      where: (f, op, v) => collRef(path, { ...q, where: [...(q.where || []), [f, op, v]] }),
      get: async () => run(),
      onSnapshot(next) { const fn = () => next(run()); listeners.add(fn); setTimeout(fn, 5); return () => listeners.delete(fn); },
      doc: (id) => docRef(`${path}/${id || Math.random().toString(36).slice(2)}`),
      add: async (d) => { const r = docRef(`${path}/${Math.random().toString(36).slice(2)}`); await r.set(d); return r; },
    };
  }
  const db = { doc: docRef, collection: (p) => collRef(p) };

  const user = {
    id: async () => "u_me", can: async () => true, canEdit: async () => true, isOwner: async () => true,
    profiles: async (ids) => Object.fromEntries(ids.map(id => [id, { id, name: id === "u_partner" ? "Ananya Singh" : "" }])),
  };

  const replies = {
    fever: 'Sorry she\'s unwell tonight. Keep giving her small sips of water, and check her temperature again in an hour.\n\n```json\n{"entries":[{"date":"TODAY","type":"symptom","what":"Fever 39.4","details":"since evening"},{"type":"care","what":"Paracetamol 5 ml","details":"crocin"},{"type":"care","what":"Kadha","details":"before bed"},{"type":"health","what":"sick"}]}\n```',
    default: 'Lovely to hear she had a good day. Keep the routine going.\n\n```json\n{"entries":[{"type":"health","what":"well"}]}\n```',
  };
  async function sample(turns, opts = {}) {
    window.__lastTurns = turns;
    const last = turns[turns.length - 1].content.toLowerCase();
    const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const full = (last.includes("fever") ? replies.fever : replies.default).replace("TODAY", today);
    let text = "";
    for (const word of full.split(/(?<= )/)) {
      if (opts.signal?.aborted) throw { code: "cancelled", text };
      await new Promise(r => setTimeout(r, 8));
      text += word;
      opts.onText?.({ text, delta: word });
    }
    return { text, truncated: false, modelTierApplied: "default" };
  }

  // ?seed=1 fills a few weeks of example entries for screenshots.
  if (location.search.includes("seed")) {
    const d = new Date();
    const key = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
    store.set("profile/divisha", { name: "Divisha", dob: "2024-06-15", doctorName: "Dr Mehta", doctorPhone: "98200 12345", allergies: "", routine: [{ what: "Vitamin D", often: "daily" }] });
    const rows = [
      [1, "symptom", "Cough at night", "dry, woke twice", "u_partner"], [1, "care", "Steam", "10 min before bed", "u_partner"], [1, "health", "off", "", "u_partner"],
      [2, "health", "well", "", "u_me"], [3, "growth", "Weight 12.3 kg", "at the clinic", "u_me"], [3, "doctor", "Dr Mehta, routine check", "growing well, keep vitamin D", "u_me"],
      [6, "care", "Steam", "", "u_partner"], [7, "symptom", "Blocked nose", "", "u_partner"], [9, "growth", "Said her first full sentence", "\"Mumma, paani do\"", "u_me"],
    ];
    // Two months of everyday "How she is", with two cough spells.
    for (let n = 2; n < 60; n++) {
      const spell = (n >= 12 && n <= 14) || (n >= 38 && n <= 41);
      if (n % 9 === 4 && !spell) continue;                         // some days nothing is noted
      const level = !spell ? "well" : (n === 13 || n === 39 || n === 40) ? "sick" : "off";
      rows.push([n, "health", level, "", n % 2 ? "u_partner" : "u_me"]);
      if (spell) { rows.push([n, "symptom", n === 13 || n === 39 ? "Fever 38.6" : "Cough at night", "", "u_partner"]); rows.push([n, "care", "Steam", "before bed", "u_partner"]); }
      if (n === 13 || n === 40) rows.push([n, "care", "Kadha", "", "u_me"]);
    }
    rows.push([40, "doctor", "Dr Mehta", "viral, no antibiotic", "u_me"]);
    rows.forEach(([n, type, what, details, by], i) => store.set(`entries/e${i}`, { date: key(n), type, what, details, by, createdAt: new Date().toISOString() }));
    store.set(`chatList/${key(1)}`, { day: key(1), firstLine: "Cough at night again, gave steam" });
    store.set(`chats/${key(1)}`, { day: key(1), messages: { a: { role: "user", text: "Cough at night again, gave steam", by: "u_partner", createdAt: new Date(Date.now() - 864e5).toISOString() }, b: { role: "assistant", text: "Poor thing. Steam was a good call. Keep her room warm tonight.", createdAt: new Date(Date.now() - 864e5 + 6e4).toISOString(), savedEntryIds: ["e0", "e1", "e2"] } } });
    store.set(`chatList/${key(3)}`, { day: key(3), firstLine: "Clinic visit, 12.3 kg" });
  }

  sample.json = async (prompt, opts = {}) => {
    window.__notesPrompt = prompt;
    window.__notesCalls = (window.__notesCalls || 0) + 1;
    await new Promise((r, j) => { const t = setTimeout(r, 400); opts.signal?.addEventListener("abort", () => { clearTimeout(t); j({ code: "cancelled" }); }); });
    const lines = [...prompt.matchAll(/^\[(\d+)\] (\S+) · ([^·]+) · (.*)$/gm)].map(m => ({ n: Number(m[1]), date: m[2], type: m[3].trim(), rest: m[4] }));
    const pick = (fn) => lines.filter(fn).map(l => l.n);
    const health = pick(l => l.type === "How she is");
    const steam = pick(l => /steam/i.test(l.rest));
    const cough = pick(l => /cough/i.test(l.rest));
    const doctor = lines.filter(l => l.type === "Doctor");
    return {
      now: [{ text: "Divisha has been mostly well, with a short wobble yesterday.", see: health.slice(-3) }, { text: "A point with nothing behind it.", see: [999] }],
      working: steam.length ? [{ text: "Steam at bedtime seems to settle her cough within a night or two.", see: steam }] : [],
      tryNext: cough.length ? [{ text: "Coughs show up at night. Keep her room warm and ask Dr Mehta at the next visit if it keeps coming back.", see: cough.slice(-2) }] : [],
      moments: doctor.map(l => ({ text: `${l.date.slice(8)} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(l.date.slice(5, 7))]}: ${l.rest}`, see: [l.n] })),
    };
  };

  const caps = { db, user, sample: location.search.includes("nosample") ? null : sample };
  window.claude = { use: async (name) => (name in caps ? caps[name] : null) };
})();
