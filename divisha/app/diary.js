// diary.js — the only file that saves or loads.
//
// Where things live in the page's built-in storage:
//   profile/divisha     About Divisha (one document)
//   chatList/<day>      One line per day for the "Past chats" list (small)
//   chats/<day>         That day's whole conversation (messages kept by id)
//   entries/<id>        One diary entry each
//   notes/<span>        Claude's notes for one week, month or year
//                       (for example notes/month-2026-10-01)
//   schedules/<id>      One thing set for her: what, repeat, date, time, until
//   documents/<id>      One kept document: title, brief, date, and its file's id
//
// Document files themselves live in the page's file storage; each
// documents/<id> holds the file's id, and "/_blob/<id>" shows it.

function scheduleFields(x) {
  return {
    what: x.what, details: x.details || "", category: x.category || "care", repeat: x.repeat, date: x.date, until: x.until || "",
    every: x.every || 1, weekdays: x.weekdays || [], times: x.times || [], lead: x.lead ?? 30, for: x.for || "", paused: !!x.paused,
  };
}

function newId() {
  // Time first, so ids sort in the order they were made.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function openDiary() {
  const use = window.claude?.use;
  if (!use) return null;
  const [db, user, files] = await Promise.all([use("db"), use("user"), use("assets")]);
  if (!db) return null;

  const me = (await user?.id().catch(() => null)) || null;
  const writeAnswer = await user?.can("data.write").catch(() => null);
  const canWrite = writeAnswer !== false;          // null means "not told": try, and let a refused save decide
  const nameCache = {};

  const stamp = () => ({ by: me, createdAt: new Date().toISOString() });

  // Reminders, share links and the list of people come from the self-hosted
  // server (window.divishaHost). On claude.ai they're absent and hidden.
  const host = window.divishaHost || null;

  return {
    me,
    canWrite,
    reminders: host?.reminders || null,
    shares: host?.shares || null,
    people: host?.people || null,
    canUpload: !!files,            // only people who can edit the page get file storage

    // ── About Divisha ────────────────────────────────────────────────
    watchProfile(onChange, onError) {
      return db.doc("profile/divisha").onSnapshot(s => onChange(s.exists ? s.data() : {}), onError);
    },
    saveProfile(profile) {
      return db.doc("profile/divisha").set({ ...profile, updatedAt: new Date().toISOString(), updatedBy: me });
    },

    // ── Chats ────────────────────────────────────────────────────────
    watchChatList(onChange, onError) {
      return db.collection("chatList").orderBy("day", "desc").limit(400)
        .onSnapshot(s => onChange(s.docs.map(d => d.data())), onError);
    },
    watchChat(day, onChange, onError) {
      return db.doc(`chats/${day}`).onSnapshot(s => {
        const map = (s.exists && s.data().messages) || {};
        const list = Object.entries(map).map(([id, m]) => ({ id, ...m }))
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        onChange(list);
      }, onError);
    },
    // Adds one message to a day's chat. Each message sits under its own id,
    // so two parents writing at once don't overwrite each other.
    async addMessage(day, message, { isFirst = false } = {}) {
      const id = newId();
      const msg = { ...message, by: me, createdAt: new Date().toISOString() };
      const ref = db.doc(`chats/${day}`);
      try {
        await ref.update({ messages: { [id]: msg } });
      } catch (e) {
        if (e?.code !== "invalid_argument") throw e;
        await ref.set({ day, messages: { [id]: msg } });       // first message of the day
      }
      if (isFirst && message.role === "user") {
        const files = (message.attachments || []).map(a => a.fileName).join(", ");
        await db.doc(`chatList/${day}`).set({ day, firstLine: String(message.text || (files ? `Attached ${files}` : "")).slice(0, 90) });
      }
      return id;
    },
    updateMessage(day, id, changes) {
      return db.doc(`chats/${day}`).update({ messages: { [id]: changes } });
    },

    // ── Entries ──────────────────────────────────────────────────────
    watchEntries(onChange, onError) {
      return db.collection("entries").orderBy("date", "desc").limit(1000)
        .onSnapshot(s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
    },
    async addEntries(list, fromMessage = null) {
      const ids = [];
      for (const e of list) {
        const id = newId();
        await db.doc(`entries/${id}`).set({
          date: e.date, type: e.type, what: e.what, details: e.details || "",
          by: me, createdAt: new Date().toISOString(), ...(fromMessage ? { fromMessage } : {}),
        });
        ids.push(id);
      }
      return ids;
    },
    updateEntry(id, e) {
      return db.doc(`entries/${id}`).update({
        date: e.date, type: e.type, what: e.what, details: e.details || "",
        editedBy: me, editedAt: new Date().toISOString(),
      });
    },
    deleteEntry(id) {
      return db.doc(`entries/${id}`).delete();
    },

    // The live list above holds the latest 1000 entries. A long span that
    // reaches further back is read here, one month at a time.
    LIVE_LIMIT: 1000,
    async loadEntries(from, to) {
      const months = [];
      for (let d = from.slice(0, 7); d <= to.slice(0, 7);) {
        months.push(d);
        const [y, m] = d.split("-").map(Number);
        d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      }
      const parts = await Promise.all(months.map(async (ym) => {
        const snap = await db.collection("entries")
          .where("date", ">=", ym === from.slice(0, 7) ? from : `${ym}-01`)
          .where("date", "<=", ym === to.slice(0, 7) ? to : `${ym}-31`)
          .limit(1000).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }));
      return parts.flat().filter(e => e.date >= from && e.date <= to);
    },

    // ── Claude's Look back notes ─────────────────────────────────────
    watchNotes(spanKey, onChange, onError) {
      return db.doc(`notes/${spanKey}`).onSnapshot(s => onChange(s.exists ? s.data() : null), onError);
    },
    saveNotes(spanKey, notes) {
      return db.doc(`notes/${spanKey}`).set({ ...notes, writtenAt: new Date().toISOString(), writtenBy: me });
    },

    // ── Her schedule ─────────────────────────────────────────────────
    watchSchedules(onChange, onError) {
      return db.collection("schedules").orderBy("date", "asc").limit(500)
        .onSnapshot(s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
    },
    async addSchedules(list, fromMessage = null) {
      const ids = [];
      for (const x of list) {
        const id = newId();
        await db.doc(`schedules/${id}`).set({ ...scheduleFields(x), done: {}, ...stamp(), ...(fromMessage ? { fromMessage } : {}) });
        ids.push(id);
      }
      return ids;
    },
    updateSchedule(id, x) {
      // `time: ""` clears the single time older items had; `times` replaces it.
      return db.doc(`schedules/${id}`).update({ ...scheduleFields(x), time: "", editedBy: me, editedAt: new Date().toISOString() });
    },
    setPaused(id, paused) {
      return db.doc(`schedules/${id}`).update({ paused: !!paused, editedBy: me, editedAt: new Date().toISOString() });
    },
    // Done or Skip for one occurrence ("2026-11-02 09:00"); null clears it.
    markOccurrence(id, key, status) {
      return db.doc(`schedules/${id}`).update({ done: { [key]: status ? { status, by: me, at: new Date().toISOString() } : null } });
    },
    deleteSchedule(id) {
      return db.doc(`schedules/${id}`).delete();
    },

    // ── Documents ────────────────────────────────────────────────────
    watchDocuments(onChange, onError) {
      return db.collection("documents").orderBy("date", "desc").limit(1000)
        .onSnapshot(s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
    },
    // Uploads one file (a photo or PDF) and returns what to remember about it.
    async uploadFile(file) {
      if (!files) throw { code: "not_granted" };
      const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
      const up = await files.upload(file, type ? { type } : undefined);
      return { fileId: up.id, fileName: file.name || "file", fileType: up.contentType, fileSize: up.sizeBytes };
    },
    // Keeps an uploaded file as a document, with its title and brief.
    async addDocumentFromFile(meta, { title, brief, date }) {
      const id = newId();
      await db.doc(`documents/${id}`).set({
        title, brief, date,
        fileId: meta.fileId, fileName: meta.fileName, fileType: meta.fileType, fileSize: meta.fileSize,
        ...stamp(),
      });
      return id;
    },
    // Uploads the file, then saves its title and brief. Both or neither:
    // if saving the details fails, the uploaded file is removed again.
    async addDocument(file, details) {
      const meta = await this.uploadFile(file);
      try {
        return await this.addDocumentFromFile(meta, details);
      } catch (e) {
        await files.delete(meta.fileId).catch(() => {});
        throw e;
      }
    },
    updateDocument(id, { title, brief, date }) {
      return db.doc(`documents/${id}`).update({ title, brief, date, editedBy: me, editedAt: new Date().toISOString() });
    },
    async deleteDocument(doc) {
      await db.doc(`documents/${doc.id}`).delete();
      if (files && doc.fileId) await files.delete(doc.fileId).catch(() => {});   // someone else's upload stays; the row is gone
    },
    fileUrl(fileId) {
      return `/_blob/${fileId}`;
    },
    async fileBlob(fileId) {
      const res = await fetch(`/_blob/${fileId}`);
      if (!res.ok) throw { code: "not_found" };
      return res.blob();
    },

    // ── Everything, for "Download a copy" ────────────────────────────
    // Reads each collection in pages of 1000, oldest first, so nothing is
    // left out however long the diary gets.
    async everything() {
      async function all(path, field) {
        const found = new Map();
        let from = null;
        for (;;) {
          let q = db.collection(path).orderBy(field, "asc").limit(1000);
          if (from !== null) q = q.where(field, ">=", from);
          const snap = await q.get();
          let added = 0;
          for (const d of snap.docs) if (!found.has(d.id)) { found.set(d.id, { id: d.id, ...d.data() }); added += 1; }
          if (snap.docs.length < 1000 || added === 0) break;
          from = snap.docs[snap.docs.length - 1].data()[field];
        }
        return [...found.values()];
      }
      const [profileSnap, entries, chatList, chats, notes, schedules, documents] = await Promise.all([
        db.doc("profile/divisha").get(),
        all("entries", "date"),
        all("chatList", "day"),
        all("chats", "day"),
        all("notes", "from"),
        all("schedules", "date"),
        all("documents", "date"),
      ]);
      return { profile: profileSnap.exists ? profileSnap.data() : {}, entries, chatList, chats, notes, schedules, documents };
    },

    // ── Names for "added by" ─────────────────────────────────────────
    async names(ids) {
      const wanted = [...new Set(ids.filter(id => id && !(id in nameCache)))];
      if (wanted.length && user?.profiles) {
        const found = await user.profiles(wanted).catch(() => ({}));
        for (const id of wanted) nameCache[id] = (found?.[id]?.name || "").split(" ")[0] || "";
      }
      return nameCache;
    },
  };
}
