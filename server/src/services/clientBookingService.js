/** Client-only booking reads. Every query uses the authenticated user's JWT.
 * No service-role key and no client_id supplied by the browser. */
export const CLIENT_BOOKING_LIMIT = 100;
const LIST_FIELDS = 'booking_id, booking_date, start_time, end_time, location, status, total_amount, services(name)';
const DETAIL_FIELDS = 'booking_id, booking_date, start_time, end_time, location, notes, status, total_amount, services(name, description, duration_minutes)';

// Helper function to throw a ClientBookingError with the given status, code, and message
export class ClientBookingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Helper function to create a database failure error with a message and cause
function databaseFailure(message, cause) {
  const error = new Error(message);
  error.cause = cause;
  return error;
}

// Main function to find the authenticated client's ID, throwing errors for missing or invalid profiles
export async function findAuthenticatedClient(db, userId) {
  if (!userId) throw new ClientBookingError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  const { data, error } = await db.from('clients')
    .select('client_id').eq('user_id', userId).maybeSingle();
  if (error) throw databaseFailure('Unable to verify client profile.', error);
  if (!data?.client_id) {
    throw new ClientBookingError(403, 'CLIENT_REQUIRED', 'A client profile is required.');
  }
  return data.client_id;
}

// Main function to list the authenticated client's bookings, limited to a maximum number of results
export async function listClientBookings(db, userId) {
  const clientId = await findAuthenticatedClient(db, userId);
  const { data, error } = await db.from('bookings')
    .select(LIST_FIELDS)
    .eq('client_id', clientId)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(CLIENT_BOOKING_LIMIT);
  if (error) throw databaseFailure('Unable to retrieve client bookings.', error);
  return data ?? [];
}

// Main function to find a specific booking for the authenticated client, returning null if not found
export async function findClientBooking(db, userId, bookingId) {
  const clientId = await findAuthenticatedClient(db, userId);
  const { data, error } = await db.from('bookings')
    .select(DETAIL_FIELDS)
    .eq('booking_id', bookingId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw databaseFailure('Unable to retrieve client booking.', error);
  return data ?? null;
}
