import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingRequestError } from '../src/services/bookingCreateService.js';
import { changePhotographerBookingStatus, validateBookingStatusBody, STATUS_TRANSITIONS } from '../src/services/bookingStatusService.js';

const USER = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const OTHER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ID = 'd21aaffb-df36-4851-a41d-76d433c12a52';
const booking = {
    booking_id: ID, photographer_id: USER, status: 'pending',
    updated_at: '2026-10-09T04:43:33.931908+00:00',
};
const isError = (status, code) => error => error instanceof BookingRequestError &&
    error.status === status && error.code === code;

function fakeDb({ status = 'pending', role = 'photographer', visible = true,
    owner = USER, invoice = false, gallery = false, stale = false } = {}) {
    const calls = [];
    let updatePayload;
    const db = {
        calls,
        from(table) {
            calls.push(['from', table]);
            let operation = 'read';
            const q = {
                select() { return this; },
                eq(column, value) { calls.push(['eq', table, column, value]); return this; },
                limit() { return this; },
                update(row) { operation = 'update'; updatePayload = row; calls.push(['update', table, row]); return this; },
                maybeSingle() {
                    if (table === 'profiles') return Promise.resolve({ data: { role }, error: null });
                    if (table === 'photographer_profiles') return Promise.resolve({ data: { photographer_id: USER }, error: null });
                    if (table === 'bookings' && operation === 'update') {
                        return Promise.resolve({ data: stale ? null : { ...booking, photographer_id: owner, status, ...updatePayload }, error: null });
                    }
                    if (table === 'bookings') return Promise.resolve({ data: visible ? { ...booking, status, photographer_id: owner } : null, error: null });
                    return Promise.resolve({ data: null, error: null });
                },
                then(resolve, reject) {
                    const data = table === 'invoices' ? (invoice ? [{ invoice_id: 'inv' }] : [])
                        : table === 'galleries' ? (gallery ? [{ gallery_id: 'gal' }] : []) : [];
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                },
            };
            return q;
        },
    };
    return db;
}

test('status validation permits only one status field with a known target', () => {
    for (const input of [null, [], {}, { status: 'pending' }, { status: 'paid' },
        { status: 'confirmed', total_amount: 0 }, { status: 123 }, { status: null }]) {
        assert.throws(() => validateBookingStatusBody(input), BookingRequestError);
    }
    for (const status of ['confirmed', 'declined', 'completed', 'cancelled']) {
        assert.equal(validateBookingStatusBody({ status }), status);
    }
});

test('only expected state transitions are defined', () => {
    assert.deepEqual(STATUS_TRANSITIONS.pending, ['confirmed', 'declined']);
    assert.deepEqual(STATUS_TRANSITIONS.confirmed, ['completed', 'cancelled']);
    for (const status of ['completed', 'cancelled', 'declined']) assert.deepEqual(STATUS_TRANSITIONS[status], []);
});

test('pending can be confirmed and declined', async () => {
    for (const status of ['confirmed', 'declined']) {
        const db = fakeDb();
        const result = await changePhotographerBookingStatus(db, USER, ID, { status });
        assert.equal(result.status, status);
        assert.deepEqual(db.calls.find(c => c[0] === 'update')[2], { status });
        assert.ok(db.calls.some(c => c[0] === 'eq' && c[2] === 'updated_at'));
    }
});

test('confirmed can be completed and cancelled', async () => {
    for (const status of ['completed', 'cancelled']) {
        const db = fakeDb({ status: 'confirmed' });
        const result = await changePhotographerBookingStatus(db, USER, ID, { status });
        assert.equal(result.status, status);
    }
});

test('rejects transitions from terminal states and invalid transitions', async () => {
    for (const [from, to] of [
        ['pending', 'completed'], ['pending', 'cancelled'], ['confirmed', 'declined'],
        ['confirmed', 'confirmed'], ['completed', 'cancelled'], ['cancelled', 'confirmed'], ['declined', 'confirmed'],
    ]) {
        const db = fakeDb({ status: from });
        await assert.rejects(() => changePhotographerBookingStatus(db, USER, ID, { status: to }), isError(409, 'INVALID_STATUS_TRANSITION'));
        assert.equal(db.calls.some(c => c[0] === 'update'), false);
    }
});

test('rejects client, foreign and RLS-hidden bookings', async () => {
    for (const [options, status, code] of [
        [{ role: 'client' }, 403, 'PHOTOGRAPHER_REQUIRED'],
        [{ owner: OTHER }, 404, 'BOOKING_NOT_FOUND'],
        [{ visible: false }, 404, 'BOOKING_NOT_FOUND'],
    ]) {
        const db = fakeDb(options);
        await assert.rejects(() => changePhotographerBookingStatus(db, USER, ID, { status: 'confirmed' }), isError(status, code));
        assert.equal(db.calls.some(c => c[0] === 'update'), false);
    }
});

test('declining or cancelling a booking with an invoice or gallery is blocked', async () => {
    for (const [from, to] of [['pending', 'declined'], ['confirmed', 'cancelled']]) {
        for (const dependency of [{ invoice: true }, { gallery: true }]) {
            const db = fakeDb({ status: from, ...dependency });
            await assert.rejects(() => changePhotographerBookingStatus(db, USER, ID, { status: to }), isError(409, 'BOOKING_HAS_DEPENDENCIES'));
            assert.equal(db.calls.some(c => c[0] === 'update'), false);
        }
    }
});

test('stale writes return a conflict, not false success', async () => {
    const db = fakeDb({ stale: true });
    await assert.rejects(() => changePhotographerBookingStatus(db, USER, ID, { status: 'confirmed' }), isError(409, 'BOOKING_CHANGED'));
});
