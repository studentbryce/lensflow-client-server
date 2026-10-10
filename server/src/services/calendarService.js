/** Photographer calendar data and availability mutations through user-scoped RLS. */
import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RULE_FIELDS = ['day_of_week', 'start_time', 'end_time', 'is_available'];
const EXCEPTION_FIELDS = ['exception_date', 'start_time', 'end_time', 'is_available', 'reason'];

async function read(query, message) {
  const { data, error } = await query;
  if (error) { const err = new Error(message); err.cause = error; throw err; }
  return data;
}
function dateValid(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function validTime(value) { return typeof value === 'string' && TIME.test(value); }
function timeSeconds(value) {
  const [hours, minutes, seconds = 0] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}
function validateBody(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !fields.includes(key))) {
    fail(400, 'INVALID_FIELDS', `Only ${fields.join(', ')} are accepted.`);
  }
}
export function validateCalendarRange(start, end) {
  if (!dateValid(start) || !dateValid(end)) fail(400, 'INVALID_DATE', 'Valid start and end dates are required.');
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > 45) fail(400, 'INVALID_RANGE', 'Calendar range must be 0–45 days.');
  return { start, end };
}
export function validateRule(body) {
  validateBody(body, RULE_FIELDS);
  if (!Number.isInteger(body.day_of_week) || body.day_of_week < 0 || body.day_of_week > 6 ||
      !validTime(body.start_time) || !validTime(body.end_time) ||
      timeSeconds(body.start_time) >= timeSeconds(body.end_time) || typeof body.is_available !== 'boolean') {
    fail(400, 'INVALID_RULE', 'Provide weekday 0–6, valid start/end times and is_available boolean.');
  }
  return Object.fromEntries(RULE_FIELDS.map(field => [field, body[field]]));
}
export function validateException(body) {
  validateBody(body, EXCEPTION_FIELDS);
  if (!dateValid(body.exception_date) || typeof body.is_available !== 'boolean' ||
      (body.reason != null && (typeof body.reason !== 'string' || body.reason.length > 500))) {
    fail(400, 'INVALID_EXCEPTION', 'A valid exception date, availability boolean and optional reason are required.');
  }
  const fullDay = body.start_time == null && body.end_time == null;
  if (!fullDay && (!validTime(body.start_time) || !validTime(body.end_time) || timeSeconds(body.start_time) >= timeSeconds(body.end_time))) {
    fail(400, 'INVALID_EXCEPTION', 'Provide both valid times, or null for a full-day exception.');
  }
  return { exception_date: body.exception_date, start_time: fullDay ? null : body.start_time,
    end_time: fullDay ? null : body.end_time, is_available: body.is_available,
    reason: body.reason?.trim() || null };
}
export async function getCalendarData(db, userId, start, end) {
  validateCalendarRange(start, end);
  const photographer = await resolvePhotographer(db, userId);
  const id = photographer.photographer_id;
  const [bookings, rules, exceptions] = await Promise.all([
    read(db.from('bookings').select('booking_id, photographer_id, client_id, service_id, booking_date, start_time, end_time, location, notes, status, total_amount, created_at, updated_at')
      .eq('photographer_id', id).gte('booking_date', start).lte('booking_date', end)
      .order('booking_date', { ascending: true }).order('start_time', { ascending: true }), 'Unable to load calendar bookings.'),
    read(db.from('availability_rules').select('availability_rule_id, photographer_id, day_of_week, start_time, end_time, is_available, created_at, updated_at')
      .eq('photographer_id', id).order('day_of_week', { ascending: true }).order('start_time', { ascending: true }), 'Unable to load availability rules.'),
    read(db.from('availability_exceptions').select('exception_id, photographer_id, exception_date, start_time, end_time, is_available, reason, created_at, updated_at')
      .eq('photographer_id', id).gte('exception_date', start).lte('exception_date', end)
      .order('exception_date', { ascending: true }).order('start_time', { ascending: true, nullsFirst: true }), 'Unable to load availability exceptions.'),
  ]);
  const clientIds = [...new Set((bookings ?? []).map(b => b.client_id).filter(Boolean))];
  const serviceIds = [...new Set((bookings ?? []).map(b => b.service_id).filter(Boolean))];
  const [clients, services] = await Promise.all([
    clientIds.length ? read(db.from('clients').select('client_id, user_id, photographer_id').eq('photographer_id', id).in('client_id', clientIds), 'Unable to load calendar clients.') : [],
    serviceIds.length ? read(db.from('services').select('service_id, name, duration_minutes, price, image_url, is_active').eq('photographer_id', id).in('service_id', serviceIds), 'Unable to load calendar services.') : [],
  ]);
  const userIds = [...new Set(clients.map(c => c.user_id).filter(Boolean))];
  const profiles = userIds.length ? await read(db.from('profiles').select('user_id, first_name, last_name, email, phone').in('user_id', userIds), 'Unable to load client profiles.') : [];
  const byUser = new Map(profiles.map(p => [p.user_id, p]));
  const byClient = new Map(clients.map(c => [c.client_id, { ...c, ...(byUser.get(c.user_id) ?? {}) }]));
  const byService = new Map(services.map(s => [s.service_id, s]));
  return { photographer_id: id, bookings: (bookings ?? []).map(b => ({ ...b, client: byClient.get(b.client_id) ?? null, service: byService.get(b.service_id) ?? null })),
    availability_rules: rules ?? [], availability_exceptions: exceptions ?? [] };
}
export async function createCalendarRule(db, userId, body) {
  const input = validateRule(body);
  const photographer = await resolvePhotographer(db, userId);
  return read(db.from('availability_rules').insert({ ...input, photographer_id: photographer.photographer_id }).select('availability_rule_id, photographer_id, day_of_week, start_time, end_time, is_available').single(), 'Unable to create availability rule.');
}
export async function createCalendarException(db, userId, body) {
  const input = validateException(body);
  const photographer = await resolvePhotographer(db, userId);
  return read(db.from('availability_exceptions').insert({ ...input, photographer_id: photographer.photographer_id }).select('exception_id, photographer_id, exception_date, start_time, end_time, is_available, reason').single(), 'Unable to create availability exception.');
}
export async function deleteCalendarRecord(db, userId, type, recordId) {
  if (typeof recordId !== 'string' || !UUID.test(recordId)) fail(400, 'INVALID_ID', 'A valid record UUID is required.');
  const photographer = await resolvePhotographer(db, userId);
  const table = type === 'rule' ? 'availability_rules' : 'availability_exceptions';
  const column = type === 'rule' ? 'availability_rule_id' : 'exception_id';
  const deleted = await read(db.from(table).delete().eq(column, recordId)
    .eq('photographer_id', photographer.photographer_id).select(column).maybeSingle(), 'Unable to delete availability record.');
  if (!deleted) fail(404, 'NOT_FOUND', 'Availability record not found.');
  return { [column]: deleted[column] };
}
