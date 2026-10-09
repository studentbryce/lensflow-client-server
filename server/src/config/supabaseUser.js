import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in server/.env');
}

/**
 * A fresh database client for ONE verified HTTP request.
 *
 * The token was verified by requireAuth before this function is called.
 * Supabase/PostgREST receives the user's JWT and applies existing RLS.
 * Never use a service-role/secret key for normal application CRUD.
 */
export function createUserSupabaseClient(accessToken) {
    if (!accessToken) {
        throw new Error('A verified user access token is required.');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        accessToken: async () => accessToken,
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });
}
