// Bump this version on every deploy to force old caches to be purged.
const CACHE_NAME = 'kajola-care-pwa-v4';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];

self.addEventListener('install', (e) => {
  // Activate the new worker immediately instead of waiting for old tabs to close.
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(CORE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // Delete every cache that isn't the current version, then take control of open pages.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting worker to take over right away.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHashedAsset(url) {
  // Vite emits immutable, content-hashed files under /assets/ - safe to cache-first.
  return url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Only handle same-origin requests; let the browser deal with cross-origin (CDNs, Supabase, etc.).
  if (url.origin !== self.location.origin) return;

  // Immutable hashed build assets: cache-first (fast, and the hash guarantees freshness).
  if (isHashedAsset(url)) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Everything else (navigations / index.html / non-hashed files): network-first.
  // This is the key fix: a fresh index.html is fetched whenever online, so it always
  // points at the current asset hashes instead of a stale, missing bundle.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
