// Explicit fields keep the endpoint focused and avoid accidental exposure
// of new columns if the database schema grows later.
const BOOKING_FIELDS = [
    'booking_id',
    'photographer_id',
    'client_id',
    'service_id',
    'booking_date',
    'start_time',
    'end_time',
    'location',
    'notes',
    'status',
    'total_amount',
    'created_at',
    'updated_at',
].join(', ');

export const BOOKING_PAGE_LIMIT = 100;

/**
 * Read-only list. No user_id or photographer_id is accepted from the client:
 * the database's existing RLS determines which rows are visible.
 */
export async function listBookings(database) {
    const { data, error } = await database
        .from('bookings')
        .select(BOOKING_FIELDS)
        .order('booking_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(BOOKING_PAGE_LIMIT);

    if (error) {
        // Do not expose raw PostgreSQL / PostgREST error details to browsers.
        const failure = new Error('Unable to retrieve bookings.');
        failure.cause = error;
        throw failure;
    }

    return data ?? [];
}
