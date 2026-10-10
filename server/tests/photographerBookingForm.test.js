import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePhotographer, getPhotographerBookingFormOptions, getPhotographerBookingDay } from '../src/services/photographerBookingFormService.js';

const userId = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const date = '2099-10-20';
function fakeDb(overrides = {}) {
  const calls = [];
  const data = {
    photographer_profiles: { photographer_id: userId, user_id: userId },
    clients: [{ client_id: 'client-a', user_id: 'auth-a' }],
    services: [{ service_id: 'service-a', name: 'Portrait' }],
    availability_rules: [{ day_of_week: 2, is_available: true }],
    availability_exceptions: [],
    ...overrides,
  };
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve(overrides.busyResponse ?? { data: [{ start_time: '10:00:00', end_time: '11:00:00' }], error: null });
    },
    from(table) {
      calls.push(['from', table]);
      let columns = '';
      const q = {
        select(fields) { columns = fields; calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        in(field, values) { calls.push(['in', table, field, values]); return this; },
        order() { return this; },
        maybeSingle() { return Promise.resolve({ data: table === 'profiles' ? { role: overrides.role ?? 'photographer' } : data[table] ?? null, error: null }); },
        then(resolve, reject) {
          const value = table === 'profiles' && columns.includes('first_name')
            ? [{ user_id: 'auth-a', first_name: 'Test', last_name: 'Client', email: 'test@example.com' }]
            : data[table];
          return Promise.resolve({ data: value, error: overrides.errorTable === table ? { code: '42501' } : null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

test('photographer resolved using authenticated user ID', async () => {
  const db = fakeDb();
  assert.equal((await resolvePhotographer(db, userId)).photographer_id, userId);
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'photographer_profiles' && c[2] === 'user_id' && c[3] === userId));
});
test('client cannot access photographer booking form', async () => {
  const db = fakeDb({ role: 'client' });
  await assert.rejects(() => getPhotographerBookingFormOptions(db, userId), e => e.status === 403);
  assert.equal(db.calls.some(c => c[1] === 'services'), false);
});
test('missing photographer profile is rejected', async () => {
  await assert.rejects(() => resolvePhotographer(fakeDb({ photographer_profiles: null }), userId), e => e.status === 403);
});
test('form options return enriched clients, active services and weekly rules', async () => {
  const db = fakeDb();
  const result = await getPhotographerBookingFormOptions(db, userId);
  assert.equal(result.clients[0].profile.first_name, 'Test');
  assert.equal(result.services[0].name, 'Portrait');
  assert.equal(result.availability_rules.length, 1);
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'services' && c[2] === 'is_active' && c[3] === true));
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'clients' && c[2] === 'photographer_id' && c[3] === userId));
});
test('no clients avoids empty profiles IN query', async () => {
  const db = fakeDb({ clients: [] });
  assert.deepEqual((await getPhotographerBookingFormOptions(db, userId)).clients, []);
  assert.equal(db.calls.some(c => c[0] === 'in'), false);
});
test('availability returns private-safe busy intervals via RPC and no bookings SELECT', async () => {
  const db = fakeDb();
  const result = await getPhotographerBookingDay(db, userId, date);
  assert.deepEqual(result.bookings, [{ start_time: '10:00:00', end_time: '11:00:00' }]);
  assert.ok(db.calls.some(c => c[0] === 'rpc' && c[1] === 'get_booking_busy_times'));
  assert.equal(db.calls.some(c => c[0] === 'from' && c[1] === 'bookings'), false);
});
test('invalid dates fail before database query', async () => {
  const db = fakeDb();
  await assert.rejects(() => getPhotographerBookingDay(db, userId, '2099-02-30'), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
test('availability RPC failure fails closed', async () => {
  await assert.rejects(() => getPhotographerBookingDay(fakeDb({ busyResponse: { data: null, error: { code: 'XX000' } } }), userId, date), e => /Unable to load booking availability/.test(e.message));
});
test('database query errors fail closed', async () => {
  await assert.rejects(() => getPhotographerBookingFormOptions(fakeDb({ errorTable: 'services' }), userId), e => /Unable to load services/.test(e.message));
});
