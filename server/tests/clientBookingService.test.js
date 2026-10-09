import test from 'node:test';
import assert from 'node:assert/strict';
import { findAuthenticatedClient, listClientBookings, findClientBooking, ClientBookingError, CLIENT_BOOKING_LIMIT } from '../src/services/clientBookingService.js';

function fakeDb(clientResult, bookingResult) {
  const calls = [];
  function chain(result) {
    const query = {
      select(value) { calls.push(['select', value]); return this; },
      eq(key, value) { calls.push(['eq', key, value]); return this; },
      order(key) { calls.push(['order', key]); return this; },
      limit(value) { calls.push(['limit', value]); return Promise.resolve(result); },
      maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(result); },
    };
    return query;
  }
  return { calls, from(table) { calls.push(['from', table]); return chain(table === 'clients' ? clientResult : bookingResult); } };
}
const client = { data: { client_id: 'client-a' }, error: null };

test('resolves client from verified user ID (never a browser-provided client ID)', async () => {
  const db = fakeDb(client, {});
  assert.equal(await findAuthenticatedClient(db, 'auth-user-a'), 'client-a');
  assert.deepEqual(db.calls.filter(x => x[0] === 'eq'), [['eq', 'user_id', 'auth-user-a']]);
});

test('rejects authenticated users without a client record', async () => {
  const db = fakeDb({ data: null, error: null }, {});
  await assert.rejects(() => listClientBookings(db, 'photographer-user'), e => e instanceof ClientBookingError && e.status === 403);
  assert.equal(db.calls.some(x => x[0] === 'from' && x[1] === 'bookings'), false);
});

test('rejects missing authenticated user', async () => {
  await assert.rejects(() => findAuthenticatedClient(fakeDb(client, {}), null), e => e.status === 401);
});

test('client list is filtered by derived client ID and bounded', async () => {
  const rows = [{ booking_id: 'b1', services: { name: 'Portraits' } }];
  const db = fakeDb(client, { data: rows, error: null });
  assert.deepEqual(await listClientBookings(db, 'auth-user-a'), rows);
  assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'client_id' && x[2] === 'client-a'));
  assert.ok(db.calls.some(x => x[0] === 'limit' && x[1] === CLIENT_BOOKING_LIMIT));
});

test('client detail filters by booking ID AND derived client ID', async () => {
  const row = { booking_id: 'b1', services: { name: 'Portraits' } };
  const db = fakeDb(client, { data: row, error: null });
  assert.deepEqual(await findClientBooking(db, 'auth-user-a', 'b1'), row);
  assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'booking_id' && x[2] === 'b1'));
  assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'client_id' && x[2] === 'client-a'));
});

test('RLS-hidden or missing detail remains null', async () => {
  const db = fakeDb(client, { data: null, error: null });
  assert.equal(await findClientBooking(db, 'auth-user-a', 'other-client-booking'), null);
});

test('database errors do not leak raw query details', async () => {
  const db = fakeDb(client, { data: null, error: { message: 'private db details' } });
  await assert.rejects(() => listClientBookings(db, 'auth-user-a'), e => e.message === 'Unable to retrieve client bookings.' && !e.message.includes('private'));
});
