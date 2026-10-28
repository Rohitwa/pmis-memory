// diary.js — the only file that saves or loads.
//
// Where things live in the page's built-in storage:
//   profile/divisha     About Divisha (one document)
//   chatList/<day>      One line per day for the "Past chats" list (small)
//   chats/<day>         That day's whole conversation (messages kept by id)
//   entries/<id>        One diary entry each
//   notes/<span>        Claude's Look back notes for one week, month or year
//                       (for example notes/month-2026-10-01)

function newId() {
  // Time first, so ids sort in the order they were made.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function openDiary() {
  const use = window.claude?.use;
  if (!use) return null;
  const [db, user] = await Promise.all([use("db"), use("user")]);
  if (!db) return null;

  const me = (await user?.id().catch(() => null)) || null;
  const writeAnswer = await user?.can("data.write").catch(() => null);
  const canWrite = writeAnswer !== false;          // null means "not told": try, and let a refused save decide
  const nameCache = {};

  return {
    me,
    canWrite,

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
        await db.doc(`chatList/${day}`).set({ day, firstLine: String(message.text).slice(0, 90) });
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
