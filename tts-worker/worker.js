/* Ogbara Labs TTS proxy — Cloudflare Worker
 * Fronts Google Cloud Text-to-Speech so the API key never ships to clients.
 * Edge-caches every synthesized phrase, so repeats cost nothing and return fast.
 * Deploy: see README.md in this folder.
 */
const VOICES = new Set([
  "en-AU-Neural2-A", "en-AU-Neural2-B", "en-AU-Neural2-C", "en-AU-Neural2-D",
  "en-AU-Wavenet-A", "en-AU-Wavenet-C", "en-GB-Neural2-A", "en-US-Neural2-F",
]);
const MAX_CHARS = 240;

const okOrigin = (origin) => {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.hostname === "ogbaralabs.xyz" || u.hostname.endsWith(".ogbaralabs.xyz")) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;   // local dev
  } catch { }
  return false;
};
const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
});

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: okOrigin(origin) ? corsHeaders(origin) : {} });
    }
    if (req.method !== "POST") return new Response("POST only", { status: 405 });
    if (!okOrigin(origin)) return new Response("Forbidden origin", { status: 403 });

    let body;
    try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
    const text = String(body.text || "").trim().slice(0, MAX_CHARS);
    const voice = VOICES.has(body.voice) ? body.voice : "en-AU-Neural2-A";
    if (!text) return new Response("Empty text", { status: 400 });

    // edge cache key: hash of voice+text
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(voice + "\u0000" + text));
    const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    const cacheKey = new Request(`https://tts-cache.ogbaralabs.xyz/${voice}/${hash}`);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const out = new Response(cached.body, cached);
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => out.headers.set(k, v));
      out.headers.set("X-TTS-Cache", "HIT");
      return out;
    }

    const g = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.slice(0, 5), name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
      }),
    });
    if (!g.ok) return new Response("Upstream error " + g.status, { status: 502, headers: corsHeaders(origin) });
    const { audioContent } = await g.json();
    const bin = atob(audioContent);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const resp = new Response(bytes, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    });
    ctx.waitUntil(caches.default.put(cacheKey, resp.clone()));
    const out = new Response(resp.body, resp);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => out.headers.set(k, v));
    out.headers.set("X-TTS-Cache", "MISS");
    return out;
  },
};
