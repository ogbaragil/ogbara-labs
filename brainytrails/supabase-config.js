/* Ogbara Labs · Supabase configuration
   These values are safe to be public — data protection comes from
   Row Level Security policies (see SETUP-SUPABASE.md).
   Same values in every app folder: all apps share one project. */
window.SUPABASE_URL = "https://qfjudxzxyvqraogwskwc.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_0Gg8WSiFdWTk17YqclSODg_kdJl0qqB";

// Premium voice proxy (Cloudflare Worker — see /tts-worker/README.md).
// Leave "" to disable the premium voice feature on this deployment.
window.TTS_PROXY = "https://ogbara-tts.ogbaragil.workers.dev";
