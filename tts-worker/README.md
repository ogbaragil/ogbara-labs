# Ogbara Labs TTS proxy (premium voice)

A tiny Cloudflare Worker that fronts Google Cloud Text-to-Speech so the API key
stays server-side and every phrase is cached at the edge.

## One-time setup (~10 minutes)

1. **Google key**
   - console.cloud.google.com → create (or pick) a project
   - "APIs & Services" → enable **Cloud Text-to-Speech API**
   - "Credentials" → Create credentials → **API key** → restrict it to the
     Text-to-Speech API only
   - Free tier: ~1M premium (Neural2/WaveNet) characters per month, renewing.

2. **Deploy the Worker** (from this folder)
   ```
   npx wrangler login
   npx wrangler secret put GOOGLE_TTS_KEY     # paste the API key
   npx wrangler deploy
   ```
   Note the printed URL, e.g. `https://ogbara-tts.<account>.workers.dev`.

3. **Point Brainy Trails at it**
   In `brainytrails/supabase-config.js`, set:
   ```js
   window.TTS_PROXY = "https://ogbara-tts.<account>.workers.dev";
   ```
   Bump the Brainy Trails version trio and deploy as usual.

## Safety rails built in
- Origin allowlist: only *.ogbaralabs.xyz (and localhost) may call it.
- 240-character cap per request, voice allowlist.
- Edge caching: repeated phrases never re-bill Google.
Watch usage at console.cloud.google.com → Text-to-Speech → quotas.
