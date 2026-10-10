import { apiFetch } from './apiClient';
export const apiGetPhotographerServices = () => apiFetch('/api/photographer/services');
export const apiGetPhotographerServicesContext = () => apiFetch('/api/photographer/services/context');
export const apiGetPhotographerService = id => apiFetch(`/api/photographer/services/${encodeURIComponent(id)}`);
export const apiCreatePhotographerService = values => apiFetch('/api/photographer/services', { method:'POST', body: JSON.stringify(values) });
export const apiUpdatePhotographerService = (id, values) => apiFetch(`/api/photographer/services/${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify(values) });
