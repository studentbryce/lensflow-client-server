import { apiFetch } from './apiClient';

export function apiGetClientDashboard(today) {
  return apiFetch(`/api/client/dashboard?today=${encodeURIComponent(today)}`);
}
export function apiGetClientProfile() {
  return apiFetch('/api/client/profile');
}
export function apiUpdateClientProfile(values) {
  return apiFetch('/api/client/profile', { method: 'PATCH', body: JSON.stringify(values) });
}
