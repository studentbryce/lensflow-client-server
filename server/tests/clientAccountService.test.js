import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClientDashboard, getClientProfile, updateClientProfile, validateProfileUpdate, ClientAccountError } from '../src/services/clientAccountService.js';

function fakeDb(responses = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      const query = {
        select(fields) { calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        order(field) { calls.push(['order', table, field]); return this; },
        update(values) { calls.push(['update', table, values]); return this; },
        maybeSingle() { return Promise.resolve(responses[table] ?? { data: null, error: null }); },
        then(resolve, reject) { return Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
}
const client = { data: { client_id: 'client-1', profiles: { first_name: 'Ana', last_name: 'Lee' } }, error: null };
const own = { data: { client_id: 'client-1' }, error: null };

// Client resolution and profile details use the same clients table; fake the first and second reads.
function dashboardDb(overrides = {}) {
  const db = fakeDb({
    clients: client,
    bookings: { data: [
      { booking_id: 'b1', booking_date: '2026-10-12', start_time: '10:00:00', status: 'confirmed' },
      { booking_id: 'b2', booking_date: '2026-10-10', start_time: '09:00:00', status: 'completed' },
      { booking_id: 'b3', booking_date: '2026-10-13', start_time: '08:00:00', status: 'cancelled' },
    ], error: null },
    invoices: { data: [
      { status: 'sent', total_amount: 100 }, { status: 'paid', total_amount: 400 },
      { status: 'overdue', total_amount: '50.50' },
    ], error: null },
    galleries: { data: [{ gallery_id: 'g1' }], error: null },
    ...overrides,
  });
  return db;
}

test('dashboard aggregates own bookings, outstanding invoices and RLS-visible galleries', async () => {
  const db = dashboardDb();
  const result = await loadClientDashboard(db, 'auth-client-1', '2026-10-11');
  assert.deepEqual(result.profile, { first_name: 'Ana', last_name: 'Lee' });
  assert.deepEqual(result.stats, { bookings: 3, upcomingBookings: 1, outstanding: 150.5, galleries: 1 });
  assert.deepEqual(result.upcomingBookings.map(x => x.booking_id), ['b1']);
  for (const table of ['bookings', 'invoices', 'galleries']) {
    assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === table && x[2] === 'client_id' && x[3] === 'client-1'));
  }
  assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'galleries' && x[2] === 'is_published' && x[3] === true));
});

test('dashboard rejects invalid or nonexistent date before querying', async () => {
  const db = dashboardDb();
  for (const value of ['2026-02-30', '10/11/2026', undefined, '2026-13-01']) {
    await assert.rejects(() => loadClientDashboard(db, 'u1', value), e => e instanceof ClientAccountError && e.status === 400);
  }
  assert.equal(db.calls.length, 0);
});

test('dashboard denies non-client users without reading financial data', async () => {
  const db = dashboardDb({ clients: { data: null, error: null } });
  await assert.rejects(() => loadClientDashboard(db, 'photographer', '2026-10-11'), e => e.status === 403);
  assert.ok(!db.calls.some(x => x[0] === 'from' && x[1] === 'invoices'));
});

test('dashboard returns an error without leaking database details', async () => {
  const db = dashboardDb({ invoices: { data: null, error: { message: 'private table details' } } });
  await assert.rejects(() => loadClientDashboard(db, 'u1', '2026-10-11'), e => e.message === 'Unable to load invoices.' && !e.message.includes('private'));
});

test('profile read derives identity from verified user ID', async () => {
  const db = fakeDb({ clients: own, profiles: { data: { user_id: 'u1', first_name: 'Ana' }, error: null } });
  const profile = await getClientProfile(db, 'u1');
  assert.equal(profile.user_id, 'u1');
  assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'profiles' && x[2] === 'user_id' && x[3] === 'u1'));
});

test('profile read rejects photographer role', async () => {
  const db = fakeDb({ clients: { data: null, error: null } });
  await assert.rejects(() => getClientProfile(db, 'photographer'), e => e.status === 403);
  assert.ok(!db.calls.some(x => x[0] === 'from' && x[1] === 'profiles'));
});

test('profile update only allows name and phone and normalizes whitespace', async () => {
  assert.deepEqual(validateProfileUpdate({ first_name: ' Ana ', last_name: ' Lee ', phone: ' 021 ' }), { first_name: 'Ana', last_name: 'Lee', phone: '021' });
  assert.deepEqual(validateProfileUpdate({ first_name: 'Ana', last_name: 'Lee' }), { first_name: 'Ana', last_name: 'Lee', phone: null });
});

test('profile update rejects email, role, user ID and unexpected fields', () => {
  for (const extra of ['email', 'role', 'user_id', 'is_admin']) {
    assert.throws(() => validateProfileUpdate({ first_name: 'Ana', last_name: 'Lee', [extra]: 'x' }), e => e.status === 400);
  }
});

test('profile update validates names and phone', () => {
  for (const body of [null, [], {}, { first_name: ' ', last_name: 'Lee' }, { first_name: 'Ana', last_name: 'x'.repeat(101) }, { first_name: 'Ana', last_name: 'Lee', phone: 'x'.repeat(31) }]) {
    assert.throws(() => validateProfileUpdate(body), e => e.status === 400);
  }
});

test('profile update scopes update to own user ID and allows no extra fields', async () => {
  const db = fakeDb({ clients: own, profiles: { data: { user_id: 'u1', first_name: 'Ana', last_name: 'Lee' }, error: null } });
  await updateClientProfile(db, 'u1', { first_name: 'Ana', last_name: 'Lee', phone: null });
  assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'profiles' && x[2] === 'user_id' && x[3] === 'u1'));
  const update = db.calls.find(x => x[0] === 'update');
  assert.deepEqual(Object.keys(update[2]).sort(), ['first_name', 'last_name', 'phone']);
});

test('profile update returns 404 if own profile is not found', async () => {
  const db = fakeDb({ clients: own, profiles: { data: null, error: null } });
  await assert.rejects(() => updateClientProfile(db, 'u1', { first_name: 'Ana', last_name: 'Lee' }), e => e.status === 404);
});
