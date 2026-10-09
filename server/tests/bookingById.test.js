import assert from 'node:assert/strict';
import test from 'node:test';
import { findBookingById, isValidBookingId } from '../src/services/bookingService.js';

const ID = 'e09fbb28-35e9-4936-b8eb-b2d8c8663d3e';

function fakeDatabase(result) {
    const calls = [];
    const query = {
        select(fields) { calls.push(['select', fields]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(result); },
    };
    return {
        calls,
        from(table) { calls.push(['from', table]); return query; },
    };
}

test('validates canonical booking UUIDs', () => {
    assert.equal(isValidBookingId(ID), true);
    assert.equal(isValidBookingId(ID.toUpperCase()), true);
    for (const invalid of ['abc', '', '1234', '../bookings', null, undefined, 42]) {
        assert.equal(isValidBookingId(invalid), false);
    }
});

test('looks up one booking by primary key with explicit fields', async () => {
    const booking = { booking_id: ID, status: 'confirmed' };
    const db = fakeDatabase({ data: booking, error: null });
    assert.deepEqual(await findBookingById(db, ID), booking);
    assert.deepEqual(db.calls[0], ['from', 'bookings']);
    assert.equal(db.calls[1][0], 'select');
    assert.match(db.calls[1][1], /booking_id/);
    assert.deepEqual(db.calls[2], ['eq', 'booking_id', ID]);
    assert.deepEqual(db.calls[3], ['maybeSingle']);
});

test('returns null when booking is missing or hidden by RLS', async () => {
    assert.equal(await findBookingById(fakeDatabase({ data: null, error: null }), ID), null);
});

test('throws a safe error when PostgreSQL returns an error', async () => {
    const databaseError = { code: '42501', message: 'private permission details' };
    await assert.rejects(
        () => findBookingById(fakeDatabase({ data: null, error: databaseError }), ID),
        (error) => error.message === 'Unable to retrieve booking.' && error.cause === databaseError,
    );
});
