// claude-shim.js — lets the Divisha Wellness app run outside claude.ai.
//
// On claude.ai the page gets `window.claude.use(name)` from the platform. Here
// this file provides the same calls, backed by the Divisha Wellness server:
//   db         the diary storage, with live updates when the other parent saves
//   user       who is signed in
//   sample     Claude (streamed from the server)
//   assets     photo and PDF storage
//   downloads  saving a file to this device
// The app's own five files are the same on both hosts.
(() => {
  const HEADERS = { "X-Divisha": "1" };

  async function api(method, url, body, { raw = false, headers = {}, signal } = {}) {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      signal,
      headers: { ...HEADERS, ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    if (res.status === 401) { location.href = "/login"; throw { code: "session_expired", message: "signed out" }; }
    if (!res.ok) {
      let err = { code: "unavailable", message: `HTTP ${res.status}` };
      try { const j = await res.json(); err = { code: j.code || err.code, message: j.message || err.message }; } catch { /* not JSON */ }
      throw err;
    }
    return res;
  }
  const json = async (...args) => (await api(...args)).json();
  const freeze = (x) => Object.freeze(x);
  const snap = (d) => freeze({ id: d.id, exists: !!d.exists, data: () => (d.exists ? structuredClone(d.data) : undefined) });

  // ── Live updates: one feed from the server says which paths changed ──
  const subs = new Set();
  let feed = null;
  function startFeed() {
    if (feed) return;
    feed = new EventSource("/api/changes");
    feed.addEventListener("hello", () => subs.forEach(s => s.refresh()));     // (re)connected: catch up
    feed.onmessage = (e) => {
      let paths = [];
      try { paths = JSON.parse(e.data).paths || []; } catch { return; }
      subs.forEach(s => { if (paths.some(p => s.matches(p))) s.refresh(); });
    };
  }
  function subscribe(sub) {
    subs.add(sub);
    startFeed();
    sub.refresh();
    return () => subs.delete(sub);
  }
  window.addEventListener("online", () => subs.forEach(s => s.refresh()));

  function liveSub(matches, load, next, error) {
    let running = false, again = false, dead = false;
    const sub = {
      matches,
      async refresh() {
        if (dead) return;
        if (running) { again = true; return; }
        running = true;
        try { next(await load()); }
        catch (e) { if (e?.code === "invalid_argument") { dead = true; error?.(e); } }
        finally { running = false; if (again) { again = false; sub.refresh(); } }
      },
    };
    return subscribe(sub);
  }

  // ── db ────────────────────────────────────────────────────────────
  const enc = encodeURIComponent;
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function docRef(path) {
    const id = path.split("/").pop();
    const load = async () => snap(await json("GET", `/api/doc?path=${enc(path)}`));
    return freeze({
      id, path,
      get: load,
      set: async (data) => { await api("PUT", `/api/doc?path=${enc(path)}`, { data }); },
      update: async (data) => { await api("PATCH", `/api/doc?path=${enc(path)}`, { data }); },
      delete: async () => { await api("DELETE", `/api/doc?path=${enc(path)}`); },
      onSnapshot: (next, error) => liveSub((p) => p === path, load, next, error),
      collection: (sub) => collRef(`${path}/${sub}`),
    });
  }

  function collRef(path, q = { where: [], order: null, limit: 1000 }) {
    const load = async () => {
      const { docs } = await json("POST", "/api/query", { collection: path, where: q.where, order: q.order, limit: q.limit });
      const list = docs.map(snap);
      return freeze({ docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: { hasPendingWrites: false, fromCache: false } });
    };
    const inColl = (p) => p.slice(0, p.lastIndexOf("/")) === path;
    return freeze({
      path,
      where: (field, op, value) => collRef(path, { ...q, where: [...q.where, [field, op, value]] }),
      orderBy: (field, dir = "asc") => collRef(path, { ...q, order: [field, dir] }),
      limit: (n) => collRef(path, { ...q, limit: n }),
      get: load,
      onSnapshot: (next, error) => liveSub(inColl, load, next, error),
      doc: (id) => docRef(`${path}/${id || newId()}`),
      add: async (data) => { const ref = docRef(`${path}/${newId()}`); await ref.set(data); return ref; },
    });
  }

  const db = freeze({ doc: docRef, collection: (path) => collRef(path) });

  // ── user ──────────────────────────────────────────────────────────
  let mePromise = null;
  const me = () => (mePromise ||= json("GET", "/api/me"));
  let peoplePromise = null;
  const user = freeze({
    id: async () => (await me()).id,
    me: async () => { const m = await me(); return { id: m.id, name: m.name, email: null, isMe: true }; },
    isOwner: async () => (await me()).role === "parent",
    canEdit: async () => (await me()).role === "parent",
    can: async (what) => ((await me()).role === "parent" ? true : what === "data.write" ? false : null),
    profiles: async (ids) => {
      const all = await (peoplePromise ||= json("GET", "/api/people"));
      return Object.fromEntries(ids.map(id => [id, { id, name: all[id]?.name || "", isMe: false }]));
    },
  });

  // ── sample (Claude) ───────────────────────────────────────────────
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  // Pictures go to Claude at up to 1568 px on the long side, as JPEG.
  async function picture(blob) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { type: "image/jpeg", data: btoa(s) };
  }

  async function ask(input, options = {}, mode = "text") {
    const turns = typeof input === "string" ? [{ role: "user", content: input }] : input.map(t => ({ role: t.role, content: t.content }));
    const files = options.images ? [...(options.images.length !== undefined ? options.images : [options.images])] : [];
    for (const f of files) if (!IMAGE_TYPES.includes(f.type)) throw { code: "image_rejected", message: "pictures must be JPEG, PNG, WebP or GIF" };
    const images = await Promise.all(files.map(picture));
    let res;
    try {
      res = await api("POST", "/api/claude", { turns, images, mode }, { signal: options.signal });
    } catch (e) {
      if (e?.name === "AbortError") throw { code: "cancelled", message: "stopped" };
      throw e.code === "unavailable" ? { code: "upstream_error", message: e.message } : e;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "", buffer = "", truncated = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) !== -1) {
          const line = buffer.slice(0, cut).split("\n").find(l => l.startsWith("data: "));
          buffer = buffer.slice(cut + 2);
          if (!line) continue;
          const msg = JSON.parse(line.slice(6));
          if (msg.error) throw { code: msg.error, message: msg.message || msg.error, ...(text ? { text } : {}) };
          if (msg.text) { text += msg.text; options.onText?.({ text, delta: msg.text }); }
          if (msg.done) truncated = !!msg.truncated;
        }
      }
    } catch (e) {
      if (e?.name === "AbortError" || options.signal?.aborted) throw { code: "cancelled", message: "stopped", ...(text ? { text } : {}) };
      throw e;
    }
    if (options.signal?.aborted) throw { code: "cancelled", message: "stopped", ...(text ? { text } : {}) };
    if (!text.trim()) throw { code: "empty_completion", message: "Claude wrote nothing" };
    return { text, truncated, modelTierApplied: options.modelTier || "default" };
  }

  // Reads a reply as JSON the same tolerant way claude.ai does.
  function parseJson(text) {
    const tries = [text.trim()];
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) tries.push(fence[1].trim());
    const first = text.search(/[[{]/), last = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (first !== -1 && last > first) tries.push(text.slice(first, last + 1));
    for (const t of tries) { try { return JSON.parse(t); } catch { /* next */ } }
    throw { code: "invalid_json", message: "the reply wasn't JSON", text };
  }

  const sample = Object.assign((input, options) => ask(input, options, "text"), {
    json: async (input, options = {}) => {
      const r = await ask(input, { ...options, onText: undefined }, "json");
      if (r.truncated) throw { code: "invalid_json", message: "the reply was cut short", text: r.text };
      return parseJson(r.text);
    },
    limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20 * 1048576, mediaTypes: IMAGE_TYPES } }),
  });

  // ── assets (photos and PDFs) ──────────────────────────────────────
  const assets = freeze({
    upload: async (blob, options = {}) => {
      const type = options.type || blob.type;
      return json("POST", "/api/files", blob, { raw: true, headers: { "Content-Type": type } });
    },
    delete: async (ref) => { await api("DELETE", `/api/files/${String(ref).split("/").pop()}`); },
    list: async () => ({ assets: [], usage: {} }),
  });

  // ── downloads ─────────────────────────────────────────────────────
  const downloads = freeze({
    save: async ({ filename, data }) => {
      if (!filename || data === undefined || data === null) throw { code: "bad_request", message: "a file needs a name and contents" };
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    },
  });

  // Viewers (read only) get no file storage and no Claude, as on claude.ai.
  const caps = {
    db: async () => db,
    user: async () => user,
    sample: async () => ((await me()).role === "parent" ? sample : null),
    assets: async () => ((await me()).role === "parent" ? assets : null),
    downloads: async () => downloads,
  };
  window.claude = Object.freeze({ use: async (name) => (caps[name] ? caps[name]().catch(() => null) : null) });
  window.divishaHost = Object.freeze({ signOutUrl: "/logout" });
})();
