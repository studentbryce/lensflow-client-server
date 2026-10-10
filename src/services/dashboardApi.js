import { apiFetch } from './apiClient';

/** Dashboard read-only summary via Express; date uses the browser's local day. */
export function apiGetPhotographerDashboard(today) {
  return apiFetch(`/api/dashboard?today=${encodeURIComponent(today)}`);
}
