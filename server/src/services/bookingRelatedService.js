/**
 * Booking Details: invoice/gallery summaries under the caller's JWT and RLS.
 * Only the owning photographer may access this photographer-facing endpoint.
 * No service-role key and no changes to existing Supabase policies.
 */
import { BookingRequestError } from './bookingCreateService.js';
import { findBookingById } from './bookingService.js';

async function singleOrFail(query, message) {
    const { data, error } = await query;
    if (error) {
        const failure = new Error(message);
        failure.cause = error;
        throw failure;
    }
    return data ?? null;
}

export async function getPhotographerBookingRelated(database, userId, bookingId) {
    const booking = await findBookingById(database, bookingId);
    if (!booking) {
        throw new BookingRequestError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    const profile = await singleOrFail(
        database.from('profiles').select('role').eq('user_id', userId).maybeSingle(),
        'Unable to verify account role.',
    );
    if (profile?.role !== 'photographer') {
        throw new BookingRequestError(403, 'PHOTOGRAPHER_REQUIRED',
            'Only photographers can view booking management details.');
    }

    const photographer = await singleOrFail(
        database.from('photographer_profiles')
            .select('photographer_id').eq('user_id', userId).maybeSingle(),
        'Unable to verify photographer ownership.',
    );
    if (!photographer || booking.photographer_id !== photographer.photographer_id) {
        throw new BookingRequestError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    // The photographer_id filter is defence in depth; RLS is still enforced.
    const [invoice, gallery] = await Promise.all([
        singleOrFail(database.from('invoices')
            .select('invoice_id, invoice_number, status')
            .eq('booking_id', bookingId)
            .eq('photographer_id', photographer.photographer_id)
            .maybeSingle(), 'Unable to retrieve linked invoice.'),
        singleOrFail(database.from('galleries')
            .select('gallery_id, name, is_published')
            .eq('booking_id', bookingId)
            .eq('photographer_id', photographer.photographer_id)
            .maybeSingle(), 'Unable to retrieve linked gallery.'),
    ]);

    return { invoice, gallery };
}
