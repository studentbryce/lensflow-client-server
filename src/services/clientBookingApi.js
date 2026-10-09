import { apiFetch } from './apiClient';

/** Authenticated client-only booking reads through Express. */
export function apiGetClientBookings() {
  return apiFetch('/api/client/bookings');
}

export function apiGetClientBookingById(bookingId) {
  if (typeof bookingId !== 'string' || !bookingId.trim()) {
    throw new Error('A booking ID is required.');
  }
  return apiFetch(`/api/client/bookings/${encodeURIComponent(bookingId)}`);
}
