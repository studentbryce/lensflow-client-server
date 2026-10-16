import { apiFetch } from './apiClient';
export const apiGetClientGalleries = () => apiFetch('/api/client/galleries');
export const apiGetClientGallery = id => apiFetch(`/api/client/galleries/${encodeURIComponent(id)}`);
export const apiGetClientGalleryDownload = (id, mediaId) =>
  apiFetch(`/api/client/galleries/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}/download`);

/** Binary response: unlike apiFetch(), the social export returns image/jpeg, not JSON. */
export async function apiGetClientGallerySocialExport(id, mediaId) {
  const { supabase } = await import('../lib/supabaseClient');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Please sign in to continue.');
  const response = await fetch(
    `/api/client/galleries/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}/export?size=social`,
    { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }
  );
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error?.message || 'Unable to prepare this photo for sharing.');
  }
  if (!response.headers.get('content-type')?.includes('image/jpeg')) {
    throw new Error('The server did not return a JPEG image.');
  }
  return response.blob();
}
