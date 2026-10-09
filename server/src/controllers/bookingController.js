import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BOOKING_PAGE_LIMIT, listBookings } from '../services/bookingService.js';

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
