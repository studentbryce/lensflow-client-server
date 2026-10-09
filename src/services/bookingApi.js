import { apiFetch } from './apiClient';

/** Retrieve bookings visible to the signed-in user through Express + RLS. */
export function apiGetBookings() {
    return apiFetch('/api/bookings');
}
