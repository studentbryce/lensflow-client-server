import { supabase } from '../lib/supabaseClient';

/**
 * Shared React-to-Express client. The access token comes from Supabase Auth,
 * but application data will be retrieved through Express REST endpoints.
 */
export async function apiFetch(path, options = {}) {
    if (!path.startsWith('/api/')) {
        throw new Error('API paths must begin with /api/');
    }

    const { data: { session }, error: sessionError } =
        await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
        throw new Error('Please sign in to continue.');
    }

    const headers = new Headers(options.headers ?? {});
    headers.set('Authorization', `Bearer ${session.access_token}`);

    if (options.body != null && !(options.body instanceof FormData) &&
        !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(path, { ...options, headers });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(result?.error?.message ?? `API request failed (${response.status}).`);
    }

    return result;
}

export function apiGetMe() {
    return apiFetch('/api/auth/me');
}
