import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BOOKING_PAGE_LIMIT, listBookings, findBookingById, isValidBookingId } from '../services/bookingService.js';

export async function getBookings(req, res, next) {
    try {
        // requireAuth has already verified this JWT with Supabase Auth.
        const database = createUserSupabaseClient(req.accessToken);
        const bookings = await listBookings(database);

        return res.status(200).json({
            success: true,
            data: bookings,
            meta: {
                returned: bookings.length,
                limit: BOOKING_PAGE_LIMIT,
            },
        });
    } catch (error) {
        next(error);
    }
}

/** GET /api/bookings/:id — retrieve one booking under the caller's RLS. */
export async function getBookingById(req, res, next) {
    const { id } = req.params;

    if (!isValidBookingId(id)) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_BOOKING_ID',
                message: 'Booking ID must be a valid UUID.',
            },
        });
    }

    try {
        const database = createUserSupabaseClient(req.accessToken);
        const booking = await findBookingById(database, id);

        // Do not distinguish missing records from records hidden by RLS.
        if (!booking) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'BOOKING_NOT_FOUND',
                    message: 'Booking not found.',
                },
            });
        }

        return res.status(200).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        next(error);
    }
}
