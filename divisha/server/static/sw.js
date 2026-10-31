// sw.js — lets the installed app open even without a connection.
// The app's own files are fetched fresh when online and kept as a fallback.
// The diary, Claude and document files are never stored here: they always
// come from the server, so nothing private sits in this cache.
const CACHE = "divisha-shell-v2";
const SHELL = new Set(["/", "/style.css", "/screens.js", "/diary.js", "/helper.js", "/claude-shim.js"]);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !SHELL.has(url.pathname)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Keep only real app files, never a redirect to the sign-in page.
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
        }
        return res;
      })
      .catch(() => caches.match(url.pathname).then((hit) => hit || Response.error())),
  );
});

// ── Reminders ──────────────────────────────────────────────────────────
// The server sends each reminder ahead of time. It shows with the phone's
// normal notification sound and vibration, and has Done and Snooze buttons.
self.addEventListener("push", (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = { title: "Divisha Wellness", body: event.data ? event.data.text() : "" }; }
  const isItem = !!m.scheduleId;
  event.waitUntil(self.registration.showNotification(m.title || "Divisha Wellness", {
    body: m.body || "",
    tag: m.tag || undefined,
    renotify: !!m.tag,
    requireInteraction: isItem,
    silent: false,
    vibrate: [200, 100, 200],
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: m.url || "/#schedule", scheduleId: m.scheduleId, key: m.key },
    actions: isItem ? [{ action: "done", title: "Done" }, { action: "snooze", title: "Snooze 10 min" }] : [],
  }));
});

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const d = n.data || {};
  n.close();
  const post = (url, body) => fetch(url, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Divisha": "1" }, body: JSON.stringify(body),
  });
  if (event.action === "done" && d.scheduleId) {
    event.waitUntil(post("/api/schedule/mark", { id: d.scheduleId, key: d.key, status: "done" }));
    return;
  }
  if (event.action === "snooze" && d.scheduleId) {
    event.waitUntil(self.registration.pushManager.getSubscription()
      .then((sub) => sub && post("/api/schedule/snooze", { id: d.scheduleId, key: d.key, minutes: 10, endpoint: sub.endpoint })));
    return;
  }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) { open.navigate(d.url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(d.url);
  }));
});
