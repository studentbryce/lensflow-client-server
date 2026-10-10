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

/** New-booking reference data and availability: no direct React database reads. */
export function apiGetClientBookingForm() {
  return apiFetch('/api/client/bookings/new/options');
}

export function apiGetClientBookingAvailability(date) {
  return apiFetch(`/api/client/bookings/availability?date=${encodeURIComponent(date)}`);
}

export function apiCreateClientBooking(body) {
  return apiFetch('/api/client/bookings', { method: 'POST', body: JSON.stringify(body) });
}
