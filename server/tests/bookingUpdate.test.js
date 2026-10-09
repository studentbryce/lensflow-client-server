import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingRequestError } from '../src/services/bookingCreateService.js';
import { validateUpdateBookingBody, updatePhotographerBooking } from '../src/services/bookingUpdateService.js';

const OWNER = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const CLIENT = 'b3d6f9e1-8db7-4cef-9896-d6142905e78c';
const SERVICE = 'd33166be-74cb-43a7-9ee7-bb6699a91016';
const ID = 'c7c38cf4-a371-4a8f-828a-4a60f9dad264';
const futureMonday = new Date();
futureMonday.setUTCDate(futureMonday.getUTCDate() + ((8 - futureMonday.getUTCDay()) % 7) + 14);
const DATE = futureMonday.toISOString().slice(0, 10);
const original = {
    booking_id: ID, photographer_id: OWNER, client_id: CLIENT, service_id: SERVICE,
    booking_date: DATE, start_time: '10:00:00', end_time: '11:00:00',
    location: 'Old location', notes: 'Old notes', status: 'confirmed', total_amount: 100,
    updated_at: '2026-10-09T04:43:33.931908+00:00',
};

function fakeDb({ role = 'photographer', visible = true, owner = OWNER, status = 'confirmed',
    linkedInvoice = false, linkedGallery = false, occupied = false, stale = false } = {}) {
    const calls = [];
    const booking = visible ? { ...original, photographer_id: owner, status } : null;
    const dataFor = (table, op) => {
        if (table === 'bookings' && op === 'maybeSingle' && calls.some(c => c[0] === 'update')) {
            return stale ? null : { ...booking, ...calls.find(c => c[0] === 'update')[2] };
        }
        if (table === 'bookings' && op === 'maybeSingle') return booking;
        if (table === 'profiles') return { role };
        if (table === 'photographer_profiles') return { photographer_id: OWNER };
        if (table === 'invoices') return linkedInvoice ? [{ invoice_id: 'inv' }] : [];
        if (table === 'galleries') return linkedGallery ? [{ gallery_id: 'gal' }] : [];
        if (table === 'availability_rules') return [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true }];
        if (table === 'availability_exceptions') return [];
        if (table === 'bookings') return [booking, ...(occupied ? [{ booking_id: 'other', start_time: '11:30:00', end_time: '12:30:00', status: 'confirmed' }] : [])].filter(Boolean);
        return null;
    };
    return {
        calls,
        from(table) {
            calls.push(['from', table]);
            const q = {
                select() { return this; },
                eq() { return this; },
                limit() { return this; },
                update(row) { calls.push(['update', table, row]); return this; },
                maybeSingle() { return Promise.resolve({ data: dataFor(table, 'maybeSingle'), error: null }); },
                then(resolve, reject) { return Promise.resolve({ data: dataFor(table, 'then'), error: null }).then(resolve, reject); },
            };
            return q;
        },
    };
}

const isError = (status, code) => e => e instanceof BookingRequestError && e.status === status && e.code === code;

test('PATCH rejects empty, invalid and forbidden fields', () => {
    for (const body of [{}, [], null, { status: 'completed' }, { total_amount: 0 }, { photographer_id: OWNER }, { end_time: '14:00' }, { service_id: SERVICE }, { location: 123 }, { notes: 'x'.repeat(2001) }]) {
        assert.throws(() => validateUpdateBookingBody(body), BookingRequestError);
    }
});

test('updates notes/location without modifying ownership, status, price or schedule', async () => {
    const db = fakeDb();
    const updated = await updatePhotographerBooking(db, OWNER, ID, { location: '  New location ', notes: 'Changed' });
    const changes = db.calls.find(c => c[0] === 'update')[2];
    assert.deepEqual(changes, { location: 'New location', notes: 'Changed' });
    assert.equal(updated.location, 'New location');
    assert.equal(updated.total_amount, 100);
    assert.equal(db.calls.some(c => c[1] === 'availability_rules'), false);
});

test('reschedules while preserving duration, price and excluding current booking from overlap', async () => {
    const db = fakeDb();
    const updated = await updatePhotographerBooking(db, OWNER, ID, { start_time: '11:00' });
    const changes = db.calls.find(c => c[0] === 'update')[2];
    assert.equal(changes.start_time, '11:00:00');
    assert.equal(changes.end_time, '12:00:00');
    assert.equal(updated.total_amount, 100);
});

test('rejects client, foreign booking, invisible booking and completed booking', async () => {
    for (const [options, status, code] of [
        [{ role: 'client' }, 403, 'PHOTOGRAPHER_REQUIRED'],
        [{ owner: '99999999-9999-4999-8999-999999999999' }, 404, 'BOOKING_NOT_FOUND'],
        [{ visible: false }, 404, 'BOOKING_NOT_FOUND'],
        [{ status: 'completed' }, 409, 'BOOKING_LOCKED'],
    ]) {
        const db = fakeDb(options);
        await assert.rejects(() => updatePhotographerBooking(db, OWNER, ID, { notes: 'test' }), isError(status, code));
        assert.equal(db.calls.some(c => c[0] === 'update'), false);
    }
});

test('rejects reschedule if invoice or gallery is linked', async () => {
    for (const options of [{ linkedInvoice: true }, { linkedGallery: true }]) {
        const db = fakeDb(options);
        await assert.rejects(() => updatePhotographerBooking(db, OWNER, ID, { start_time: '11:00' }), isError(409, 'BOOKING_HAS_DEPENDENCIES'));
        assert.equal(db.calls.some(c => c[0] === 'update'), false);
    }
});

test('rejects overlapping slot and invalid/past dates', async () => {
    const db = fakeDb({ occupied: true });
    await assert.rejects(() => updatePhotographerBooking(db, OWNER, ID, { start_time: '11:00' }), isError(409, 'SLOT_UNAVAILABLE'));
    for (const body of [{ booking_date: '2026-02-30' }, { booking_date: '2020-01-01' }, { start_time: '26:00' }]) {
        await assert.rejects(() => updatePhotographerBooking(fakeDb(), OWNER, ID, body), BookingRequestError);
    }
});

test('detects a stale booking update without reporting success', async () => {
    const db = fakeDb({ stale: true });
    await assert.rejects(() => updatePhotographerBooking(db, OWNER, ID, { notes: 'test' }), isError(409, 'BOOKING_CHANGED'));
});
