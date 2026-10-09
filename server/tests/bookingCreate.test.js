import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BookingRequestError, validateCreateBookingBody, slotIsAvailable, createPhotographerBooking,
} from '../src/services/bookingCreateService.js';

const PHOTOGRAPHER = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const CLIENT = 'b3d6f9e1-8db7-4cef-9896-d6142905e78c';
const SERVICE = 'd33166be-74cb-43a7-9ee7-bb6699a91016';
const futureMonday = new Date();
futureMonday.setUTCDate(futureMonday.getUTCDate() + ((8 - futureMonday.getUTCDay()) % 7) + 14);
const DATE = futureMonday.toISOString().slice(0, 10); // A future Monday
const input = { client_id: CLIENT, service_id: SERVICE, booking_date: DATE, start_time: '10:00', notes: 'COMP7214 test' };
const rules = [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true }];

test('rejects forged photographer_id, price, status, and end_time', () => {
    for (const key of ['photographer_id', 'total_amount', 'status', 'end_time']) {
        assert.throws(() => validateCreateBookingBody({ ...input, [key]: 'fake' }), e => e instanceof BookingRequestError && e.code === 'INVALID_FIELDS');
    }
});

test('rejects invalid dates, times, and identifiers', () => {
    for (const body of [
        { ...input, booking_date: '2026-02-30' },
        { ...input, start_time: '25:00' },
        { ...input, client_id: 'bad' },
        { ...input, booking_date: '2020-01-01' },
    ]) assert.throws(() => validateCreateBookingBody(body), BookingRequestError);
});

test('checks weekly hours, blocked exceptions and overlapping bookings', () => {
    const base = { date: DATE, start: 600, end: 660, rules, exceptions: [], bookings: [] };
    assert.equal(slotIsAvailable(base), true);
    assert.equal(slotIsAvailable({ ...base, start: 480, end: 540 }), false);
    assert.equal(slotIsAvailable({ ...base, exceptions: [{ is_available: false, start_time: null, end_time: null }] }), false);
    assert.equal(slotIsAvailable({ ...base, bookings: [{ start_time: '10:30:00', end_time: '11:30:00', status: 'confirmed' }] }), false);
    assert.equal(slotIsAvailable({ ...base, bookings: [{ start_time: '10:30:00', end_time: '11:30:00', status: 'cancelled' }] }), true);
    assert.equal(slotIsAvailable({ ...base, exceptions: [{ is_available: false, start_time: '10:15:00', end_time: '10:45:00' }] }), false);
});

function fakeDb({ role = 'photographer', ownClient = true, serviceActive = true, occupied = false } = {}) {
    const calls = [];
    const responses = {
        profiles: { role },
        photographer_profiles: { photographer_id: PHOTOGRAPHER },
        clients: ownClient ? { client_id: CLIENT } : null,
        services: { service_id: SERVICE, duration_minutes: 60, price: '175.00', is_active: serviceActive },
        availability_rules: rules,
        availability_exceptions: [],
        bookings: occupied ? [{ start_time: '10:30:00', end_time: '11:30:00', status: 'confirmed' }] : [],
    };
    const db = {
        calls,
        from(table) {
            calls.push(['from', table]);
            return {
                select() { return this; },
                eq() { return this; },
                maybeSingle() { return Promise.resolve({ data: responses[table], error: null }); },
                then(resolve, reject) { return Promise.resolve({ data: responses[table], error: null }).then(resolve, reject); },
                insert(row) {
                    calls.push(['insert', table, row]);
                    return {
                        select() { return this; },
                        single() { return Promise.resolve({ data: { booking_id: '11111111-1111-4111-8111-111111111111' }, error: null }); },
                    };
                },
            };
        },
    };
    return db;
}

test('creates confirmed booking with trusted owner, price and calculated end time', async () => {
    const db = fakeDb();
    const result = await createPhotographerBooking(db, PHOTOGRAPHER, input);
    assert.ok(result.booking_id);
    const inserted = db.calls.find(c => c[0] === 'insert')[2];
    assert.equal(inserted.photographer_id, PHOTOGRAPHER);
    assert.equal(inserted.total_amount, '175.00');
    assert.equal(inserted.status, 'confirmed');
    assert.equal(inserted.end_time, '11:00:00');
    assert.equal(inserted.notes, 'COMP7214 test');
});

test('rejects clients and foreign client relationships before insert', async () => {
    for (const options of [{ role: 'client' }, { ownClient: false }]) {
        const db = fakeDb(options);
        await assert.rejects(() => createPhotographerBooking(db, PHOTOGRAPHER, input), BookingRequestError);
        assert.equal(db.calls.some(c => c[0] === 'insert'), false);
    }
});

test('rejects inactive services and occupied slots before insert', async () => {
    for (const options of [{ serviceActive: false }, { occupied: true }]) {
        const db = fakeDb(options);
        await assert.rejects(() => createPhotographerBooking(db, PHOTOGRAPHER, input), BookingRequestError);
        assert.equal(db.calls.some(c => c[0] === 'insert'), false);
    }
});
