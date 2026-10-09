/**
 * Photographer booking creation through the caller's existing Supabase RLS.
 * No service-role credentials, schema migrations, or changes to V1 are needed.
 *
 * This initial POST endpoint is intentionally photographer-only. The client
 * SELECT policy sees only that client's bookings, not other clients' occupied
 * slots. A client POST requires an atomic, securely-authorised DB operation
 * before it can reliably check conflicts across clients.
 */

export class BookingRequestError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/;

export function minutesFromTime(time) {
    if (typeof time !== 'string' || !TIME.test(time)) return null;
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
}

function formatTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

function isRealDate(date) {
    if (typeof date !== 'string' || !DATE.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function currentNzDateAndTime() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: `${value.year}-${value.month}-${value.day}`, minutes: Number(value.hour) * 60 + Number(value.minute) };
}

/** Accept a explicit allowlist. Never accept owner, price, status or end time. */
export function validateCreateBookingBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        fail(400, 'INVALID_BODY', 'A JSON booking object is required.');
    }
    const allowed = new Set(['client_id', 'service_id', 'booking_date', 'start_time', 'location', 'notes']);
    if (Object.keys(body).some(key => !allowed.has(key))) {
        fail(400, 'INVALID_FIELDS', 'Only client_id, service_id, booking_date, start_time, location and notes are accepted.');
    }
    if (typeof body.client_id !== 'string' || !UUID.test(body.client_id) ||
        typeof body.service_id !== 'string' || !UUID.test(body.service_id)) {
        fail(400, 'INVALID_REFERENCE', 'A valid client_id and service_id are required.');
    }
    if (!isRealDate(body.booking_date)) {
        fail(400, 'INVALID_DATE', 'booking_date must be a real date in YYYY-MM-DD format.');
    }
    const start = minutesFromTime(body.start_time);
    if (start === null) fail(400, 'INVALID_TIME', 'start_time must use HH:mm (or HH:mm:00) format.');
    const now = currentNzDateAndTime();
    if (body.booking_date < now.date || (body.booking_date === now.date && start <= now.minutes)) {
        fail(422, 'PAST_BOOKING', 'Please select a future booking date and time.');
    }
    for (const field of ['location', 'notes']) {
        if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
            fail(400, 'INVALID_FIELDS', `${field} must be text.`);
        }
    }
    if (body.location?.length > 300 || body.notes?.length > 2000) {
        fail(400, 'INVALID_FIELDS', 'Location or notes are too long.');
    }
    return {
        clientId: body.client_id, serviceId: body.service_id,
        date: body.booking_date, start,
        location: body.location?.trim() || null, notes: body.notes?.trim() || null,
    };
}

function mergeRanges(ranges) {
    const sorted = ranges.filter(r => r.start < r.end).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of sorted) {
        const last = merged.at(-1);
        if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
        else merged.push({ ...range });
    }
    return merged;
}
function subtractRanges(available, blocked) {
    let remaining = mergeRanges(available);
    for (const block of mergeRanges(blocked)) {
        remaining = remaining.flatMap(range => {
            if (block.end <= range.start || block.start >= range.end) return [range];
            const pieces = [];
            if (block.start > range.start) pieces.push({ start: range.start, end: block.start });
            if (block.end < range.end) pieces.push({ start: block.end, end: range.end });
            return pieces;
        });
    }
    return remaining;
}
function toRanges(rows) {
    return rows.map(row => ({ start: minutesFromTime(row.start_time), end: minutesFromTime(row.end_time) }));
}

/** Mirrors the V1 weekly rules, exceptions, and blocking-booking calculations. */
export function slotIsAvailable({ date, start, end, rules, exceptions, bookings }) {
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const todayRules = rules.filter(r => Number(r.day_of_week) === dayOfWeek);
    let ranges = mergeRanges(toRanges(todayRules.filter(r => r.is_available)));
    ranges = subtractRanges(ranges, toRanges(todayRules.filter(r => !r.is_available)));
    if (exceptions.some(e => !e.is_available && !e.start_time && !e.end_time)) return false;
    if (exceptions.some(e => e.is_available && !e.start_time && !e.end_time)) ranges = [{ start: 0, end: 1440 }];
    ranges = mergeRanges([...ranges, ...toRanges(exceptions.filter(e => e.is_available && e.start_time && e.end_time))]);
    ranges = subtractRanges(ranges, toRanges(exceptions.filter(e => !e.is_available && e.start_time && e.end_time)));
    ranges = subtractRanges(ranges, toRanges(bookings.filter(b => !['cancelled', 'declined'].includes(b.status))));
    return ranges.some(range => start >= range.start && end <= range.end);
}

async function queryOrFail(promise) {
    const { data, error } = await promise;
    if (error) {
        const failure = new Error('Database operation failed.');
        failure.cause = error;
        throw failure;
    }
    return data;
}

export async function createPhotographerBooking(db, userId, body) {
    const input = validateCreateBookingBody(body);

    // Derive photographer ownership from verified auth user, never from JSON.
    const profile = await queryOrFail(db.from('profiles').select('role').eq('user_id', userId).maybeSingle());
    if (profile?.role !== 'photographer') {
        fail(403, 'PHOTOGRAPHER_REQUIRED', 'Only photographers can create bookings through this endpoint.');
    }
    const photographer = await queryOrFail(db.from('photographer_profiles').select('photographer_id').eq('user_id', userId).maybeSingle());
    if (!photographer) fail(403, 'PHOTOGRAPHER_REQUIRED', 'Photographer profile not found.');
    const photographerId = photographer.photographer_id;

    const client = await queryOrFail(db.from('clients').select('client_id').eq('client_id', input.clientId).eq('photographer_id', photographerId).maybeSingle());
    if (!client) fail(422, 'INVALID_CLIENT', 'The selected client is not associated with this photographer.');
    const service = await queryOrFail(db.from('services').select('service_id, duration_minutes, price, is_active').eq('service_id', input.serviceId).eq('photographer_id', photographerId).maybeSingle());
    if (!service || !service.is_active) fail(422, 'INVALID_SERVICE', 'The selected service is not active for this photographer.');
    const duration = Number(service.duration_minutes);
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 1440 || input.start + duration >= 1440) {
        fail(422, 'INVALID_DURATION', 'The service cannot fit within the selected day.');
    }
    const end = input.start + duration;

    const rules = await queryOrFail(db.from('availability_rules').select('day_of_week, start_time, end_time, is_available').eq('photographer_id', photographerId));
    const exceptions = await queryOrFail(db.from('availability_exceptions').select('start_time, end_time, is_available').eq('photographer_id', photographerId).eq('exception_date', input.date));
    const bookings = await queryOrFail(db.from('bookings').select('start_time, end_time, status').eq('photographer_id', photographerId).eq('booking_date', input.date));
    if (!slotIsAvailable({ date: input.date, start: input.start, end, rules: rules ?? [], exceptions: exceptions ?? [], bookings: bookings ?? [] })) {
        fail(409, 'SLOT_UNAVAILABLE', 'This booking time is not available.');
    }

    const row = {
        photographer_id: photographerId,
        client_id: input.clientId,
        service_id: input.serviceId,
        booking_date: input.date,
        start_time: formatTime(input.start),
        end_time: formatTime(end),
        location: input.location,
        notes: input.notes,
        status: 'confirmed', // Photographer-created bookings are confirmed in LensFlow V1.
        total_amount: service.price, // Trusted DB price; ignore any client-supplied price.
    };
    const created = await queryOrFail(db.from('bookings').insert(row).select('booking_id').single());
    if (!created?.booking_id) throw new Error('Booking creation returned no ID.');
    return { booking_id: created.booking_id };
}
