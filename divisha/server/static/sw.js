// sw.js — lets the installed app open even without a connection.
// The app's own files are fetched fresh when online and kept as a fallback.
// The diary, Claude and document files are never stored here: they always
// come from the server, so nothing private sits in this cache.
const CACHE = "divisha-shell-v1";
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
