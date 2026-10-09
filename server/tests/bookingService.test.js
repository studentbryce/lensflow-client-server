import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_PAGE_LIMIT, listBookings } from '../src/services/bookingService.js';

function fakeDatabase(result) {
    const calls = [];
    const query = {
        select(fields) { calls.push(['select', fields]); return this; },
        order(field, options) { calls.push(['order', field, options]); return this; },
        limit(value) { calls.push(['limit', value]); return Promise.resolve(result); },
    };
    return {
        calls,
        from(table) { calls.push(['from', table]); return query; },
    };
}

test('lists bookings using explicit fields, ordering and bounded result size', async () => {
    const rows = [{ booking_id: 'example-id' }];
    const database = fakeDatabase({ data: rows, error: null });
    assert.deepEqual(await listBookings(database), rows);
    assert.equal(database.calls[0][1], 'bookings');
    assert.match(database.calls[1][1], /booking_id/);
    assert.equal(database.calls[2][1], 'booking_date');
    assert.equal(database.calls[3][1], 'start_time');
    assert.deepEqual(database.calls[4], ['limit', BOOKING_PAGE_LIMIT]);
});

test('returns an empty list when no bookings are visible', async () => {
    assert.deepEqual(await listBookings(fakeDatabase({ data: [], error: null })), []);
});

test('throws a safe error when the database query fails', async () => {
    const dbError = { code: '42501', message: 'database permission detail' };
    await assert.rejects(
        () => listBookings(fakeDatabase({ data: null, error: dbError })),
        (error) => error.message === 'Unable to retrieve bookings.' && error.cause === dbError,
    );
});
