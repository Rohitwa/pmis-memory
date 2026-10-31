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
    id: async () => "u_me", can: async () => !location.search.includes("readonly"), canEdit: async () => true, isOwner: async () => true,
    profiles: async (ids) => Object.fromEntries(ids.map(id => [id, { id, name: id === "u_partner" ? "Ananya Singh" : id === "u_me" ? "Rohit Singh" : "" }])),
  };

  const replies = {
    fever: 'Sorry she\'s unwell tonight. Keep giving her small sips of water, and check her temperature again in an hour.\n\n```json\n{"entries":[{"date":"TODAY","type":"symptom","what":"Fever 39.4","details":"since evening"},{"type":"care","what":"Paracetamol 5 ml","details":"crocin"},{"type":"care","what":"Kadha","details":"before bed"},{"type":"health","what":"sick"}]}\n```',
    attach: 'This is a prescription from Dr Mehta for a dry cough, and a discharge summary. I\'ve offered to keep both in Documents and add the syrup to her schedule.\n\n```json\n{"entries":[{"type":"doctor","what":"Dr Mehta","details":"dry cough, no antibiotic"}],"schedules":[{"what":"Cough syrup 5 ml","repeat":"daily","date":"TODAY","time":"21:00","until":"","details":"at night for 5 days"}],"documents":[{"file":1,"title":"Cough syrup prescription","date":"TODAY","brief":"Dr Mehta: dry cough, no antibiotic. Syrup at night for 5 days."},{"file":2,"title":"Discharge summary","date":"TODAY","brief":"Chest infection; nebuliser at home for 5 days."}]}\n```',
    remind: 'Done. I\'ve offered to add vitamin D drops at 9 am every day to her schedule.\n\n```json\n{"entries":[],"schedules":[{"what":"Vitamin D drops","repeat":"daily","date":"TODAY","time":"09:00","until":"","details":"400 IU, as Dr Mehta said"}]}\n```',
    default: 'Lovely to hear she had a good day. Keep the routine going.\n\n```json\n{"entries":[{"type":"health","what":"well"}]}\n```',
  };
  async function sample(turns, opts = {}) {
    window.__lastTurns = turns;
    const lastTurn = turns[turns.length - 1].content;
    const last = (lastTurn.includes("Parent's message:\n") ? lastTurn.split("Parent's message:\n").pop() : lastTurn).toLowerCase();
    const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    window.__lastImages = (opts.images || []).map(b => ({ type: b.type, size: b.size }));
    if (opts.images?.length && location.search.includes("noimages")) throw { code: "images_unavailable" };
    const full = (last.includes("[attached") ? replies.attach : last.includes("fever") ? replies.fever : /remind|every day at/.test(last) ? replies.remind : replies.default).replace(/TODAY/g, today);
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
    store.set("profile/divisha", { name: "Divisha", dob: "2024-06-15", doctorName: "Dr Mehta", doctorPhone: "98200 12345", allergies: "" });
    store.set("schedules/s1", { what: "Vitamin D drops", repeat: "daily", date: key(30), time: "09:00", until: "", details: "400 IU", by: "u_me", createdAt: new Date().toISOString() });
    store.set("schedules/s2", { what: "Saline nasal drops", repeat: "daily", date: key(1), time: "20:00", until: key(-3), details: "", by: "u_partner", createdAt: new Date().toISOString() });
    store.set("schedules/s3", { what: "Dr Mehta follow-up", repeat: "once", date: key(-2), time: "17:00", until: "", details: "bring the cough notes", by: "u_me", createdAt: new Date().toISOString() });
    store.set("documents/d1", { title: "Blood test report", brief: "Haemoglobin 10.4, a little low. Dr Mehta suggests iron-rich food and a recheck in 3 months.", date: key(3), fileId: "a".repeat(32), fileName: "blood-test.png", fileType: "image/png", fileSize: 182000, by: "u_me", createdAt: new Date().toISOString() });
    store.set("documents/d3", { title: "Discharge summary", brief: "Two-day stay for a chest infection in September. Nebuliser at home for 5 days, review with Dr Mehta.", date: key(10), fileId: "c".repeat(32), fileName: "discharge-summary.pdf", fileType: "application/pdf", fileSize: 64000, by: "u_me", createdAt: new Date().toISOString() });
    store.set("documents/d2", { title: "Vaccination card", brief: "All due vaccines done up to 18 months. Next: flu shot this winter.", date: key(40), fileId: "b".repeat(32), fileName: "vaccination-card.png", fileType: "image/png", fileSize: 240000, by: "u_partner", createdAt: new Date().toISOString() });
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

  sample.limits = async () => ({
    maxPromptBytes: 262144,
    ...(location.search.includes("noimages") ? {} : { images: { maxCount: 5, maxInputBytes: 20 * 1048576, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } }),
  });
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

  window.__saved = [];
  const downloads = {
    save: async ({ filename, data }) => {
      if (!/\.(gif|png|jpg|jpeg|webp|mp4|webm|txt|json|md|csv|pdf|svg|html|zip)$/i.test(filename)) throw { code: "rejected_extension" };
      if (location.search.includes("decline")) throw { code: "declined" };
      window.__saved.push({ filename, data: String(data) });
      return { status: "saved" };
    },
  };
  window.__assets = {};
  const assets = {
    upload: async (blob, opts = {}) => {
      const type = opts.type || blob.type;
      if (!/^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(type)) throw { code: "unsupported_type" };
      if (blob.size > 20 * 1048576) throw { code: "too_large" };
      const id = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      window.__assets[id] = { type, size: blob.size };
      (window.__assetBlobs = window.__assetBlobs || {})[id] = blob;
      return { id, url: "/_blob/" + id, sizeBytes: blob.size, contentType: type };
    },
    delete: async (id) => { delete window.__assets[id]; },
    list: async () => ({ assets: [], usage: {} }),
  };
  const caps = { db, user, assets: location.search.includes("noassets") ? null : assets, sample: location.search.includes("nosample") ? null : sample, downloads: location.search.includes("nodownloads") ? null : downloads };
  window.claude = { use: async (name) => (name in caps ? caps[name] : null) };
})();
