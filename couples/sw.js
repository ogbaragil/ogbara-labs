/* Couples Snakes & Ladders service worker */
const CACHE = "couples-v8";
const ASSETS = ["./","./manifest.webmanifest","./supabase-config.js","./cloud.js",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png",
  "./icons/apple-touch-icon.png","./icons/favicon-32.png"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",(e)=>{
  if (e.request.method!=="GET") return;
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
