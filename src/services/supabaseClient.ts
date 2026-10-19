import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getClientSupabase(): SupabaseClient | null {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (!url || !key || url.includes('YOUR_SUPABASE_PROJECT_ID')) {
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
