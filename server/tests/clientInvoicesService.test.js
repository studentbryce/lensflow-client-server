import test from 'node:test';
import assert from 'node:assert/strict';
import { listClientInvoices, getClientInvoice, validateClientInvoiceId, ClientInvoiceError } from '../src/services/clientInvoicesService.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ownClient = { client_id: 'client-own', photographer_id: 'photographer-own' };
const sampleInvoice = { invoice_id: ID, invoice_number: 'INV-1', status: 'sent', total_amount: 125 };

function mockDb(overrides = {}) {
  const calls = [];
  const values = {
    clients: [{ data: { client_id: ownClient.client_id }, error: null }, { data: ownClient, error: null }],
    profiles: { data: { first_name: 'Aroha', last_name: 'Lee', email: 'test@example.invalid' }, error: null },
    photographer_profiles: { data: { photographer_id: ownClient.photographer_id, business_name: 'Photos' }, error: null },
    invoices: { data: [sampleInvoice], error: null },
    invoice_items: { data: [{ invoice_item_id: 'item1', description: 'Photos' }], error: null },
    ...overrides,
  };
  const counters = {};
  function response(table) {
    const n = counters[table] || 0;
    counters[table] = n + 1;
    const entry = values[table];
    return Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
  }
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      const q = {
        select(fields) { calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        neq(field, value) { calls.push(['neq', table, field, value]); return this; },
        order(field, options) { calls.push(['order', table, field, options]); return this; },
        range(start, end) { calls.push(['range', table, start, end]); return this; },
        maybeSingle() { return Promise.resolve(response(table)); },
        then(resolve, reject) { return Promise.resolve(response(table)).then(resolve, reject); },
      };
      return q;
    },
  };
}

const has = (db, method, table, field, value) => db.calls.some(c => c[0] === method && c[1] === table && c[2] === field && (value === undefined || c[3] === value));

test('invoice list derives client identity from verified user ID', async () => {
  const db = mockDb();
  const result = await listClientInvoices(db, 'auth-own');
  assert.equal(result.invoices.length, 1);
  assert.equal(result.clientProfile.first_name, 'Aroha');
  assert.equal(result.photographerProfile.business_name, 'Photos');
  assert.ok(has(db, 'eq', 'clients', 'user_id', 'auth-own'));
  assert.ok(has(db, 'eq', 'invoices', 'client_id', ownClient.client_id));
});

test('invoice list excludes draft invoices at database level', async () => {
  const db = mockDb();
  await listClientInvoices(db, 'auth-own');
  assert.ok(has(db, 'neq', 'invoices', 'status', 'draft'));
});

test('invoice list sorts newest issue date and creation first', async () => {
  const db = mockDb();
  await listClientInvoices(db, 'auth-own');
  assert.ok(db.calls.some(c => c[0] === 'order' && c[1] === 'invoices' && c[2] === 'issue_date' && c[3]?.ascending === false));
  assert.ok(db.calls.some(c => c[0] === 'order' && c[1] === 'invoices' && c[2] === 'created_at' && c[3]?.ascending === false));
});

test('invoice list uses paged reads instead of a silent 1000-row cap', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ invoice_id: String(i) }));
  const db = mockDb({ invoices: [{ data: rows, error: null }, { data: [sampleInvoice], error: null }] });
  const result = await listClientInvoices(db, 'auth-own');
  assert.equal(result.invoices.length, 251);
  assert.deepEqual(db.calls.filter(c => c[0] === 'range').map(c => c.slice(2)), [[0, 249], [250, 499]]);
});

test('invoice list supports empty accounts', async () => {
  const db = mockDb({ invoices: { data: [], error: null } });
  assert.deepEqual((await listClientInvoices(db, 'auth-own')).invoices, []);
});

test('photographer without client record receives 403 before invoice queries', async () => {
  const db = mockDb({ clients: { data: null, error: null } });
  await assert.rejects(() => listClientInvoices(db, 'photographer'), e => e.status === 403);
  assert.ok(!db.calls.some(c => c[1] === 'invoices'));
});

test('missing auth identity receives 401 before any database read', async () => {
  const db = mockDb();
  await assert.rejects(() => listClientInvoices(db, null), e => e.status === 401);
  assert.equal(db.calls.length, 0);
});

test('missing client profile produces 404', async () => {
  const db = mockDb({ profiles: { data: null, error: null } });
  await assert.rejects(() => listClientInvoices(db, 'auth-own'), e => e.status === 404 && e.code === 'PROFILE_NOT_FOUND');
});

test('database errors do not expose internal error messages', async () => {
  const db = mockDb({ invoices: { data: null, error: { message: 'private SQL details' } } });
  await assert.rejects(() => listClientInvoices(db, 'auth-own'), e => e.message === 'Unable to load invoices.' && !e.message.includes('private SQL'));
});

test('invoice detail validates UUID before querying', async () => {
  const db = mockDb();
  for (const id of ['abc', '1;drop table invoices', '', null, OTHER.slice(0, -1)]) {
    await assert.rejects(() => getClientInvoice(db, 'auth-own', id), e => e instanceof ClientInvoiceError && e.status === 400);
  }
  assert.equal(db.calls.length, 0);
});

test('invoice detail reads only an owned non-draft invoice', async () => {
  const db = mockDb({ invoices: { data: sampleInvoice, error: null } });
  const result = await getClientInvoice(db, 'auth-own', ID);
  assert.equal(result.invoice.invoice_id, ID);
  assert.equal(result.invoice.invoice_items.length, 1);
  assert.ok(has(db, 'eq', 'invoices', 'invoice_id', ID));
  assert.ok(has(db, 'eq', 'invoices', 'client_id', ownClient.client_id));
  assert.ok(has(db, 'neq', 'invoices', 'status', 'draft'));
  assert.ok(has(db, 'eq', 'invoice_items', 'invoice_id', ID));
});

test('invoice detail returns 404 for missing, draft or another client invoice', async () => {
  const db = mockDb({ invoices: { data: null, error: null } });
  await assert.rejects(() => getClientInvoice(db, 'auth-own', ID), e => e.status === 404 && e.code === 'INVOICE_NOT_FOUND');
  assert.ok(!db.calls.some(c => c[1] === 'invoice_items'));
});

test('invoice detail denies photographer role without querying invoices', async () => {
  const db = mockDb({ clients: { data: null, error: null } });
  await assert.rejects(() => getClientInvoice(db, 'photographer', ID), e => e.status === 403);
  assert.ok(!db.calls.some(c => c[1] === 'invoices'));
});

test('invoice detail returns empty items for a valid invoice with no items', async () => {
  const db = mockDb({ invoices: { data: sampleInvoice, error: null }, invoice_items: { data: [], error: null } });
  const result = await getClientInvoice(db, 'auth-own', ID);
  assert.deepEqual(result.invoice.invoice_items, []);
});

test('invoice detail handles invoice item RLS or database errors safely', async () => {
  const db = mockDb({ invoices: { data: sampleInvoice, error: null }, invoice_items: { data: null, error: { message: 'secret error' } } });
  await assert.rejects(() => getClientInvoice(db, 'auth-own', ID), e => e.message === 'Unable to load invoice items.');
});

test('invoice ID validation accepts canonical UUIDs', () => {
  assert.equal(validateClientInvoiceId(ID), ID);
});
