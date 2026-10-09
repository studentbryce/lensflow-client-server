/**
 * PATCH booking details for the owning photographer only.
 * Existing Supabase user JWT + PostgreSQL RLS remain the authority.
 * Deliberately excludes status, price, ownership and service changes.
 */
import { BookingRequestError, minutesFromTime, slotIsAvailable, validateCreateBookingBody } from './bookingCreateService.js';
import { findBookingById } from './bookingService.js';

const ALLOWED = new Set(['booking_date', 'start_time', 'location', 'notes']);
const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };
const timeText = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;

export function validateUpdateBookingBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        fail(400, 'INVALID_BODY', 'A JSON booking object is required.');
    }
    const keys = Object.keys(body);
    if (!keys.length) fail(400, 'EMPTY_UPDATE', 'Provide at least one field to update.');
    if (keys.some(key => !ALLOWED.has(key))) {
        fail(400, 'INVALID_FIELDS', 'Only booking_date, start_time, location and notes can be updated.');
    }
    for (const field of ['location', 'notes']) {
        if (Object.hasOwn(body, field) && body[field] !== null && typeof body[field] !== 'string') {
            fail(400, 'INVALID_FIELDS', `${field} must be text or null.`);
        }
        if (typeof body[field] === 'string' && body[field].length > (field === 'location' ? 300 : 2000)) {
            fail(400, 'INVALID_FIELDS', `${field} is too long.`);
        }
    }
    return {
        scheduleChanged: Object.hasOwn(body, 'booking_date') || Object.hasOwn(body, 'start_time'),
        body,
    };
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

/** Returns the updated row, or raises an HTTP-mapped BookingRequestError. */
export async function updatePhotographerBooking(db, userId, bookingId, body) {
    const input = validateUpdateBookingBody(body);

    // A hidden booking and a missing booking must look identical to the caller.
    const current = await findBookingById(db, bookingId);
    if (!current) fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');

    const profile = await queryOrFail(db.from('profiles').select('role').eq('user_id', userId).maybeSingle());
    if (profile?.role !== 'photographer') {
        fail(403, 'PHOTOGRAPHER_REQUIRED', 'Only photographers can update bookings through this endpoint.');
    }
    const photographer = await queryOrFail(db.from('photographer_profiles').select('photographer_id').eq('user_id', userId).maybeSingle());
    if (!photographer || current.photographer_id !== photographer.photographer_id) {
        fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }
    if (!['pending', 'confirmed'].includes(current.status)) {
        fail(409, 'BOOKING_LOCKED', 'Only pending or confirmed bookings can be edited.');
    }

    const changes = {};
    for (const field of ['location', 'notes']) {
        if (Object.hasOwn(input.body, field)) {
            changes[field] = typeof input.body[field] === 'string' ? (input.body[field].trim() || null) : null;
        }
    }

    if (input.scheduleChanged) {
        const date = Object.hasOwn(input.body, 'booking_date') ? input.body.booking_date : current.booking_date;
        const startText = Object.hasOwn(input.body, 'start_time') ? input.body.start_time : current.start_time;
        // Reuse the POST date/time validator, including NZ local future-time checks.
        const validated = validateCreateBookingBody({
            client_id: current.client_id,
            service_id: current.service_id,
            booking_date: date,
            start_time: startText,
        });
        const oldStart = minutesFromTime(current.start_time);
        const oldEnd = minutesFromTime(current.end_time);
        const duration = oldEnd - oldStart; // Preserve the booking's existing duration and price.
        if (oldStart === null || oldEnd === null || duration <= 0 || duration > 1440 || validated.start + duration >= 1440) {
            fail(422, 'INVALID_DURATION', 'The booking cannot fit within the selected day.');
        }
        const end = validated.start + duration;

        // Do not reschedule a booking that is already linked to a financial or delivery record.
        for (const table of ['invoices', 'galleries']) {
            const linked = await queryOrFail(db.from(table).select(table === 'invoices' ? 'invoice_id' : 'gallery_id')
                .eq('booking_id', bookingId).limit(1));
            if (linked?.length) {
                fail(409, 'BOOKING_HAS_DEPENDENCIES', 'This booking has an invoice or gallery and cannot be rescheduled.');
            }
        }

        const photographerId = photographer.photographer_id;
        const rules = await queryOrFail(db.from('availability_rules').select('day_of_week, start_time, end_time, is_available').eq('photographer_id', photographerId));
        const exceptions = await queryOrFail(db.from('availability_exceptions').select('start_time, end_time, is_available').eq('photographer_id', photographerId).eq('exception_date', date));
        const allBookings = await queryOrFail(db.from('bookings').select('booking_id, start_time, end_time, status').eq('photographer_id', photographerId).eq('booking_date', date));
        const otherBookings = (allBookings ?? []).filter(row => row.booking_id !== bookingId);
        if (!slotIsAvailable({ date, start: validated.start, end, rules: rules ?? [], exceptions: exceptions ?? [], bookings: otherBookings })) {
            fail(409, 'SLOT_UNAVAILABLE', 'This booking time is not available.');
        }
        changes.booking_date = date;
        changes.start_time = timeText(validated.start);
        changes.end_time = timeText(end);
    }

    // Conditional update avoids overwriting another edit of the same booking made
    // after our initial read. It does not eliminate cross-booking slot races.
    const updated = await queryOrFail(db.from('bookings')
        .update(changes)
        .eq('booking_id', bookingId)
        .eq('photographer_id', photographer.photographer_id)
        .eq('updated_at', current.updated_at)
        .select('booking_id, photographer_id, client_id, service_id, booking_date, start_time, end_time, location, notes, status, total_amount, created_at, updated_at')
        .maybeSingle());
    if (!updated) fail(409, 'BOOKING_CHANGED', 'This booking was changed by another request. Refresh and try again.');
    return updated;
}
