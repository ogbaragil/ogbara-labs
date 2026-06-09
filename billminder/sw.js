// Cleared service worker — network-first so deploys always serve fresh files.
// Falls back to cache only when offline. Bumping CACHE_NAME drops old caches.
const CACHE_NAME = "cleared-v5";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css?v=cleared-4",
  "./app.js?v=cleared-2",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never touch API calls or cross-origin requests (Supabase, fonts).
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Network-first: always try the network, fall back to cache when offline.
  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
