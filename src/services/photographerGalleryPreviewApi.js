import { apiFetch } from './apiClient';

/** Authenticated Express call; does not upload image bytes through Express. */
export async function apiGeneratePhotographerGalleryImagePreview(galleryId, mediaId) {
  const response = await apiFetch(
    `/api/photographer/galleries/${encodeURIComponent(galleryId)}/media/${encodeURIComponent(mediaId)}/preview`,
    { method: 'POST' }
  );
  return response.data;
}
