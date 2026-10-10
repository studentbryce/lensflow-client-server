/** Photographer New Booking form data, always queried using the caller's JWT + RLS. */
import { BookingRequestError } from './bookingCreateService.js';
import { getBusyTimes } from './bookingBusyTimesService.js';

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

export async function resolvePhotographer(db, userId) {
  if (!userId) fail(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  const profile = await read(db.from('profiles').select('role').eq('user_id', userId).maybeSingle(), 'Unable to verify account role.');
  if (profile?.role !== 'photographer') fail(403, 'PHOTOGRAPHER_REQUIRED', 'Only photographers can manage bookings.');
  const photographer = await read(db.from('photographer_profiles')
    .select('photographer_id, user_id, business_name').eq('user_id', userId).maybeSingle(), 'Unable to load photographer profile.');
  if (!photographer?.photographer_id) fail(403, 'PHOTOGRAPHER_REQUIRED', 'Photographer profile not found.');
  return photographer;
}

export async function getPhotographerBookingFormOptions(db, userId) {
  const photographer = await resolvePhotographer(db, userId);
  const id = photographer.photographer_id;
  const [clients, services, rules] = await Promise.all([
    read(db.from('clients').select('client_id, user_id').eq('photographer_id', id), 'Unable to load clients.'),
    read(db.from('services').select('service_id, name, description, price, duration_minutes, deposit_amount')
      .eq('photographer_id', id).eq('is_active', true).order('name', { ascending: true }), 'Unable to load services.'),
    read(db.from('availability_rules').select('availability_rule_id, photographer_id, day_of_week, start_time, end_time, is_available')
      .eq('photographer_id', id), 'Unable to load weekly availability.'),
  ]);
  const userIds = [...new Set((clients ?? []).map(client => client.user_id).filter(Boolean))];
  let profiles = [];
  if (userIds.length) {
    profiles = await read(db.from('profiles').select('user_id, first_name, last_name, email').in('user_id', userIds), 'Unable to load client names.');
  }
  const byUserId = new Map((profiles ?? []).map(profile => [profile.user_id, profile]));
  return {
    photographer,
    clients: (clients ?? []).map(client => ({ ...client, profile: byUserId.get(client.user_id) ?? null })),
    services: services ?? [],
    availability_rules: rules ?? [],
  };
}

export async function getPhotographerBookingDay(db, userId, date) {
  // Validate a real ISO date before touching the database.
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    fail(400, 'INVALID_DATE', 'A real date in YYYY-MM-DD format is required.');
  }
  const validDate = date;
  const photographer = await resolvePhotographer(db, userId);
  const [exceptions, busy] = await Promise.all([
    read(db.from('availability_exceptions').select('exception_id, exception_date, start_time, end_time, is_available, reason')
      .eq('photographer_id', photographer.photographer_id).eq('exception_date', validDate)
      .order('start_time', { ascending: true, nullsFirst: true }), 'Unable to load availability exceptions.'),
    getBusyTimes(db, { photographer_id: photographer.photographer_id, date: validDate }),
  ]);
  // Busy times are anonymous intervals. Do not expose other clients' booking records.
  return { exceptions: exceptions ?? [], bookings: busy };
}
