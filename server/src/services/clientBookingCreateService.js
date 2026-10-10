/** Client booking form data and pending booking requests, always under the caller's JWT/RLS. */
import { BookingRequestError, validateCreateBookingBody, minutesFromTime, slotIsAvailable } from './bookingCreateService.js';
import { getBusyTimes } from './bookingBusyTimesService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const allowedFields = new Set(['service_id', 'booking_date', 'start_time', 'location', 'notes']);

function fail(status, code, message) {
  throw new BookingRequestError(status, code, message);
}

async function read(query, message) {
  const { data, error } = await query;
  if (error) {
    const failure = new Error(message);
    failure.cause = error;
    throw failure;
  }
  return data;
}

/** Never take client_id or photographer_id from the browser. */
export async function resolveClient(db, userId) {
  if (!userId) fail(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  const profile = await read(db.from('profiles').select('role').eq('user_id', userId).maybeSingle(), 'Unable to verify account role.');
  if (profile?.role !== 'client') fail(403, 'CLIENT_REQUIRED', 'Only clients can request a booking.');
  const client = await read(db.from('clients').select('client_id, photographer_id').eq('user_id', userId).maybeSingle(), 'Unable to load client profile.');
  if (!client?.client_id || !client?.photographer_id) fail(403, 'CLIENT_REQUIRED', 'Your client account is not linked to a photographer.');
  return client;
}

export async function getClientBookingOptions(db, userId) {
  const client = await resolveClient(db, userId);
  const [services, rules] = await Promise.all([
    read(db.from('services').select('service_id, name, description, price, duration_minutes').eq('photographer_id', client.photographer_id).eq('is_active', true).order('name'), 'Unable to load services.'),
    read(db.from('availability_rules').select('availability_rule_id, photographer_id, day_of_week, start_time, end_time, is_available').eq('photographer_id', client.photographer_id).order('day_of_week', { ascending: true }).order('start_time', { ascending: true }), 'Unable to load availability rules.'),
  ]);
  return { client, services: services ?? [], availability_rules: rules ?? [] };
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function getClientBookingDay(db, userId, date) {
  if (!validDate(date)) fail(400, 'INVALID_DATE', 'A real date in YYYY-MM-DD format is required.');
  const client = await resolveClient(db, userId);
  const [exceptions, bookings] = await Promise.all([
    read(db.from('availability_exceptions').select('exception_id, exception_date, start_time, end_time, is_available, reason').eq('photographer_id', client.photographer_id).eq('exception_date', date).order('start_time', { ascending: true, nullsFirst: true }), 'Unable to load availability exceptions.'),
    // SECURITY DEFINER RPC returns occupied intervals only, including other clients.
    getBusyTimes(db, { photographer_id: client.photographer_id, date }),
  ]);
  return { exceptions: exceptions ?? [], bookings };
}

export function validateClientBookingRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_BODY', 'A JSON booking object is required.');
  if (Object.keys(body).some(key => !allowedFields.has(key))) {
    fail(400, 'INVALID_FIELDS', 'Only service_id, booking_date, start_time, location and notes are accepted.');
  }
  if (typeof body.service_id !== 'string' || !UUID.test(body.service_id)) {
    fail(400, 'INVALID_SERVICE', 'A valid service_id is required.');
  }
  return body;
}

function asSqlTime(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}:00`;
}

export async function createClientBookingRequest(db, userId, body) {
  validateClientBookingRequest(body);
  const client = await resolveClient(db, userId);
  // Reuse photographer POST's date/time/text validation with the server-derived client ID.
  const input = validateCreateBookingBody({ ...body, client_id: client.client_id });
  const service = await read(db.from('services').select('service_id, duration_minutes, price, is_active').eq('service_id', input.serviceId).eq('photographer_id', client.photographer_id).maybeSingle(), 'Unable to validate service.');
  if (!service?.is_active) fail(422, 'INVALID_SERVICE', 'This service is not available from your photographer.');
  const duration = Number(service.duration_minutes);
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 1440 || input.start + duration >= 1440) {
    fail(422, 'INVALID_DURATION', 'This service cannot fit within the selected day.');
  }
  const end = input.start + duration;
  const [rules, day] = await Promise.all([
    read(db.from('availability_rules').select('day_of_week, start_time, end_time, is_available').eq('photographer_id', client.photographer_id), 'Unable to check weekly availability.'),
    getClientBookingDay(db, userId, input.date),
  ]);
  const occupied = day.bookings.map(row => ({ ...row, status: 'confirmed' }));
  if (!slotIsAvailable({ date: input.date, start: input.start, end, rules: rules ?? [], exceptions: day.exceptions, bookings: occupied })) {
    fail(409, 'SLOT_UNAVAILABLE', 'This booking time is not available.');
  }
  const row = {
    client_id: client.client_id,
    photographer_id: client.photographer_id,
    service_id: service.service_id,
    booking_date: input.date,
    start_time: asSqlTime(input.start),
    end_time: asSqlTime(end),
    location: input.location,
    notes: input.notes,
    status: 'pending',
    total_amount: service.price,
  };
  const { data, error } = await db.from('bookings').insert(row).select('booking_id').single();
  if (error) {
    if (error.code === '23P01') fail(409, 'SLOT_UNAVAILABLE', 'This booking time has just been taken. Please choose another time.');
    const failure = new Error('Unable to save booking request.');
    failure.cause = error;
    throw failure;
  }
  if (!data?.booking_id) throw new Error('Booking creation returned no ID.');
  return { booking_id: data.booking_id };
}
