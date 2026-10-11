import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientReviewError, validateReviewInput, listClientReviews,
  createClientReview, updateClientReview,
} from '../src/services/clientReviewsService.js';

const USER = 'authenticated-user';
const CID = 'client-owned';
const PID = 'photographer-owned';
const BID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const RID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const booking = { booking_id: BID, photographer_id: PID, client_id: CID, status: 'completed' };
const review = { review_id: RID, client_id: CID, booking_id: BID, photographer_id: PID, status: 'pending', rating: 5, comment: 'Nice' };
function mockDb(overrides = {}) {
  const calls = [];
  const responses = {
    clients: { data: { client_id: CID }, error: null },
    bookings: { data: booking, error: null },
    reviews: { data: review, error: null },
    rpc: { data: review, error: null },
    ...overrides,
  };
  const counts = {};
  const respond = table => {
    const r = responses[table]; const n = counts[table] || 0; counts[table] = n + 1;
    return Array.isArray(r) ? r[Math.min(n, r.length - 1)] : r;
  };
  return {
    calls,
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(respond('rpc')); },
    from(table) {
      calls.push(['from', table]);
      const query = {
        select(value) { calls.push(['select', table, value]); return this; },
        eq(key, value) { calls.push(['eq', table, key, value]); return this; },
        order(key, options) { calls.push(['order', table, key, options]); return this; },
        range(start, end) { calls.push(['range', table, start, end]); return this; },
        insert(data) { calls.push(['insert', table, data]); return this; },
        maybeSingle() { return Promise.resolve(respond(table)); },
        single() { return Promise.resolve(respond(table)); },
        then(resolve, reject) { return Promise.resolve(respond(table)).then(resolve, reject); },
      };
      return query;
    },
  };
}
const called = (db, kind, table, key, value) => db.calls.some(c => c[0] === kind && c[1] === table && c[2] === key && (value === undefined || c[3] === value));
const valid = { rating: 5, comment: ' Great session ' };

test('input trims comments and preserves rating', () => assert.deepEqual(validateReviewInput(valid), { rating: 5, comment: 'Great session' }));
test('empty comment becomes null', () => assert.deepEqual(validateReviewInput({ rating: 1, comment: '   ' }), { rating: 1, comment: null }));
test('rating must be integer 1 to 5', () => {
  for (const rating of [0, 6, 1.5, '5', null, true, NaN]) {
    assert.throws(() => validateReviewInput({ rating }), e => e.status === 400 && e.code === 'INVALID_RATING');
  }
});
test('comment rejects non-string and length over 2000', () => {
  for (const comment of [123, {}, 'x'.repeat(2001)]) {
    assert.throws(() => validateReviewInput({ rating: 4, comment }), e => e.status === 400 && e.code === 'INVALID_COMMENT');
  }
});
test('2000-character comment accepted', () => assert.equal(validateReviewInput({ rating: 5, comment: 'x'.repeat(2000) }).comment.length, 2000));
test('list queries bookings and reviews scoped to JWT client', async () => {
  const db = mockDb({ bookings: { data: [booking], error: null }, reviews: { data: [review], error: null } });
  const result = await listClientReviews(db, USER);
  assert.equal(result.clientId, CID); assert.equal(result.bookings.length, 1); assert.equal(result.reviews.length, 1);
  assert.ok(called(db, 'eq', 'clients', 'user_id', USER));
  assert.ok(called(db, 'eq', 'bookings', 'client_id', CID));
  assert.ok(called(db, 'eq', 'reviews', 'client_id', CID));
});
test('list returns empty arrays when there are no rows', async () => {
  const db = mockDb({ bookings: { data: [], error: null }, reviews: { data: [], error: null } });
  assert.deepEqual((await listClientReviews(db, USER)).reviews, []);
});
test('list paginates beyond 250 reviews', async () => {
  const db = mockDb({ bookings: { data: [], error: null }, reviews: [
    { data: Array.from({ length: 250 }, () => review), error: null },
    { data: [review], error: null },
  ] });
  assert.equal((await listClientReviews(db, USER)).reviews.length, 251);
  assert.deepEqual(db.calls.filter(c => c[0] === 'range' && c[1] === 'reviews').map(c => c.slice(2)), [[0,249],[250,499]]);
});
test('missing client prevents review reads', async () => {
  const db = mockDb({ clients: { data: null, error: null } });
  await assert.rejects(() => listClientReviews(db, USER), e => e.status === 403);
  assert.ok(!db.calls.some(c => c[1] === 'reviews'));
});
test('missing JWT user ID returns 401', async () => {
  const db = mockDb(); await assert.rejects(() => listClientReviews(db, ''), e => e.status === 401);
  assert.equal(db.calls.length, 0);
});
test('create derives all ownership fields from database and ignores forged input', async () => {
  const db = mockDb();
  await createClientReview(db, USER, { bookingId: BID, ...valid, client_id: 'forged', photographer_id: 'forged', status: 'approved' });
  assert.ok(called(db, 'eq', 'bookings', 'client_id', CID));
  assert.deepEqual(db.calls.find(c => c[0] === 'insert')[2], {
    photographer_id: PID, client_id: CID, booking_id: BID, rating: 5, comment: 'Great session',
  });
});
test('invalid booking ID rejected before database access', async () => {
  const db = mockDb(); await assert.rejects(() => createClientReview(db, USER, { bookingId: 'wrong', rating: 4 }), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
test('invalid rating rejected before database access', async () => {
  const db = mockDb(); await assert.rejects(() => createClientReview(db, USER, { bookingId: BID, rating: 0 }), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
test('unowned booking is hidden with 404', async () => {
  const db = mockDb({ bookings: { data: null, error: null } });
  await assert.rejects(() => createClientReview(db, USER, { bookingId: BID, rating: 4 }), e => e.status === 404);
  assert.ok(!db.calls.some(c => c[0] === 'insert'));
});
test('non-completed booking rejected with 409', async () => {
  const db = mockDb({ bookings: { data: { ...booking, status: 'confirmed' }, error: null } });
  await assert.rejects(() => createClientReview(db, USER, { bookingId: BID, rating: 4 }), e => e.status === 409);
  assert.ok(!db.calls.some(c => c[0] === 'insert'));
});
test('duplicate booking review returns 409', async () => {
  const db = mockDb({ reviews: { data: null, error: { code: '23505' } } });
  await assert.rejects(() => createClientReview(db, USER, { bookingId: BID, rating: 4 }), e => e.status === 409 && e.code === 'ALREADY_REVIEWED');
});
test('create database errors do not expose SQL details', async () => {
  const db = mockDb({ reviews: { data: null, error: { message: 'secret SQL' } } });
  await assert.rejects(() => createClientReview(db, USER, { bookingId: BID, rating: 4 }), e => e.message === 'Unable to create review.');
});
test('update pending review invokes existing database RPC with server-owned context', async () => {
  const db = mockDb();
  const result = await updateClientReview(db, USER, RID, { rating: 5, comment: ' New text ', status: 'approved' });
  assert.equal(result.review_id, RID);
  assert.ok(called(db, 'eq', 'reviews', 'client_id', CID));
  assert.deepEqual(db.calls.find(c => c[0] === 'rpc'), ['rpc', 'update_pending_review', { p_review_id: RID, p_rating: 5, p_comment: 'New text' }]);
});
test('invalid review ID rejected before DB access', async () => {
  const db = mockDb(); await assert.rejects(() => updateClientReview(db, USER, 'bad', valid), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
test('unowned review returns 404 and does not call RPC', async () => {
  const db = mockDb({ reviews: { data: null, error: null } });
  await assert.rejects(() => updateClientReview(db, USER, RID, valid), e => e.status === 404);
  assert.ok(!db.calls.some(c => c[0] === 'rpc'));
});
test('approved and rejected reviews cannot be edited', async () => {
  for (const status of ['approved', 'rejected']) {
    const db = mockDb({ reviews: { data: { ...review, status }, error: null } });
    await assert.rejects(() => updateClientReview(db, USER, RID, valid), e => e.status === 409);
    assert.ok(!db.calls.some(c => c[0] === 'rpc'));
  }
});
test('RPC concurrent moderation race handled with 409', async () => {
  const db = mockDb({ rpc: { data: null, error: { message: 'Review not found, access denied, or review is no longer pending' } } });
  await assert.rejects(() => updateClientReview(db, USER, RID, valid), e => e.status === 409);
});
test('RPC unexpected errors are sanitized', async () => {
  const db = mockDb({ rpc: { data: null, error: { message: 'private schema detail' } } });
  await assert.rejects(() => updateClientReview(db, USER, RID, valid), e => e.message === 'Unable to update review.');
});
test('RPC result with mismatched owner is rejected', async () => {
  const db = mockDb({ rpc: { data: { ...review, client_id: 'other' }, error: null } });
  await assert.rejects(() => updateClientReview(db, USER, RID, valid), e => e.message === 'Unable to verify updated review.');
});
test('booking database error stops create and hides raw error', async () => {
  const db = mockDb({ bookings: { data: null, error: { message: 'sensitive' } } });
  await assert.rejects(() => createClientReview(db, USER, { bookingId: BID, rating: 5 }), e => e.message === 'Unable to load booking.');
});
