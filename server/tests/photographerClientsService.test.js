import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateClientId, validateClientUpdate, listPhotographerClients,
  getPhotographerClient, updatePhotographerClient,
} from '../src/services/photographerClientsService.js';

const userId = '82c3cfe7-61de-4579-a513-54a2b14784d9';
const photographerId = 'f34fbc6d-31df-4e6a-a253-b6ab89b7b8ce';
const clientId = '64b7d3c2-8e3c-4f6a-bc6f-f88e348f6f99';
const clientUserId = '84ad6a73-51b9-4cba-9627-04a96d5d202a';
const client = { client_id: clientId, user_id: clientUserId, photographer_id: photographerId, notes: 'Initial', created_at: '2026-10-10' };
const profile = { user_id: clientUserId, first_name: 'Pat', last_name: 'Example', email: 'pat@example.com', phone: null };

function mockDb({ role = 'photographer', photographer = photographerId, clients = [client], profiles = [profile], bookings = [], errors = {} } = {}) {
  const data = { clients: structuredClone(clients), profiles: structuredClone(profiles), bookings: structuredClone(bookings) };
  const calls = [];
  return {
    calls, data,
    from(table) {
      const filters = [];
      const orders = [];
      let update = null;
      let selected = null;
      let range = null;
      const query = {
        select(fields) { selected = fields; calls.push({ table, op: 'select', fields }); return this; },
        eq(key, value) { filters.push(row => row[key] === value); calls.push({ table, op: 'eq', key, value }); return this; },
        in(key, values) { filters.push(row => values.includes(row[key])); calls.push({ table, op: 'in', key, values }); return this; },
        order(key, options = {}) { orders.push({ key, ascending: options.ascending !== false }); return this; },
        range(start, end) { range = [start, end]; calls.push({ table, op: 'range', start, end }); return this; },
        update(changes) { update = changes; calls.push({ table, op: 'update', changes }); return this; },
        maybeSingle() {
          if (table === 'profiles' && !update && selected === 'role') {
            return Promise.resolve({ data: { role }, error: errors.role ?? null });
          }
          if (table === 'photographer_profiles') {
            return Promise.resolve({ data: photographer ? { photographer_id: photographer } : null, error: errors.photographer_profiles ?? null });
          }
          return this.then(x => ({ data: x.data[0] ?? null, error: x.error }));
        },
        then(resolve, reject) {
          let rows = (data[table] ?? []).filter(row => filters.every(f => f(row)));
          if (orders.length) rows = [...rows].sort((a,b) => {
            for (const { key, ascending } of orders) {
              const cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
              if (cmp) return ascending ? cmp : -cmp;
            }
            return 0;
          });
          if (update) for (const row of rows) Object.assign(row, update);
          if (range) rows = rows.slice(range[0], range[1]+1);
          return Promise.resolve({ data: rows, error: errors[table] ?? null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test('client ID validation rejects malformed IDs', () => {
  assert.equal(validateClientId(clientId), clientId);
  for (const value of ['x', '', null, '00000000-0000-0000-0000-00000000000Z']) {
    assert.throws(() => validateClientId(value), e => e.status === 400);
  }
});

test('client edits enforce strict allowlist and valid email', () => {
  assert.deepEqual(validateClientUpdate({ first_name: ' Pat ', phone: ' ', notes: ' Notes ' }),
    { first_name: 'Pat', phone: null, notes: 'Notes' });
  for (const body of [null, [], {}, { role: 'photographer' }, { user_id: userId }, { photographer_id: photographerId }, { email: 'invalid' }, { notes: 5 }, { first_name: 'a'.repeat(101) }]) {
    assert.throws(() => validateClientUpdate(body), e => e.status === 400);
  }
});

test('client role cannot list photographer clients or read client data', async () => {
  const db = mockDb({ role: 'client' });
  await assert.rejects(() => listPhotographerClients(db, userId), e => e.status === 403);
  assert.equal(db.calls.some(c => c.table === 'clients'), false);
});

test('client role cannot update clients or execute updates', async () => {
  const db = mockDb({ role: 'client' });
  await assert.rejects(() => updatePhotographerClient(db, userId, clientId, { notes: 'changed' }), e => e.status === 403);
  assert.equal(db.calls.some(c => c.op === 'update'), false);
});

test('empty photographer client list skips unrelated profile and booking queries', async () => {
  const db = mockDb({ clients: [] });
  assert.deepEqual(await listPhotographerClients(db, userId), []);
  assert.equal(db.calls.some(c => c.table === 'bookings'), false);
});

test('client list returns original shape, latest booking and counts', async () => {
  const db = mockDb({ bookings: [
    { booking_id: 'old', photographer_id: photographerId, client_id: clientId, booking_date: '2026-09-12', services: { name: 'Portrait' } },
    { booking_id: 'new', photographer_id: photographerId, client_id: clientId, booking_date: '2026-10-12', services: { name: 'Wedding' } },
  ] });
  const rows = await listPhotographerClients(db, userId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].profile.first_name, 'Pat');
  assert.equal(rows[0].bookingCount, 2);
  assert.equal(rows[0].latestBooking.booking_id, 'new');
  assert.equal(rows[0].bookings.length, 2);
});

test('list scopes clients and bookings to the authenticated photographer', async () => {
  const db = mockDb();
  await listPhotographerClients(db, userId);
  for (const table of ['clients', 'bookings']) {
    assert.ok(db.calls.some(c => c.table === table && c.op === 'eq' && c.key === 'photographer_id' && c.value === photographerId));
  }
});

test('list pages beyond 500 bookings rather than truncating counts', async () => {
  const db = mockDb({ bookings: Array.from({ length: 505 }, (_, i) => ({
    booking_id: String(i), client_id: clientId, photographer_id: photographerId, booking_date: '2026-10-12',
  })) });
  const rows = await listPhotographerClients(db, userId);
  assert.equal(rows[0].bookingCount, 505);
  assert.equal(db.calls.filter(c => c.table === 'bookings' && c.op === 'range').length, 2);
});

test('detail returns client and bookings, including time fields', async () => {
  const db = mockDb({ bookings: [{ booking_id: '1', client_id: clientId, photographer_id: photographerId, booking_date: '2026-10-13', start_time: '10:00:00', end_time: '11:00:00' }] });
  const result = await getPhotographerClient(db, userId, clientId);
  assert.equal(result.client.profile.email, 'pat@example.com');
  assert.equal(result.bookings[0].start_time, '10:00:00');
});

test('other photographer client ID yields 404 and does not query profiles/bookings', async () => {
  const db = mockDb({ clients: [{ ...client, photographer_id: 'other' }] });
  await assert.rejects(() => getPhotographerClient(db, userId, clientId), e => e.status === 404);
  assert.equal(db.calls.some(c => c.table === 'bookings'), false);
});

test('invalid ID and invalid edits rejected before database access', async () => {
  const db = mockDb();
  await assert.rejects(() => getPhotographerClient(db, userId, 'bad'), e => e.status === 400);
  await assert.rejects(() => updatePhotographerClient(db, userId, clientId, { status: 'admin' }), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});

test('profile and notes edits update only allowed fields under owner checks', async () => {
  const db = mockDb();
  await updatePhotographerClient(db, userId, clientId, { first_name: 'Updated', email: 'new@example.com', notes: 'Test note' });
  assert.equal(db.data.profiles[0].first_name, 'Updated');
  assert.equal(db.data.clients[0].notes, 'Test note');
  assert.equal(db.calls.filter(c => c.op === 'update').length, 2);
  assert.ok(db.calls.some(c => c.table === 'clients' && c.op === 'eq' && c.key === 'photographer_id' && c.value === photographerId));
});

test('notes-only update does not touch client profile', async () => {
  const db = mockDb();
  await updatePhotographerClient(db, userId, clientId, { notes: 'Only note' });
  assert.equal(db.calls.some(c => c.table === 'profiles' && c.op === 'update'), false);
});

test('database failures are surfaced, not treated as empty results', async () => {
  const db = mockDb({ errors: { bookings: { code: 'DB_FAILURE' } } });
  await assert.rejects(() => listPhotographerClients(db, userId), /Unable to load client booking summaries/);
});

test('client list pages beyond 500 clients and batches profile lookups', async () => {
  const many = Array.from({ length: 505 }, (_, i) => ({
    ...client,
    client_id: `client-${String(i).padStart(4, '0')}`,
    user_id: `user-${String(i).padStart(4, '0')}`,
  }));
  const db = mockDb({ clients: many, profiles: many.map(c => ({ user_id: c.user_id, first_name: 'Example' })) });
  const rows = await listPhotographerClients(db, userId);
  assert.equal(rows.length, 505);
  assert.equal(rows.filter(c => c.profile).length, 505);
  assert.equal(db.calls.filter(c => c.table === 'clients' && c.op === 'range').length, 2);
  assert.equal(db.calls.filter(c => c.table === 'profiles' && c.op === 'in').length, 6);
});

test('update cannot change an unowned client even if body is valid', async () => {
  const db = mockDb({ clients: [{ ...client, photographer_id: 'other' }] });
  await assert.rejects(() => updatePhotographerClient(db, userId, clientId, { email: 'new@example.com' }), e => e.status === 404);
  assert.equal(db.calls.some(c => c.op === 'update'), false);
});
