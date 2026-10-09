import { apiFetch } from './apiClient';

/** Retrieve bookings visible to the signed-in user through Express + RLS. */
export function apiGetBookings() {
    return apiFetch('/api/bookings');
}

/** Retrieve a single booking by UUID. RLS still determines access. */
export function apiGetBookingById(bookingId) {
    if (typeof bookingId !== 'string' || !bookingId.trim()) {
        throw new Error('A booking ID is required.');
    }

    return apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}`);
}
