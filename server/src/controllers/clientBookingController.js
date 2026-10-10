import { getClientBookingOptions, getClientBookingDay, createClientBookingRequest } from '../services/clientBookingCreateService.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { isValidBookingId } from '../services/bookingService.js';
import { ClientBookingError, CLIENT_BOOKING_LIMIT, listClientBookings, findClientBooking } from '../services/clientBookingService.js';

function handleError(error, res, next) {
  if (error instanceof ClientBookingError || error instanceof BookingRequestError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}

export async function getClientBookings(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const bookings = await listClientBookings(db, req.user.id);
    return res.status(200).json({ success: true, data: bookings, meta: { returned: bookings.length, limit: CLIENT_BOOKING_LIMIT } });
  } catch (error) { return handleError(error, res, next); }
}

export async function getClientBookingById(req, res, next) {
  if (!isValidBookingId(req.params.id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BOOKING_ID', message: 'Booking ID must be a valid UUID.' } });
  }
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const booking = await findClientBooking(db, req.user.id, req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
    }
    return res.status(200).json({ success: true, data: booking });
  } catch (error) { return handleError(error, res, next); }
}

export async function getClientBookingForm(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await getClientBookingOptions(db, req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}

export async function getClientBookingAvailability(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await getClientBookingDay(db, req.user.id, req.query.date);
    return res.status(200).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}

export async function postClientBooking(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await createClientBookingRequest(db, req.user.id, req.body);
    res.set('Location', `/api/client/bookings/${data.booking_id}`);
    return res.status(201).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}
