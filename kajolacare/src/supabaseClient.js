import { createClient } from '@supabase/supabase-js';

function readStoredConfig() {
  try {
    if (typeof window === 'undefined') return {};
    return JSON.parse(window.localStorage.getItem('lg_flow_supabase_config') || '{}');
  } catch {
    return {};
  }
}

const runtimeConfig =
  typeof window !== 'undefined' && window.LG_FLOW_SUPABASE_CONFIG
    ? window.LG_FLOW_SUPABASE_CONFIG
    : {};

const storedConfig = readStoredConfig();

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  runtimeConfig.url ||
  storedConfig.url ||
  '';

const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  runtimeConfig.anonKey ||
  storedConfig.anonKey ||
  '';

export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
export const supabaseConfigSource = import.meta.env.VITE_SUPABASE_URL
  ? 'Cloudflare/Vite environment variables'
  : runtimeConfig.url
    ? 'public/supabase-config.js'
    : storedConfig.url
      ? 'browser saved setup'
      : 'not configured';
