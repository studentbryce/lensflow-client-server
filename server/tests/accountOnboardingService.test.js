import test from 'node:test';
import assert from 'node:assert/strict';
import { completeAccount, getAccountProfile, OnboardingError } from '../src/services/accountOnboardingService.js';
const UID = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';
const user = (role = 'client', overrides = {}) => ({
  id: UID, email: 'person@example.com', user_metadata: {
    signup_type: role, first_name: 'Jane', last_name: 'Doe', photographer_id: PID,
    business_name: 'Jane Photography', ...overrides,
  },
});
function mockDb(overrides = {}) {
  const calls = [];
  const responses = {
    profiles: { data: null, error: null },
    photographer_profiles: { data: { photographer_id: PID }, error: null },
    clients: { data: null, error: null },
    ...overrides,
  };
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(fields) { calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        maybeSingle() { return Promise.resolve(responses[table]); },
        insert(values) { calls.push(['insert', table, values]); return Promise.resolve({ error: null }); },
      };
    },
  };
}
const calls = (db, type, table) => db.calls.filter(c => c[0] === type && c[1] === table);
test('onboarding rejects unauthenticated users', async () => {
  await assert.rejects(completeAccount(mockDb(), null), e => e.status === 401);
});
test('profile read scopes by verified user id', async () => {
  const db = mockDb(); await getAccountProfile(db, user());
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'profiles' && c[2] === 'user_id' && c[3] === UID));
});
test('unknown signup role does not create profiles', async () => {
  const db = mockDb(); await completeAccount(db, user('administrator'));
  assert.equal(calls(db, 'insert', 'profiles').length, 0);
});
test('client signup checks published photographer before inserting', async () => {
  const db = mockDb(); await completeAccount(db, user());
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'photographer_profiles' && c[2] === 'published' && c[3] === true));
  assert.equal(calls(db, 'insert', 'profiles')[0][2].role, 'client');
  assert.equal(calls(db, 'insert', 'clients')[0][2].photographer_id, PID);
});
test('client signup refuses unpublished photographer', async () => {
  const db = mockDb({ photographer_profiles: { data: null, error: null } });
  await assert.rejects(completeAccount(db, user()), e => e.status === 422);
  assert.equal(calls(db, 'insert', 'profiles').length, 0);
});
test('client signup refuses malformed photographer id', async () => {
  const db = mockDb(); await assert.rejects(completeAccount(db, user('client', { photographer_id: 'invalid' })), e => e.status === 422);
  assert.equal(db.calls.length, 0);
});
test('client signup never reassigns existing client affiliation', async () => {
  const db = mockDb({ profiles: { data: { user_id: UID, role: 'client' }, error: null },
    clients: { data: { client_id: 'existing', photographer_id: PID }, error: null } });
  await completeAccount(db, user());
  assert.equal(calls(db, 'insert', 'clients').length, 0);
});
test('role mismatch cannot change an established account role', async () => {
  const db = mockDb({ profiles: { data: { user_id: UID, role: 'photographer' }, error: null } });
  const result = await completeAccount(db, user('client'));
  assert.equal(result.role, 'photographer');
  assert.equal(calls(db, 'insert', 'clients').length, 0);
});
test('photographer signup creates unpublished business with unique slug', async () => {
  const db = mockDb({ photographer_profiles: { data: null, error: null } });
  await completeAccount(db, user('photographer'));
  const created = calls(db, 'insert', 'photographer_profiles')[0][2];
  assert.equal(created.published, false);
  assert.equal(created.user_id, UID);
  assert.equal(created.slug, `jane-photography-${UID.slice(0, 8)}`);
});
test('photographer signup does not duplicate existing business', async () => {
  const db = mockDb({ profiles: { data: { user_id: UID, role: 'photographer' }, error: null } });
  await completeAccount(db, user('photographer'));
  assert.equal(calls(db, 'insert', 'photographer_profiles').length, 0);
});
test('missing or too long names are rejected before writes', async () => {
  for (const first_name of ['', 'a'.repeat(101)]) {
    const db = mockDb();
    await assert.rejects(completeAccount(db, user('client', { first_name })), e => e.status === 422);
    assert.equal(db.calls.length, 0);
  }
});
test('missing business name is rejected', async () => {
  await assert.rejects(completeAccount(mockDb(), user('photographer', { business_name: ' ' })), e => e.status === 422);
});
test('database failures are propagated for consistent 500 response', async () => {
  const db = mockDb({ profiles: { data: null, error: { message: 'internal error' } } });
  await assert.rejects(completeAccount(db, user()), /Unable to load account profile/);
});
test('idempotent signup tolerates unique constraint race', async () => {
  const db = mockDb();
  const original = db.from.bind(db);
  db.from = table => {
    const chain = original(table);
    if (table === 'profiles') chain.insert = async values => {
      db.calls.push(['insert', table, values]);
      return { error: { code: '23505' } };
    };
    return chain;
  };
  await completeAccount(db, user());
  assert.equal(calls(db, 'insert', 'clients').length, 1);
});
test('other profile insert errors are not silently ignored', async () => {
  const db = mockDb(); const original = db.from.bind(db);
  db.from = table => { const chain = original(table); if (table === 'profiles') chain.insert = async () => ({ error: { code: '42501' } }); return chain; };
  await assert.rejects(completeAccount(db, user()), /Unable to create account profile/);
});
test('client account creation derives user_id from verified user, not request body', async () => {
  const db = mockDb(); await completeAccount(db, user());
  assert.equal(calls(db, 'insert', 'clients')[0][2].user_id, UID);
});
