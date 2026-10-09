import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingRequestError } from '../src/services/bookingCreateService.js';
import { deletePhotographerBooking } from '../src/services/bookingDeleteService.js';

const OWNER = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const ID = 'c7c38cf4-a371-4a8f-828a-4a60f9dad264';
const original = {
    booking_id: ID, photographer_id: OWNER, status: 'confirmed',
    updated_at: '2026-10-09T05:15:25.124673+00:00',
};

function fakeDb({ visible = true, role = 'photographer', owner = OWNER,
    status = 'confirmed', linkedTable = null, stale = false, fkViolation = false,
    readError = false, deleteError = false } = {}) {
    const calls = [];
    const db = {
        calls,
        from(table) {
            calls.push(['from', table]);
            let deleting = false;
            const q = {
                select() { return this; },
                eq() { return this; },
                limit() { return this; },
                delete() { deleting = true; calls.push(['delete', table]); return this; },
                maybeSingle() {
                    if (table === 'bookings' && deleting) {
                        if (fkViolation) return Promise.resolve({ data: null, error: { code: '23503' } });
                        if (deleteError) return Promise.resolve({ data: null, error: { code: 'OTHER' } });
                        return Promise.resolve({ data: stale ? null : { booking_id: ID }, error: null });
                    }
                    if (table === 'bookings') {
                        return Promise.resolve({ data: visible ? { ...original, photographer_id: owner, status } : null,
                            error: readError ? { code: 'OTHER' } : null });
                    }
                    if (table === 'profiles') return Promise.resolve({ data: { role }, error: null });
                    if (table === 'photographer_profiles') return Promise.resolve({ data: { photographer_id: OWNER }, error: null });
                    throw new Error(`Unexpected maybeSingle on ${table}`);
                },
                then(resolve, reject) {
                    const data = table === linkedTable ? [{ id: 'linked' }] : [];
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                },
            };
            return q;
        },
    };
    return db;
}
const errorIs = (status, code) => e => e instanceof BookingRequestError && e.status === status && e.code === code;

test('DELETE removes an owned confirmed booking with no dependencies', async () => {
    const db = fakeDb();
    const result = await deletePhotographerBooking(db, OWNER, ID);
    assert.deepEqual(result, { booking_id: ID });
    assert.equal(db.calls.filter(call => call[0] === 'delete').length, 1);
    for (const table of ['invoices', 'galleries', 'reviews']) {
        assert.ok(db.calls.some(call => call[0] === 'from' && call[1] === table));
    }
});

test('DELETE does not remove a missing or RLS-hidden booking', async () => {
    const db = fakeDb({ visible: false });
    await assert.rejects(() => deletePhotographerBooking(db, OWNER, ID), errorIs(404, 'BOOKING_NOT_FOUND'));
    assert.equal(db.calls.some(call => call[0] === 'delete'), false);
});

test('DELETE rejects client accounts and bookings owned by another photographer', async () => {
    for (const [opts, status, code] of [
        [{ role: 'client' }, 403, 'PHOTOGRAPHER_REQUIRED'],
        [{ owner: '99999999-9999-4999-8999-999999999999' }, 404, 'BOOKING_NOT_FOUND'],
    ]) {
        const db = fakeDb(opts);
        await assert.rejects(() => deletePhotographerBooking(db, OWNER, ID), errorIs(status, code));
        assert.equal(db.calls.some(call => call[0] === 'delete'), false);
    }
});

test('DELETE rejects completed, cancelled and declined booking history', async () => {
    for (const status of ['completed', 'cancelled', 'declined']) {
        const db = fakeDb({ status });
        await assert.rejects(() => deletePhotographerBooking(db, OWNER, ID), errorIs(409, 'BOOKING_LOCKED'));
        assert.equal(db.calls.some(call => call[0] === 'delete'), false);
    }
});

test('DELETE rejects invoice, gallery and review dependencies', async () => {
    for (const linkedTable of ['invoices', 'galleries', 'reviews']) {
        const db = fakeDb({ linkedTable });
        await assert.rejects(() => deletePhotographerBooking(db, OWNER, ID), errorIs(409, 'BOOKING_HAS_DEPENDENCIES'));
        assert.equal(db.calls.some(call => call[0] === 'delete'), false);
    }
});

test('DELETE converts a database foreign-key violation into HTTP 409', async () => {
    const db = fakeDb({ fkViolation: true });
    await assert.rejects(() => deletePhotographerBooking(db, OWNER, ID), errorIs(409, 'BOOKING_HAS_DEPENDENCIES'));
});

test('DELETE reports a changed booking rather than claiming success', async () => {
    const db = fakeDb({ stale: true });
    await assert.rejects(() => deletePhotographerBooking(db, OWNER, ID), errorIs(409, 'BOOKING_CHANGED'));
});

test('DELETE propagates unexpected database errors', async () => {
    await assert.rejects(() => deletePhotographerBooking(fakeDb({ readError: true }), OWNER, ID), /Unable to retrieve booking/);
    await assert.rejects(() => deletePhotographerBooking(fakeDb({ deleteError: true }), OWNER, ID), /Unable to delete booking/);
});
