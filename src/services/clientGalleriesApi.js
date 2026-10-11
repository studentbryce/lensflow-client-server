import { apiFetch } from './apiClient';
export const apiGetClientGalleries = () => apiFetch('/api/client/galleries');
export const apiGetClientGallery = id => apiFetch(`/api/client/galleries/${encodeURIComponent(id)}`);
export const apiGetClientGalleryDownload = (id, mediaId) =>
  apiFetch(`/api/client/galleries/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}/download`);
