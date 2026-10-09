/**
 * Photographer-only booking status transitions.
 * All reads and writes use the verified caller's JWT-scoped Supabase client.
 * No service-role key, schema/RLS changes, or client-supplied ownership.
 */
import { BookingRequestError } from './bookingCreateService.js';
import { findBookingById } from './bookingService.js';

export const STATUS_TRANSITIONS = Object.freeze({
    pending: ['confirmed', 'declined'],
    confirmed: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    declined: [],
});

const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };

export function validateBookingStatusBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        fail(400, 'INVALID_BODY', 'A JSON object with a status is required.');
    }
    if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'status') ||
        typeof body.status !== 'string' || !['confirmed', 'declined', 'completed', 'cancelled'].includes(body.status)) {
        fail(400, 'INVALID_STATUS', 'Only a valid status field is accepted: confirmed, declined, completed or cancelled.');
    }
    return body.status;
}

async function queryOrFail(query) {
    const { data, error } = await query;
    if (error) {
        const failure = new Error('Database operation failed.');
        failure.cause = error;
        throw failure;
    }
    return data;
}

export async function changePhotographerBookingStatus(db, userId, bookingId, body) {
    const requested = validateBookingStatusBody(body);
    const current = await findBookingById(db, bookingId);
    // Missing and RLS-hidden bookings are indistinguishable.
    if (!current) fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');

    const profile = await queryOrFail(db.from('profiles').select('role').eq('user_id', userId).maybeSingle());
    if (profile?.role !== 'photographer') {
        fail(403, 'PHOTOGRAPHER_REQUIRED', 'Only photographers can change booking status.');
    }
    const photographer = await queryOrFail(db.from('photographer_profiles')
        .select('photographer_id').eq('user_id', userId).maybeSingle());
    if (!photographer || current.photographer_id !== photographer.photographer_id) {
        fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    if (!STATUS_TRANSITIONS[current.status]?.includes(requested)) {
        fail(409, 'INVALID_STATUS_TRANSITION', `Cannot change a ${current.status} booking to ${requested}.`);
    }

    // Prevent silently cancelling or declining bookings already involved in
    // financial or delivery workflows. Such records need a separate refund /
    // invoice-handling process, not an ordinary status toggle.
    if (requested === 'cancelled' || requested === 'declined') {
        for (const [table, column] of [['invoices', 'invoice_id'], ['galleries', 'gallery_id']]) {
            const linked = await queryOrFail(db.from(table).select(column).eq('booking_id', bookingId).limit(1));
            if (linked?.length) {
                fail(409, 'BOOKING_HAS_DEPENDENCIES',
                    'This booking has an invoice or gallery. Resolve those records before cancelling or declining it.');
            }
        }
    }

    // Optimistic concurrency: never overwrite a booking that changed between
    // validation and write, including a concurrent status change.
    const updated = await queryOrFail(db.from('bookings')
        .update({ status: requested })
        .eq('booking_id', bookingId)
        .eq('photographer_id', photographer.photographer_id)
        .eq('status', current.status)
        .eq('updated_at', current.updated_at)
        .select('booking_id, photographer_id, client_id, service_id, booking_date, start_time, end_time, location, notes, status, total_amount, created_at, updated_at')
        .maybeSingle());
    if (!updated) fail(409, 'BOOKING_CHANGED', 'This booking changed before the status update. Refresh and try again.');
    return updated;
}
