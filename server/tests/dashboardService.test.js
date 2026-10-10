import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhotographerDashboard, getOutstandingInvoices, validateDashboardDate } from '../src/services/dashboardService.js';

const owner = '87d273f2-f01e-4561-8457-bbff89317124';
const photographer = 'b60e2b38-6db0-4c5d-8dc4-cf2051d1cc64';
function dbMock({ role = 'photographer', bookings = [], clients = [], galleries = [], invoices = [], errors = {} } = {}) {
  const calls = [];
  const db = {
    calls,
    from(table) {
      const filters = [];
      let head = false, count = null, limit = null, range = null;
      const q = {
        select(columns, options = {}) { calls.push({ table, op: 'select', columns, options }); head = !!options.head; count = options.count; return this; },
        eq(key, value) { filters.push(['eq', key, value]); calls.push({ table, op: 'eq', key, value }); return this; },
        gte(key, value) { filters.push(['gte', key, value]); calls.push({ table, op: 'gte', key, value }); return this; },
        in(key, value) { filters.push(['in', key, value]); calls.push({ table, op: 'in', key, value }); return this; },
        order(key, options) { calls.push({ table, op: 'order', key, options }); return this; },
        limit(n) { limit = n; return this; },
        range(a, b) { range = [a, b]; calls.push({ table, op: 'range', a, b }); return this; },
        maybeSingle() {
          if (table === 'profiles') return Promise.resolve({ data: { role }, error: errors[table] ?? null });
          if (table === 'photographer_profiles') return Promise.resolve({ data: { photographer_id: photographer, business_name: 'Test Studio' }, error: errors[table] ?? null });
          throw new Error('Unexpected maybeSingle');
        },
        then(resolve, reject) {
          const source = { bookings, clients, galleries, invoices }[table] || [];
          let rows = source.filter(item => filters.every(([type, key, value]) => {
            if (type === 'eq') return item[key] === value;
            if (type === 'gte') return item[key] >= value;
            if (type === 'in') return value.includes(item[key]);
            return true;
          }));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (limit != null) rows = rows.slice(0, limit);
          const result = { data: head ? null : rows, count: count === 'exact' ? rows.length : null, error: errors[table] ?? null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return db;
}

test('dashboard accepts real ISO dates only', () => {
  assert.equal(validateDashboardDate('2026-10-11'), '2026-10-11');
  for (const date of ['2026-02-30', '2026-13-01', '11/10/2026', '', undefined, '2026-10-11&other=1']) {
    assert.throws(() => validateDashboardDate(date), e => e.status === 400 && e.code === 'INVALID_DATE');
  }
});

test('client cannot access photographer dashboard or its data queries', async () => {
  const db = dbMock({ role: 'client' });
  await assert.rejects(() => getPhotographerDashboard(db, owner, '2026-10-11'), e => e.status === 403);
  assert.equal(db.calls.some(c => ['bookings', 'invoices', 'galleries', 'clients'].includes(c.table)), false);
});

test('dashboard returns empty lists and zero counts for empty studio', async () => {
  const db = dbMock();
  const result = await getPhotographerDashboard(db, owner, '2026-10-11');
  assert.equal(result.profile.business_name, 'Test Studio');
  assert.deepEqual(result.stats, { bookings: 0, clients: 0, outstanding: 0, galleries: 0 });
  assert.deepEqual(result.upcoming_bookings, []);
  assert.deepEqual(result.recent_galleries, []);
  assert.deepEqual(result.outstanding_invoices, []);
});

test('dashboard keeps existing booking status, date, limit and owner filters', async () => {
  const db = dbMock({ bookings: Array.from({ length: 7 }, (_, i) => ({ booking_id: `b${i}`, photographer_id: photographer, booking_date: '2026-10-12', status: 'confirmed' })) });
  const result = await getPhotographerDashboard(db, owner, '2026-10-11');
  assert.equal(result.stats.bookings, 5);
  assert.equal(result.upcoming_bookings.length, 5);
  assert.ok(db.calls.some(c => c.table === 'bookings' && c.op === 'gte' && c.key === 'booking_date' && c.value === '2026-10-11'));
  assert.ok(db.calls.some(c => c.table === 'bookings' && c.op === 'in' && c.key === 'status' && c.value.join(',') === 'pending,confirmed'));
  assert.ok(db.calls.some(c => c.table === 'bookings' && c.op === 'eq' && c.key === 'photographer_id' && c.value === photographer));
});

test('all dashboard business queries are scoped to resolved photographer', async () => {
  const db = dbMock();
  await getPhotographerDashboard(db, owner, '2026-10-11');
  for (const table of ['bookings', 'clients', 'invoices', 'galleries']) {
    assert.ok(db.calls.some(c => c.table === table && c.op === 'eq' && c.key === 'photographer_id' && c.value === photographer), `${table} owner scope`);
  }
});

test('client and published-gallery counts are separate from list data', async () => {
  const db = dbMock({
    clients: [{ photographer_id: photographer }, { photographer_id: photographer }],
    galleries: [
      { photographer_id: photographer, gallery_id: 'a', is_published: true },
      { photographer_id: photographer, gallery_id: 'b', is_published: false },
    ],
  });
  const result = await getPhotographerDashboard(db, owner, '2026-10-11');
  assert.equal(result.stats.clients, 2);
  assert.equal(result.stats.galleries, 1);
  assert.equal(result.recent_galleries.length, 2);
});

test('outstanding excludes paid/cancelled invoices and orders earliest due first', async () => {
  const db = dbMock({ invoices: [
    { photographer_id: photographer, invoice_id: 'a', status: 'draft', due_date: '2026-11-10', total_amount: 10 },
    { photographer_id: photographer, invoice_id: 'b', status: 'sent', due_date: '2026-10-14', total_amount: 20 },
    { photographer_id: photographer, invoice_id: 'c', status: 'overdue', due_date: null, total_amount: 30 },
    { photographer_id: photographer, invoice_id: 'd', status: 'paid', due_date: '2026-10-10', total_amount: 999 },
  ] });
  const result = await getOutstandingInvoices(db, photographer);
  assert.equal(result.outstanding, 60);
  assert.deepEqual(result.invoices.map(i => i.invoice_id), ['b', 'a', 'c']);
});

test('outstanding invoice sum is not truncated after first 500 rows', async () => {
  const invoices = Array.from({ length: 505 }, (_, i) => ({ photographer_id: photographer, invoice_id: String(i), status: 'sent', due_date: '2026-11-10', total_amount: 2 }));
  const db = dbMock({ invoices });
  const result = await getOutstandingInvoices(db, photographer);
  assert.equal(result.outstanding, 1010);
  assert.equal(result.invoices.length, 3);
  assert.equal(db.calls.filter(c => c.table === 'invoices' && c.op === 'range').length, 2);
});

test('a database error fails the dashboard instead of returning misleading zeros', async () => {
  const db = dbMock({ errors: { invoices: { code: 'DB_ERROR' } } });
  await assert.rejects(() => getPhotographerDashboard(db, owner, '2026-10-11'), /Unable to load outstanding invoices/);
});

test('date validation runs before any database access', async () => {
  const db = dbMock();
  await assert.rejects(() => getPhotographerDashboard(db, owner, '2026-02-31'), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
