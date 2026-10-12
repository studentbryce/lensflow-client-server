import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listPhotographerReviews, moderatePhotographerReview, validateModerationInput,
} from '../src/services/photographerReviewsService.js';

const USER = 'photographer-user';
const PID = 'photographer-id';
const CID = 'client-id';
const BID = 'booking-id';
const RID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const profile = { user_id: USER, role: 'photographer' };
const photographer = { photographer_id: PID, user_id: USER, business_name: 'Photo' };
const review = { review_id: RID, photographer_id: PID, client_id: CID, booking_id: BID, rating: 5, status: 'pending', comment: 'Good' };
const client = { client_id: CID, user_id: 'client-user', profiles: { first_name: 'A', last_name: 'B' } };
const booking = { booking_id: BID, booking_date: '2026-10-01', services: { name: 'Portrait' } };
function mockDb(overrides = {}) {
  const calls = [];
  const responses = {
    profiles: { data: profile, error: null },
    photographer_profiles: { data: photographer, error: null },
    reviews: { data: [review], error: null },
    clients: { data: [client], error: null },
    bookings: { data: [booking], error: null },
    rpc: { data: { ...review, status: 'approved' }, error: null },
    ...overrides,
  };
  const indices = {};
  function response(table) {
    const value = responses[table];
    if (typeof value === 'function') return value();
    if (Array.isArray(value)) {
      const i = indices[table] || 0;
      indices[table] = i + 1;
      return value[Math.min(i, value.length - 1)];
    }
    return value;
  }
  return {
    calls,
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(response('rpc')); },
    from(table) {
      calls.push(['from', table]);
      const q = {
        select(fields) { calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        in(field, values) { calls.push(['in', table, field, values]); return this; },
        order(field, options) { calls.push(['order', table, field, options]); return this; },
        range(from, to) { calls.push(['range', table, from, to]); return Promise.resolve(response(table)); },
        maybeSingle() { return Promise.resolve(response(table)); },
        then(resolve, reject) { return Promise.resolve(response(table)).then(resolve, reject); },
      };
      return q;
    },
  };
}
const called = (db, op, table, field, value) => db.calls.some(c => c[0] === op && c[1] === table && c[2] === field && (value === undefined || c[3] === value));
const reviewRow = { data: review, error: null };
const approved = { data: { ...review, status: 'approved', updated_at: '2026-10-12T00:00:00Z' }, error: null };

test('list returns reviews enriched with client and booking information', async () => {
  const db = mockDb();
  const result = await listPhotographerReviews(db, USER);
  assert.equal(result.photographerId, PID);
  assert.deepEqual(result.reviews[0].client, client);
  assert.deepEqual(result.reviews[0].booking, booking);
});
test('list uses authenticated user ID to resolve photographer', async () => {
  const db = mockDb(); await listPhotographerReviews(db, USER);
  assert.ok(called(db, 'eq', 'profiles', 'user_id', USER));
  assert.ok(called(db, 'eq', 'photographer_profiles', 'user_id', USER));
});
test('list scopes reviews, clients and bookings to photographer', async () => {
  const db = mockDb(); await listPhotographerReviews(db, USER);
  for (const table of ['reviews', 'clients', 'bookings']) assert.ok(called(db, 'eq', table, 'photographer_id', PID));
});
test('list requests only related client and booking IDs', async () => {
  const db = mockDb(); await listPhotographerReviews(db, USER);
  assert.ok(called(db, 'in', 'clients', 'client_id'));
  assert.ok(called(db, 'in', 'bookings', 'booking_id'));
});
test('list returns empty reviews without querying clients or bookings', async () => {
  const db = mockDb({ reviews: { data: [], error: null } });
  const result = await listPhotographerReviews(db, USER);
  assert.deepEqual(result.reviews, []);
  assert.ok(!db.calls.some(c => c[0] === 'from' && ['clients', 'bookings'].includes(c[1])));
});
test('list tolerates missing related records', async () => {
  const db = mockDb({ clients: { data: [], error: null }, bookings: { data: [], error: null } });
  const result = await listPhotographerReviews(db, USER);
  assert.equal(result.reviews[0].client, null);
  assert.equal(result.reviews[0].booking, null);
});
test('list paginates review results beyond 250', async () => {
  const db = mockDb({ reviews: [
    { data: Array.from({ length: 250 }, () => review), error: null },
    { data: [review], error: null },
  ] });
  const result = await listPhotographerReviews(db, USER);
  assert.equal(result.reviews.length, 251);
  assert.deepEqual(db.calls.filter(c => c[0] === 'range' && c[1] === 'reviews').map(c => c.slice(2)), [[0,249],[250,499]]);
});
test('list chunks large related ID sets', async () => {
  const rows = Array.from({ length: 105 }, (_, i) => ({ ...review, client_id: `client-${i}`, booking_id: `booking-${i}` }));
  const db = mockDb({ reviews: { data: rows, error: null } });
  await listPhotographerReviews(db, USER);
  assert.equal(db.calls.filter(c => c[0] === 'in' && c[1] === 'clients').length, 2);
  assert.equal(db.calls.filter(c => c[0] === 'in' && c[1] === 'bookings').length, 2);
});
test('list rejects non-photographer role', async () => {
  const db = mockDb({ profiles: { data: { role: 'client' }, error: null } });
  await assert.rejects(() => listPhotographerReviews(db, USER), e => e.status === 403);
  assert.ok(!db.calls.some(c => c[0] === 'from' && c[1] === 'reviews'));
});
test('list rejects missing user', async () => {
  const db = mockDb(); await assert.rejects(() => listPhotographerReviews(db, ''), e => e.status === 401);
  assert.equal(db.calls.length, 0);
});
test('list propagates database read errors', async () => {
  const db = mockDb({ reviews: { data: null, error: { code: 'PGRST_ERROR' } } });
  await assert.rejects(() => listPhotographerReviews(db, USER), /Unable to load reviews/);
});
test('valid moderation input accepts approved and rejected', () => {
  for (const status of ['approved', 'rejected']) assert.equal(validateModerationInput(RID, { status }), status);
});
test('invalid IDs are rejected before database access', async () => {
  const db = mockDb();
  await assert.rejects(() => moderatePhotographerReview(db, USER, 'bad', { status: 'approved' }), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
test('moderation rejects pending, malformed and missing statuses', async () => {
  for (const body of [{ status: 'pending' }, { status: 'deleted' }, {}, null, { status: 'approved', rating: 1 }, ['approved']]) {
    const db = mockDb();
    await assert.rejects(() => moderatePhotographerReview(db, USER, RID, body), e => e.status === 400);
    assert.equal(db.calls.length, 0);
  }
});
test('moderation validates photographer role before reviewing', async () => {
  const db = mockDb({ profiles: { data: { role: 'client' }, error: null } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), e => e.status === 403);
  assert.ok(!db.calls.some(c => c[0] === 'rpc'));
});
test('moderation checks ownership before invoking RPC', async () => {
  const db = mockDb({ reviews: { data: null, error: null } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), e => e.status === 404);
  assert.ok(called(db, 'eq', 'reviews', 'photographer_id', PID));
  assert.ok(!db.calls.some(c => c[0] === 'rpc'));
});
test('moderation refuses redundant status', async () => {
  const db = mockDb({ reviews: { data: { ...review, status: 'approved' }, error: null } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), e => e.status === 409);
  assert.ok(!db.calls.some(c => c[0] === 'rpc'));
});
test('moderation invokes only trusted RPC arguments', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: approved });
  await moderatePhotographerReview(db, USER, RID, { status: 'approved' });
  assert.deepEqual(db.calls.find(c => c[0] === 'rpc'), ['rpc', 'moderate_review', { p_review_id: RID, p_status: 'approved' }]);
});
test('moderation returns verified safe fields', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: { data: { ...approved.data, secret: 'not-returned' }, error: null } });
  const result = await moderatePhotographerReview(db, USER, RID, { status: 'approved' });
  assert.deepEqual(Object.keys(result).sort(), ['photographer_id','review_id','status','updated_at']);
});
test('moderation supports array RPC responses', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: { data: [approved.data], error: null } });
  assert.equal((await moderatePhotographerReview(db, USER, RID, { status: 'approved' })).status, 'approved');
});
test('moderation supports unpublishing approved reviews', async () => {
  const db = mockDb({ reviews: { data: { ...review, status: 'approved' }, error: null }, rpc: { data: { ...review, status: 'rejected' }, error: null } });
  assert.equal((await moderatePhotographerReview(db, USER, RID, { status: 'rejected' })).status, 'rejected');
});
test('moderation maps RPC access denial to 404', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: { data: null, error: { message: 'Review not found or access denied' } } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), e => e.status === 404);
});
test('moderation propagates unrelated RPC errors', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: { data: null, error: { message: 'DB unavailable' } } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), /Unable to moderate review/);
});
test('moderation rejects mismatched RPC ownership response', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: { data: { ...approved.data, photographer_id: 'other-owner' }, error: null } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), /Unable to verify/);
});
test('moderation rejects mismatched RPC status response', async () => {
  const db = mockDb({ reviews: reviewRow, rpc: { data: { ...approved.data, status: 'pending' }, error: null } });
  await assert.rejects(() => moderatePhotographerReview(db, USER, RID, { status: 'approved' }), /Unable to verify/);
});
