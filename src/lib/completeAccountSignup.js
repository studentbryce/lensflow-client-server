import { apiFetch } from "../services/apiClient";

/** Supabase Auth still manages identity; all profile/role database writes go via Express. */
export async function completeAccountSignup(userId) {
  if (!userId) return null;
  const result = await apiFetch('/api/auth/complete-signup', { method: 'POST' });
  return result?.data ?? null;
}
