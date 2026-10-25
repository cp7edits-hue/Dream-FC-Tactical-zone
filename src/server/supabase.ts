import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;
let tablesVerified: boolean | null = null;

export function cleanSupabaseUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes('YOUR_SUPABASE_PROJECT_ID')) return null;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  }
}

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const url = cleanSupabaseUrl(rawUrl);

  // Prefer service role key on the server (bypasses RLS for secure server operations)
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key || key.includes('YOUR_SUPABASE_')) {
    return null;
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return supabaseClient;
  } catch (err) {
    console.warn('[Supabase] Failed to initialize Supabase client:', err);
    return null;
  }
}

export async function verifySupabaseTables(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabase();
  if (!client) {
    return { ok: false, message: 'Supabase credentials not configured in environment' };
  }

  try {
    const { data, error } = await client.from('meetings').select('id').limit(1);
    if (error) {
      tablesVerified = false;
      return { ok: false, message: `Table error: ${error.message} (code: ${error.code})` };
    }
    tablesVerified = true;
    return { ok: true, message: 'Supabase meetings table verified and ready' };
  } catch (err: any) {
    tablesVerified = false;
    return { ok: false, message: `Connection error: ${err.message}` };
  }
}

export const isSupabaseConfigured = (): boolean => {
  return getSupabase() !== null;
};

export const areTablesVerified = (): boolean | null => {
  return tablesVerified;
};
