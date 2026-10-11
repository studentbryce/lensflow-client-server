import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteHandler } from '../src/controllers/photographerWebsiteHandler.js';
import { BookingRequestError } from '../src/services/bookingCreateService.js';

const db = { test: true };
const req = { accessToken: 'token', user: { id: 'photographer-user' }, params: { id: 'portfolio-item' }, body: { slug: 'test-studio' } };
function response() {
  return {
    code: null, headers: {}, payload: null,
    status(code) { this.code = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}
const factory = token => { assert.equal(token, 'token'); return db; };
async function check(mode, expected, status = 200) {
  const res = response();
  let args;
  const handler = createWebsiteHandler(async (...received) => { args = received; return { ok: true }; }, factory, { mode, status });
  await handler(req, res, error => { throw error; });
  assert.deepEqual(args, expected);
  assert.equal(res.code, status);
  assert.deepEqual(res.payload, { success: true, data: { ok: true } });
  assert.equal(res.headers['Cache-Control'], 'no-store');
}
test('GET website passes only db and authenticated user', () => check('read', [db, 'photographer-user']));
test('PUT website passes body as third argument, not route id', () => check('body', [db, 'photographer-user', req.body]));
test('POST portfolio passes body as third argument and returns 201', () => check('body', [db, 'photographer-user', req.body], 201));
test('PUT portfolio order passes body as third argument', () => check('body', [db, 'photographer-user', req.body]));
test('DELETE portfolio passes item id as third argument', () => check('item', [db, 'photographer-user', 'portfolio-item']));
test('PATCH portfolio passes item id and body', () => check('itemBody', [db, 'photographer-user', 'portfolio-item', req.body]));
test('invalid handler modes are rejected', () => assert.throws(() => createWebsiteHandler(() => {}, factory, { mode: 'oops' }), TypeError));
test('validation errors preserve structured status and message', async () => {
  const res = response();
  const handler = createWebsiteHandler(() => { throw new BookingRequestError(400, 'INVALID_FIELDS', 'Invalid settings'); }, factory, { mode: 'body' });
  await handler(req, res, error => { throw error; });
  assert.equal(res.code, 400);
  assert.equal(res.payload.error.code, 'INVALID_FIELDS');
});
test('unique constraint conflicts become HTTP 409', async () => {
  const res = response();
  const handler = createWebsiteHandler(() => { const e = new Error('database error'); e.cause = { code: '23505' }; throw e; }, factory, { mode: 'body' });
  await handler(req, res, error => { throw error; });
  assert.equal(res.code, 409);
  assert.equal(res.payload.error.code, 'CONFLICT');
});
