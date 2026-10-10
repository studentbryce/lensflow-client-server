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

/** Create a photographer booking through Express. No price, status or owner IDs. */
export function apiCreateBooking({ client_id, service_id, booking_date, start_time, location = '', notes = '' }) {
    return apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ client_id, service_id, booking_date, start_time, location, notes }),
    });
}

/** Update an owned booking's schedule, location or notes through Express. */
export function apiUpdateBooking(bookingId, changes) {
    if (typeof bookingId !== 'string' || !bookingId.trim()) {
        throw new Error('A booking ID is required.');
    }
    return apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
    });
}

/** Permanently delete an owned booking with no linked business records. */
export function apiDeleteBooking(bookingId) {
    if (typeof bookingId !== 'string' || !bookingId.trim()) {
        throw new Error('A booking ID is required.');
    }
    return apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
        method: 'DELETE',
    });
}

/** Transition a booking's status via the photographer-only Express endpoint. */
export function apiUpdateBookingStatus(bookingId, status) {
    if (typeof bookingId !== 'string' || !bookingId.trim()) {
        throw new Error('A booking ID is required.');
    }
    return apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
}

/** Related invoice and gallery summaries for the photographer Booking Details UI. */
export function apiGetBookingRelated(bookingId) {
    if (typeof bookingId !== 'string' || !bookingId.trim()) {
        throw new Error('A booking ID is required.');
    }
    return apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}/related`);
}


/** Photographer New Booking form: client/service choices and weekly rules. */
export function apiGetPhotographerBookingOptions() {
    return apiFetch('/api/bookings/new/options');
}

/** Photographer New Booking form: date exceptions and anonymous occupied intervals. */
export function apiGetPhotographerBookingAvailability(date) {
    return apiFetch(`/api/bookings/availability?date=${encodeURIComponent(date)}`);
}


/** Backward-compatible secure occupied-time lookup for either authorised role. */
export function apiGetBusyBookingTimes(photographerId, date) {
    const params = new URLSearchParams({ photographer_id: photographerId, date });
    return apiFetch(`/api/bookings/availability/busy?${params.toString()}`);
}
