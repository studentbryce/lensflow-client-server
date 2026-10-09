import { updatePhotographerBooking } from '../services/bookingUpdateService.js';
import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { createPhotographerBooking, BookingRequestError } from '../services/bookingCreateService.js';
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

/** POST /api/bookings — photographer-only, with validated input and existing RLS. */
export async function postBooking(req, res, next) {
    try {
        const database = createUserSupabaseClient(req.accessToken);
        const created = await createPhotographerBooking(database, req.user.id, req.body);
        return res.status(201).location(`/api/bookings/${created.booking_id}`).json({
            success: true,
            data: created,
        });
    } catch (error) {
        if (error instanceof BookingRequestError) {
            return res.status(error.status).json({
                success: false,
                error: { code: error.code, message: error.message },
            });
        }
        next(error);
    }
}

/** PATCH /api/bookings/:id — photographer-only safe booking edits. */
export async function patchBooking(req, res, next) {
    if (!isValidBookingId(req.params.id)) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_BOOKING_ID', message: 'Booking ID must be a valid UUID.' },
        });
    }
    try {
        const database = createUserSupabaseClient(req.accessToken);
        const updated = await updatePhotographerBooking(database, req.user.id, req.params.id, req.body);
        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        if (error instanceof BookingRequestError) {
            return res.status(error.status).json({
                success: false,
                error: { code: error.code, message: error.message },
            });
        }
        next(error);
    }
}
