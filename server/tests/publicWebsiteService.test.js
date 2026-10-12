import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicWebsite, listPublicPhotographers, validateSlug, PublicWebsiteError } from '../src/services/publicWebsiteService.js';

const PID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function mockDb(overrides = {}) {
  const calls = [];
  const results = {
    photographer_profiles: { data: { photographer_id: PID, business_name: 'Studio' }, error: null },
    website_settings: { data: { hero_title: 'Hello' }, error: null },
    website_content: { data: [{ title: 'About' }], error: null },
    portfolio_items: { data: [{ title: 'Portfolio' }], error: null },
    services: { data: [{ name: 'Portraits' }], error: null },
    get_featured_reviews: { data: [{ rating: 5 }], error: null },
    get_public_reviews: { data: [{ rating: 4 }], error: null },
    ...overrides,
  };
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      const chain = {
        select(fields) { calls.push(['select', table, fields]); return this; },
        eq(field, value) { calls.push(['eq', table, field, value]); return this; },
        order(field, options) { calls.push(['order', table, field, options]); return this; },
        limit(n) { calls.push(['limit', table, n]); return this; },
        maybeSingle() { return Promise.resolve(results[table]); },
        then(ok, bad) { return Promise.resolve(results[table]).then(ok, bad); },
      };
      return chain;
    },
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(results[name]); },
  };
}
function has(db, op, table, field, value) {
  return db.calls.some(c => c[0] === op && c[1] === table && (field === undefined || c[2] === field && (value === undefined || c[3] === value)));
}
test('validates public slug and rejects injection characters', () => {
  assert.equal(validateSlug('studio-1'), 'studio-1');
  for (const slug of ['../foo', 'Studio', '', 'a'.repeat(101), '-x', 'x-', 'foo bar', '%']) {
    assert.throws(() => validateSlug(slug), e => e instanceof PublicWebsiteError && e.status === 400);
  }
});
test('public photographer list filters published profiles and limits results', async () => {
  const db = mockDb({ photographer_profiles: { data: [{ photographer_id: PID, business_name: 'Studio' }], error: null } });
  const result = await listPublicPhotographers(db);
  assert.equal(result.length, 1);
  assert.ok(has(db, 'eq', 'photographer_profiles', 'published', true));
  assert.ok(has(db, 'limit', 'photographer_profiles', 500));
});
test('public list returns [] when no published photographers', async () => {
  assert.deepEqual(await listPublicPhotographers(mockDb({ photographer_profiles: { data: null, error: null } })), []);
});
test('public list propagates DB errors without exposing internal details', async () => {
  await assert.rejects(listPublicPhotographers(mockDb({ photographer_profiles: { data: null, error: { message: 'secret' } } })), /Unable to load photographers/);
});
test('public site returns same frontend shape', async () => {
  const site = await loadPublicWebsite(mockDb(), 'studio-1');
  assert.equal(site.profile.photographer_id, PID);
  assert.equal(site.settings.hero_title, 'Hello');
  assert.equal(site.about[0].title, 'About');
  assert.equal(site.portfolio[0].title, 'Portfolio');
  assert.equal(site.reviews[0].rating, 5);
  assert.equal(site.allReviews[0].rating, 4);
  assert.equal(site.services[0].name, 'Portraits');
});
test('public site scopes all content to resolved published photographer', async () => {
  const db = mockDb(); await loadPublicWebsite(db, 'studio-1');
  assert.ok(has(db, 'eq', 'photographer_profiles', 'slug', 'studio-1'));
  assert.ok(has(db, 'eq', 'photographer_profiles', 'published', true));
  for (const table of ['website_settings', 'website_content', 'portfolio_items', 'services']) {
    assert.ok(has(db, 'eq', table, 'photographer_id', PID));
  }
});
test('public site filters published content, portfolio and active services', async () => {
  const db = mockDb(); await loadPublicWebsite(db, 'studio-1');
  assert.ok(has(db, 'eq', 'website_content', 'published', true));
  assert.ok(has(db, 'eq', 'website_content', 'section', 'about'));
  assert.ok(has(db, 'eq', 'portfolio_items', 'published', true));
  assert.ok(has(db, 'eq', 'services', 'is_active', true));
});
test('public site calls existing featured and public review RPCs with resolved ID', async () => {
  const db = mockDb(); await loadPublicWebsite(db, 'studio-1');
  for (const name of ['get_featured_reviews', 'get_public_reviews']) {
    assert.ok(db.calls.some(c => c[0] === 'rpc' && c[1] === name && c[2].p_photographer_id === PID));
  }
});
test('unpublished/unknown site returns 404 without querying other tables', async () => {
  const db = mockDb({ photographer_profiles: { data: null, error: null } });
  await assert.rejects(loadPublicWebsite(db, 'missing'), e => e.status === 404);
  assert.deepEqual(db.calls.filter(c => c[0] === 'from').map(c => c[1]), ['photographer_profiles']);
});
test('site tolerates missing settings and empty content', async () => {
  const db = mockDb({ website_settings: { data: null, error: null }, website_content: { data: null, error: null },
    portfolio_items: { data: null, error: null }, services: { data: null, error: null },
    get_featured_reviews: { data: null, error: null }, get_public_reviews: { data: null, error: null } });
  const site = await loadPublicWebsite(db, 'studio');
  assert.deepEqual(site.settings, {});
  for (const field of ['about', 'portfolio', 'reviews', 'allReviews', 'services']) assert.deepEqual(site[field], []);
});
test('site propagates review RPC failures', async () => {
  await assert.rejects(loadPublicWebsite(mockDb({ get_public_reviews: { data: null, error: { message: 'RPC error' } } }), 'studio'), /Unable to load reviews/);
});
test('site propagates content query failures', async () => {
  await assert.rejects(loadPublicWebsite(mockDb({ website_content: { data: null, error: { message: 'DB error' } } }), 'studio'), /Unable to load about content/);
});
test('invalid slug makes no DB calls', async () => {
  const db = mockDb(); await assert.rejects(loadPublicWebsite(db, 'BAD SLUG'), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
