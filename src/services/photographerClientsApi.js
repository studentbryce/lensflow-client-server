import { apiFetch } from './apiClient';

export const apiGetPhotographerClients = () => apiFetch('/api/photographer/clients');
export const apiGetPhotographerClient = (id) => apiFetch(`/api/photographer/clients/${encodeURIComponent(id)}`);
export const apiUpdatePhotographerClient = (id, changes) => apiFetch(`/api/photographer/clients/${encodeURIComponent(id)}`, {
  method: 'PATCH',
  body: JSON.stringify(changes),
});
