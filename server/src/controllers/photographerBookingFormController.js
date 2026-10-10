import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { getPhotographerBookingFormOptions, getPhotographerBookingDay } from '../services/photographerBookingFormService.js';

async function respond(req, res, next, fn) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await fn(db, req.user.id);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) {
    if (error instanceof BookingRequestError) {
      return res.status(error.status).set('Cache-Control', 'no-store').json({
        success: false, error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
}

export function getPhotographerBookingOptions(req, res, next) {
  return respond(req, res, next, getPhotographerBookingFormOptions);
}

export function getPhotographerBookingAvailability(req, res, next) {
  return respond(req, res, next, (db, userId) => getPhotographerBookingDay(db, userId, req.query.date));
}
