import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getClientSupabase(): SupabaseClient | null {
  if (client) return client;

  const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
  let url = '';
  if (rawUrl && !rawUrl.includes('YOUR_SUPABASE_PROJECT_ID')) {
    try {
      const parsed = new URL(rawUrl.trim());
      url = `${parsed.protocol}//${parsed.host}`;
    } catch {
      url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    }
  }
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (!url || !key || key.includes('YOUR_SUPABASE_')) {
    return null;
  }

  try {
    client = createClient(url, key);
    return client;
  } catch (err) {
    console.warn('[Supabase Client] Failed to initialize client:', err);
    return null;
  }
}
