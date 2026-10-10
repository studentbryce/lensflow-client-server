import { apiFetch } from './apiClient';

/** Photographer Calendar: all database requests go through Express + RLS. */
export const apiGetCalendar = (start, end) => apiFetch(`/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
export const apiCreateCalendarRule = (body) => apiFetch('/api/calendar/rules', { method: 'POST', body: JSON.stringify(body) });
export const apiDeleteCalendarRule = (id) => apiFetch(`/api/calendar/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const apiCreateCalendarException = (body) => apiFetch('/api/calendar/exceptions', { method: 'POST', body: JSON.stringify(body) });
export const apiDeleteCalendarException = (id) => apiFetch(`/api/calendar/exceptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
