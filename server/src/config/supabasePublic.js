import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in server/.env');

/** Public reads run as anon, with no user JWT and NEVER a service-role key. */
export function createPublicSupabaseClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
