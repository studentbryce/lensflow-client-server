import { apiFetch } from './apiClient';
const base = '/api/photographer/settings';
export const apiGetPhotographerSettings = () => apiFetch(base).then(r => r.data);
export const apiSavePhotographerAccount = body => apiFetch(`${base}/account`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.data);
export const apiSavePhotographerBusiness = body => apiFetch(`${base}/business`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.data);
export const apiSavePhotographerTax = body => apiFetch(`${base}/tax`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.data);
export const apiSavePhotographerBank = body => apiFetch(`${base}/bank`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.data);
