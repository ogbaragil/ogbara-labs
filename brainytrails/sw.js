/* Brainy Trails · service worker — cache-first, redirect-safe from day one */
const CACHE = "brainytrails-v36";
const ASSETS = [
  "./",
  "./app.js?v=36",
  "./curriculum.js?v=36",
  "./cloud.js?v=36",
  "./supabase-config.js",
  "./kids-happy-music.mp3",
  "./thunder.mp3",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/maskable-512.png",
];

self.addEventListener("install",(e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",(e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",(e)=>{
  if (e.request.method!=="GET") return;
  // Cross-origin (CDN libs, the Kokoro voice model) is managed by the browser
  // and transformers.js's own cache — never duplicated into the app cache.
  try { if (new URL(e.request.url).origin !== self.location.origin) return; } catch { }
  // Navigations always serve the cached app shell at "./" — never a cached
  // /index.html, whose response is a 308-redirect on Cloudflare Pages and is
  // rejected by browsers when served from a service worker (ERR_FAILED).
  if (e.request.mode==="navigate") {
    e.respondWith(caches.match("./").then(hit=>hit||fetch("./").then(res=>{
      if (res.ok && !res.redirected) { const copy=res.clone(); caches.open(CACHE).then(c=>c.put("./",copy)).catch(()=>{}); }
      return res;
    })));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
    if (res.ok && !res.redirected) { const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}); }
    return res;
  }).catch(()=>caches.match("./"))));
});
