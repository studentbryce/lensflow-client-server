/**
 * DELETE /api/bookings/:id
 * Hard-delete only an owned, pending/confirmed booking without business dependants.
 * Every query uses the caller's JWT-scoped Supabase client (existing PostgreSQL RLS).
 */
import { BookingRequestError } from './bookingCreateService.js';
import { findBookingById } from './bookingService.js';

const fail = (status, code, message) => {
    throw new BookingRequestError(status, code, message);
};

async function queryOrFail(query) {
    const { data, error } = await query;
    if (error) {
        const failure = new Error('Database operation failed.');
        failure.cause = error;
        throw failure;
    }
    return data;
}

/**
 * Returns the deleted booking ID. Throws BookingRequestError for expected failures.
 * Database foreign keys remain the final defence against newly linked records.
 */
export async function deletePhotographerBooking(db, userId, bookingId) {
    // RLS-hidden and nonexistent bookings have the same response.
    const current = await findBookingById(db, bookingId);
    if (!current) fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');

    const profile = await queryOrFail(
        db.from('profiles').select('role').eq('user_id', userId).maybeSingle()
    );
    if (profile?.role !== 'photographer') {
        fail(403, 'PHOTOGRAPHER_REQUIRED', 'Only photographers can delete bookings through this endpoint.');
    }

    const photographer = await queryOrFail(
        db.from('photographer_profiles').select('photographer_id').eq('user_id', userId).maybeSingle()
    );
    if (!photographer || current.photographer_id !== photographer.photographer_id) {
        fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    // Do not delete completed, cancelled or declined history.
    if (!['pending', 'confirmed'].includes(current.status)) {
        fail(409, 'BOOKING_LOCKED', 'Only pending or confirmed bookings can be deleted.');
    }

    // FK restrictions in LensFlow V1: invoices, galleries and reviews all
    // reference bookings with ON DELETE RESTRICT. Payments reference invoices,
    // so an invoice check also protects its payments.
    const references = [
        ['invoices', 'invoice_id'],
        ['galleries', 'gallery_id'],
        ['reviews', 'review_id'],
    ];
    for (const [table, column] of references) {
        const linked = await queryOrFail(
            db.from(table).select(column).eq('booking_id', bookingId).limit(1)
        );
        if (linked?.length) {
            fail(409, 'BOOKING_HAS_DEPENDENCIES',
                'This booking has an invoice, payment, gallery or review and cannot be deleted.');
        }
    }

    // Conditional deletion prevents removing a row changed since we read it.
    // A concurrent insert of a linked record is still protected by the DB FK.
    const { data, error } = await db.from('bookings')
        .delete()
        .eq('booking_id', bookingId)
        .eq('photographer_id', photographer.photographer_id)
        .eq('updated_at', current.updated_at)
        .eq('status', current.status)
        .select('booking_id')
        .maybeSingle();

    if (error) {
        // PostgreSQL foreign-key violation (23503): a dependency was added,
        // or was not visible to this user, before the DELETE executed.
        if (error.code === '23503') {
            fail(409, 'BOOKING_HAS_DEPENDENCIES',
                'This booking has related records and cannot be deleted.');
        }
        const failure = new Error('Unable to delete booking.');
        failure.cause = error;
        throw failure;
    }
    if (!data?.booking_id) {
        fail(409, 'BOOKING_CHANGED', 'This booking changed before deletion. Refresh and try again.');
    }
    return { booking_id: data.booking_id };
}
