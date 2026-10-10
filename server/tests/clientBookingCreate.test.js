import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClient, getClientBookingOptions, getClientBookingDay, validateClientBookingRequest, createClientBookingRequest } from '../src/services/clientBookingCreateService.js';
import { BookingRequestError } from '../src/services/bookingCreateService.js';

const clientId = 'b3d6f9e1-8db7-4cef-9896-d6142905e78c';
const photographerId = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const serviceId = 'd33166be-74cb-43a7-9ee7-bb6699a91016';
const date = '2099-10-20';
const input = { service_id: serviceId, booking_date: date, start_time: '10:00', notes: 'test' };

function fakeDb(overrides = {}) {
  const calls = [];
  const data = {
    profiles: { role: 'client' },
    clients: { client_id: clientId, photographer_id: photographerId },
    services: { service_id: serviceId, duration_minutes: 60, price: 100, is_active: true },
    availability_rules: Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, start_time: '09:00:00', end_time: '17:00:00', is_available: true })),
    availability_exceptions: [],
    bookings: { booking_id: 'a0000000-0000-4000-8000-000000000001' },
    ...overrides,
  };
  const db = {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve(overrides.busyResponse ?? { data: [], error: null });
    },
    from(table) {
      calls.push(['from', table]);
      let inserting = false;
      const q = {
        select(fields) { calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        order() { return this; },
        insert(row) { inserting = true; calls.push(['insert', table, row]); return this; },
        maybeSingle() { return Promise.resolve({ data: data[table], error: null }); },
        single() { return Promise.resolve(inserting && overrides.insertResponse ? overrides.insertResponse : { data: data[table], error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: data[table], error: null }).then(resolve, reject); },
      };
      return q;
    },
  };
  return db;
}

test('rejects client-supplied owner, price, status and end time', () => {
  for (const field of ['client_id', 'photographer_id', 'status', 'total_amount', 'end_time']) {
    assert.throws(() => validateClientBookingRequest({ ...input, [field]: 'malicious' }), e => e instanceof BookingRequestError && e.status === 400);
  }
});

test('requires an authenticated client role and assigned photographer', async () => {
  await assert.rejects(() => resolveClient(fakeDb({ profiles: { role: 'photographer' } }), 'auth-a'), e => e.status === 403);
  await assert.rejects(() => resolveClient(fakeDb({ clients: null }), 'auth-a'), e => e.status === 403);
});

test('form options derive photographer from verified user and load active services and rules', async () => {
  const db = fakeDb({ services: [{ service_id: serviceId }] });
  const result = await getClientBookingOptions(db, 'auth-a');
  assert.equal(result.client.photographer_id, photographerId);
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'services' && c[2] === 'is_active' && c[3] === true));
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'availability_rules' && c[3] === photographerId));
});

test('availability uses secure busy-times RPC and never reads bookings table', async () => {
  const db = fakeDb({ busyResponse: { data: [{ start_time: '10:00:00', end_time: '11:00:00' }], error: null } });
  const day = await getClientBookingDay(db, 'auth-a', date);
  assert.equal(day.bookings.length, 1);
  assert.ok(db.calls.some(c => c[0] === 'rpc' && c[1] === 'get_booking_busy_times'));
  assert.equal(db.calls.some(c => c[0] === 'from' && c[1] === 'bookings'), false);
});

test('invalid availability date is rejected before database access', async () => {
  const db = fakeDb();
  await assert.rejects(() => getClientBookingDay(db, 'auth-a', '2099-02-30'), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});

test('creates pending booking with server-derived client, photographer, duration and price', async () => {
  const db = fakeDb();
  const result = await createClientBookingRequest(db, 'auth-a', input);
  assert.ok(result.booking_id);
  const inserted = db.calls.find(c => c[0] === 'insert' && c[1] === 'bookings')[2];
  assert.equal(inserted.status, 'pending');
  assert.equal(inserted.client_id, clientId);
  assert.equal(inserted.photographer_id, photographerId);
  assert.equal(inserted.total_amount, 100);
  assert.equal(inserted.start_time, '10:00:00');
  assert.equal(inserted.end_time, '11:00:00');
});

test('rejects overlapping slot even though client cannot read other bookings', async () => {
  const db = fakeDb({ busyResponse: { data: [{ start_time: '10:00:00', end_time: '11:00:00' }], error: null } });
  await assert.rejects(() => createClientBookingRequest(db, 'auth-a', input), e => e.status === 409);
  assert.equal(db.calls.some(c => c[0] === 'insert'), false);
});

test('rejects service outside assigned photographer', async () => {
  const db = fakeDb({ services: null });
  await assert.rejects(() => createClientBookingRequest(db, 'auth-a', input), e => e.status === 422);
});

test('maps concurrent PostgreSQL exclusion violation to HTTP 409', async () => {
  const db = fakeDb({ insertResponse: { data: null, error: { code: '23P01' } } });
  await assert.rejects(() => createClientBookingRequest(db, 'auth-a', input), e => e.status === 409);
});

test('fails closed when secure availability lookup fails', async () => {
  const db = fakeDb({ busyResponse: { data: null, error: { code: 'XX000' } } });
  await assert.rejects(() => createClientBookingRequest(db, 'auth-a', input), e => /Unable to load booking availability/.test(e.message));
  assert.equal(db.calls.some(c => c[0] === 'insert'), false);
});
