import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { getCalendarData, createCalendarRule, createCalendarException, deleteCalendarRecord } from '../services/calendarService.js';

// Generic response handler for calendar operations
async function respond(req, res, next, operation, status = 200) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await operation(db, req.user.id);
    return res.status(status).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) {
    if (error instanceof BookingRequestError) {
      return res.status(error.status).set('Cache-Control', 'no-store').json({ success: false, error: { code: error.code, message: error.message } });
    }
    next(error);
  }
}
// Controller functions for calendar operations
export const getCalendar = (req, res, next) => respond(req, res, next, (db, userId) => getCalendarData(db, userId, req.query.start, req.query.end));
export const postRule = (req, res, next) => respond(req, res, next, (db, userId) => createCalendarRule(db, userId, req.body), 201);
export const postException = (req, res, next) => respond(req, res, next, (db, userId) => createCalendarException(db, userId, req.body), 201);
export const deleteRule = (req, res, next) => respond(req, res, next, (db, userId) => deleteCalendarRecord(db, userId, 'rule', req.params.id));
export const deleteException = (req, res, next) => respond(req, res, next, (db, userId) => deleteCalendarRecord(db, userId, 'exception', req.params.id));
