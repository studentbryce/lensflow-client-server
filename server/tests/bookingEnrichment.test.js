import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichBookingsWithProfiles } from '../src/services/bookingService.js';

const bookingA = {
  booking_id: 'a',
  clients: { client_id: 'c1', user_id: 'user-1' },
  services: { service_id: 's1', name: 'Portrait Session' },
};
const bookingB = {
  booking_id: 'b',
  clients: { client_id: 'c2', user_id: 'user-1' },
  services: { service_id: 's2', name: 'Wedding Session' },
};

function databaseWithProfiles(profiles, error = null) {
  const calls = [];
  const query = {
    select(fields) { calls.push(['select', fields]); return this; },
    in(field, ids) { calls.push(['in', field, ids]); return Promise.resolve({ data: profiles, error }); },
  };
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

test('adds client profile to each booking using a single user-scoped profile query', async () => {
  const db = databaseWithProfiles([{ user_id: 'user-1', first_name: 'Test', last_name: 'Client' }]);
  const rows = await enrichBookingsWithProfiles(db, [bookingA, bookingB]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].photographerClientProfile.first_name, 'Test');
  assert.equal(rows[1].services.name, 'Wedding Session');
  assert.deepEqual(db.calls[0], ['from', 'profiles']);
  assert.deepEqual(db.calls[2], ['in', 'user_id', ['user-1']]);
});

test('does not query profiles when no bookings exist', async () => {
  assert.deepEqual(await enrichBookingsWithProfiles({}, []), []);
});

test('handles missing client profile without exposing other records', async () => {
  const rows = await enrichBookingsWithProfiles(databaseWithProfiles([]), [bookingA]);
  assert.equal(rows[0].photographerClientProfile, null);
});

test('does not expose raw database errors', async () => {
  const raw = { message: 'private database detail' };
  await assert.rejects(
    () => enrichBookingsWithProfiles(databaseWithProfiles(null, raw), [bookingA]),
    (error) => error.message === 'Unable to retrieve booking client details.' && error.cause === raw,
  );
});

import { listBookingsWithRelations, findBookingWithRelationsById } from '../src/services/bookingService.js';

test('UI list query includes client and service joins', async () => {
  const calls = [];
  const query = {
    select(fields) { calls.push(['select', fields]); return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: [bookingA], error: null }); },
  };
  const db = { from(table) { assert.equal(table, 'bookings'); return query; } };
  const rows = await listBookingsWithRelations(db);
  assert.equal(rows.length, 1);
  assert.match(calls[0][1], /clients \(/);
  assert.match(calls[0][1], /services \(/);
});

test('UI detail query includes client and service joins', async () => {
  let fields;
  const query = {
    select(value) { fields = value; return this; },
    eq(field, value) { assert.equal(field, 'booking_id'); assert.equal(value, 'a'); return this; },
    maybeSingle() { return Promise.resolve({ data: bookingA, error: null }); },
  };
  const db = { from(table) { assert.equal(table, 'bookings'); return query; } };
  const row = await findBookingWithRelationsById(db, 'a');
  assert.equal(row.booking_id, 'a');
  assert.match(fields, /services \(/);
});
