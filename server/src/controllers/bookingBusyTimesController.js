import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { getBusyTimes } from '../services/bookingBusyTimesService.js';

export async function getBookingBusyTimes(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await getBusyTimes(db, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof BookingRequestError) {
      return res.status(error.status).json({
        success: false, error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
}
