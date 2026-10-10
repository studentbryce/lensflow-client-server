import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCalendarRange, validateRule, validateException,
  getCalendarData, createCalendarRule, createCalendarException, deleteCalendarRecord,
} from '../src/services/calendarService.js';

const user = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const id = 'd33166be-74cb-43a7-9ee7-bb6699a91016';
function dbMock({ role = 'photographer', bookings = [], clients = [], services = [], profiles = [], rules = [], exceptions = [], deleted = true } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      let action = 'select';
      let input;
      const q = {
        select() { calls.push(['select', table]); return this; },
        eq(key, val) { calls.push(['eq', table, key, val]); return this; },
        gte(key, val) { calls.push(['gte', table, key, val]); return this; },
        lte(key, val) { calls.push(['lte', table, key, val]); return this; },
        in(key, val) { calls.push(['in', table, key, val]); return this; },
        order() { return this; },
        insert(value) { action = 'insert'; input = value; calls.push(['insert', table, value]); return this; },
        delete() { action = 'delete'; calls.push(['delete', table]); return this; },
        single() { return Promise.resolve({ data: { ...input, availability_rule_id: id, exception_id: id }, error: null }); },
        maybeSingle() {
          if (table === 'profiles') return Promise.resolve({ data: { role }, error: null });
          if (table === 'photographer_profiles') return Promise.resolve({ data: { photographer_id: user, user_id: user }, error: null });
          if (action === 'delete') return Promise.resolve({ data: deleted ? { availability_rule_id: id, exception_id: id } : null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          const values = { bookings, clients, services, profiles, availability_rules: rules, availability_exceptions: exceptions };
          return Promise.resolve({ data: values[table] ?? [], error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
test('calendar range requires real dates and maximum 45 days', () => {
  assert.deepEqual(validateCalendarRange('2026-10-01', '2026-11-10'), { start: '2026-10-01', end: '2026-11-10' });
  for (const [a,b] of [['2026-02-30','2026-03-02'], ['2026-11-11','2026-10-01'], ['2026-10-01','2027-02-01']]) {
    assert.throws(() => validateCalendarRange(a,b), e => e.status === 400);
  }
});
test('rule validation rejects bad weekday, time, and extra fields', () => {
  const good = { day_of_week: 2, start_time: '09:00', end_time: '17:00', is_available: true };
  assert.deepEqual(validateRule(good), good);
  assert.throws(() => validateRule({ ...good, day_of_week: 7 }), e => e.status === 400);
  assert.throws(() => validateRule({ ...good, end_time: '08:00' }), e => e.status === 400);
  assert.throws(() => validateRule({ ...good, photographer_id: user }), e => e.status === 400);
});
test('exception validation allows full day or partial, rejects mismatched times', () => {
  const full = validateException({ exception_date: '2026-10-24', start_time: null, end_time: null, is_available: false, reason: '' });
  assert.equal(full.start_time, null);
  assert.equal(full.reason, null);
  assert.throws(() => validateException({ exception_date: '2026-10-24', start_time: '10:00', end_time: null, is_available: false }), e => e.status === 400);
});
test('client role cannot read calendar records', async () => {
  const db = dbMock({ role: 'client' });
  await assert.rejects(() => getCalendarData(db, user, '2026-10-01', '2026-10-31'), e => e.status === 403);
  assert.equal(db.calls.some(c => c[1] === 'bookings'), false);
});
test('calendar returns enriched bookings and owned availability', async () => {
  const db = dbMock({
    bookings: [{ booking_id: id, client_id: id, service_id: id }],
    clients: [{ client_id: id, user_id: 'auth-a' }],
    services: [{ service_id: id, name: 'Portrait' }],
    profiles: [{ user_id: 'auth-a', first_name: 'Test', last_name: 'Client' }],
    rules: [{ day_of_week: 1 }], exceptions: [{ exception_date: '2026-10-24' }],
  });
  const result = await getCalendarData(db, user, '2026-10-01', '2026-10-31');
  assert.equal(result.bookings[0].client.first_name, 'Test');
  assert.equal(result.bookings[0].service.name, 'Portrait');
  assert.equal(result.availability_rules.length, 1);
  assert.equal(result.availability_exceptions.length, 1);
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'bookings' && c[2] === 'photographer_id' && c[3] === user));
});
test('empty month avoids empty IN queries', async () => {
  const db = dbMock();
  const result = await getCalendarData(db, user, '2026-10-01', '2026-10-31');
  assert.deepEqual(result.bookings, []);
  assert.equal(db.calls.some(c => c[0] === 'in'), false);
});
test('create rule derives photographer ID from authenticated user', async () => {
  const db = dbMock();
  await createCalendarRule(db, user, { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true });
  assert.ok(db.calls.some(c => c[0] === 'insert' && c[1] === 'availability_rules' && c[2].photographer_id === user));
});
test('create exception derives photographer ID from authenticated user', async () => {
  const db = dbMock();
  await createCalendarException(db, user, { exception_date: '2026-10-24', start_time: null, end_time: null, is_available: false });
  assert.ok(db.calls.some(c => c[0] === 'insert' && c[1] === 'availability_exceptions' && c[2].photographer_id === user));
});
test('delete scopes record ID and photographer ID; missing record returns 404', async () => {
  const db = dbMock();
  const result = await deleteCalendarRecord(db, user, 'rule', id);
  assert.equal(result.availability_rule_id, id);
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'availability_rules' && c[2] === 'photographer_id' && c[3] === user));
  await assert.rejects(() => deleteCalendarRecord(dbMock({ deleted: false }), user, 'rule', id), e => e.status === 404);
  await assert.rejects(() => deleteCalendarRecord(db, user, 'exception', 'invalid'), e => e.status === 400);
});
