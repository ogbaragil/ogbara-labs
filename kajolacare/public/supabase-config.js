/* Ogbara Labs · Kajola Care · Supabase configuration
   These values are safe to be public — data protection comes from the
   Row Level Security policies in kajolacare/supabase/schema.sql.
   Kajola Care shares the one Ogbara Labs Supabase project (same auth.users
   accounts) but stores its data in its own tables (clients, invoices,
   invoice_lines, transactions, app_snapshots) — additive, like Bill Minder.

   Kajola Care reads config from window.LG_FLOW_SUPABASE_CONFIG (its own
   runtime shape) and falls back to the shared window.SUPABASE_URL /
   window.SUPABASE_ANON_KEY names so it stays consistent with the sibling apps.
   Cloudflare Pages build variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
   still take precedence over everything here when set. */
window.SUPABASE_URL = "https://qfjudxzxyvqraogwskwc.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_0Gg8WSiFdWTk17YqclSODg_kdJl0qqB";

window.LG_FLOW_SUPABASE_CONFIG = {
  url: window.SUPABASE_URL,
  anonKey: window.SUPABASE_ANON_KEY,
};
