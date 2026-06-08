/* How Many? PWA service worker — precache the whole app for offline play */
const CACHE = "howmany-v12";
const ASSETS = [
  "./",
  "./app.js",
  "./jungle_intro.mp3",
  "./kids-happy-music.mp3",
  "./manifest.webmanifest","./supabase-config.js","./cloud.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for app assets; network fallback. Everything is local so this works fully offline.
// Cross-origin requests (Supabase API, streamed background music) pass straight through:
// caching opaque responses would bloat the quota, and the music is intentionally stream-only.
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  // Navigations serve the cached "./" shell — a cached /index.html response is a
  // 308 redirect on Cloudflare Pages, and redirected responses from a service
  // worker hard-fail navigations (ERR_FAILED).
  if (request.mode === "navigate") {
    e.respondWith(
      caches.match("./").then((hit) => hit || fetch("./").then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./"));
    })
  );
});
