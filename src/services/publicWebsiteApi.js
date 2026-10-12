/** Public endpoints deliberately do not require a Supabase Auth session. */
async function publicGet(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(payload?.error?.message ?? `Request failed (${response.status}).`);
  }
  return payload?.data;
}
export const apiGetPublicPhotographers = () => publicGet('/api/public/photographers');
export const apiGetPublicWebsite = slug => publicGet(`/api/public/websites/${encodeURIComponent(slug)}`);
