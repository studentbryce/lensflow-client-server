import assert from 'node:assert/strict';
import test from 'node:test';
import { getPhotographerBookingRelated } from '../src/services/bookingRelatedService.js';

const bookingId = 'e09fbb28-35e9-4936-b8eb-b2d8c8663d3e';
const photographerId = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const userId = photographerId;

function mockDatabase({ booking = { booking_id: bookingId, photographer_id: photographerId }, role = 'photographer',
    photographer = { photographer_id: photographerId }, invoice = null, gallery = null,
    errorTable = null } = {}) {
    const calls = [];
    const results = { bookings: booking, profiles: { role }, photographer_profiles: photographer, invoices: invoice, galleries: gallery };
    return {
        calls,
        from(table) {
            calls.push(['from', table]);
            return {
                select(columns) { calls.push(['select', table, columns]); return this; },
                eq(field, value) { calls.push(['eq', table, field, value]); return this; },
                maybeSingle() { calls.push(['maybeSingle', table]); return Promise.resolve({
                    data: results[table] ?? null,
                    error: table === errorTable ? { code: '42501', message: 'private db message' } : null,
                }); },
            };
        },
    };
}

test('returns invoice and gallery summaries for the owning photographer', async () => {
    const invoice = { invoice_id: 'invoice-1', invoice_number: 'INV-1', status: 'draft' };
    const gallery = { gallery_id: 'gallery-1', name: 'Wedding', is_published: false };
    const db = mockDatabase({ invoice, gallery });
    assert.deepEqual(await getPhotographerBookingRelated(db, userId, bookingId), { invoice, gallery });
    for (const table of ['invoices', 'galleries']) {
        assert.ok(db.calls.some(([op, t, field, val]) => op === 'eq' && t === table && field === 'booking_id' && val === bookingId));
        assert.ok(db.calls.some(([op, t, field, val]) => op === 'eq' && t === table && field === 'photographer_id' && val === photographerId));
    }
});

test('returns null summaries when no linked records exist', async () => {
    assert.deepEqual(await getPhotographerBookingRelated(mockDatabase(), userId, bookingId), { invoice: null, gallery: null });
});

test('returns 404 for missing or RLS-hidden booking before querying linked data', async () => {
    const db = mockDatabase({ booking: null });
    await assert.rejects(() => getPhotographerBookingRelated(db, userId, bookingId), e => e.status === 404);
    assert.equal(db.calls.some(([op, t]) => op === 'from' && t === 'invoices'), false);
});

test('rejects a client account even if their booking is visible', async () => {
    const db = mockDatabase({ role: 'client' });
    await assert.rejects(() => getPhotographerBookingRelated(db, userId, bookingId), e => e.status === 403);
    assert.equal(db.calls.some(([op, t]) => op === 'from' && t === 'invoices'), false);
});

test('returns 404 for a booking belonging to another photographer', async () => {
    const db = mockDatabase({ booking: { booking_id: bookingId, photographer_id: 'different-owner' } });
    await assert.rejects(() => getPhotographerBookingRelated(db, userId, bookingId), e => e.status === 404);
    assert.equal(db.calls.some(([op, t]) => op === 'from' && t === 'galleries'), false);
});

test('does not expose database errors to the caller', async () => {
    const db = mockDatabase({ errorTable: 'invoices' });
    await assert.rejects(() => getPhotographerBookingRelated(db, userId, bookingId), e => e.message === 'Unable to retrieve linked invoice.' && e.cause?.code === '42501');
});
