import { BookingRequestError } from './bookingCreateService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateBusyTimesQuery(query) {
  const photographerId = query?.photographer_id;
  const date = query?.date;
  if (typeof photographerId !== 'string' || !UUID.test(photographerId)) {
    throw new BookingRequestError(400, 'INVALID_PHOTOGRAPHER_ID', 'A valid photographer_id is required.');
  }
  if (typeof date !== 'string' || !DATE.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new BookingRequestError(400, 'INVALID_DATE', 'A valid date in YYYY-MM-DD format is required.');
  }
  return { photographerId, date };
}

export async function getBusyTimes(db, query) {
  const { photographerId, date } = validateBusyTimesQuery(query);
  const { data, error } = await db.rpc('get_booking_busy_times', {
    p_photographer_id: photographerId,
    p_date: date,
  });
  if (error) {
    if (error.code === '42501') {
      throw new BookingRequestError(403, 'AVAILABILITY_FORBIDDEN', 'You cannot access this schedule.');
    }
    const failure = new Error('Unable to load booking availability.');
    failure.cause = error;
    throw failure;
  }
  return (data ?? []).map(({ start_time, end_time }) => ({ start_time, end_time }));
}
