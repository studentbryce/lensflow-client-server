/**
 * LensFlow Milestone 13A — first-time registration RLS tests.
 * Disposable LensFlow-Recovery-Test project ONLY. No service-role key.
 * This is a one-time, stateful test: it creates synthetic profiles and a business,
 * and publishes that business. It does not remove test fixtures.
 *
 * Run from project root:
 * node --env-file=.env.13a.local documents/security/milestone13a/registration_13a_tests.mjs
 */
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const required = [
  'LENSFLOW_13A_URL', 'LENSFLOW_13A_ANON_KEY',
  'LENSFLOW_13A_PHOTOGRAPHER_EMAIL', 'LENSFLOW_13A_PHOTOGRAPHER_PASSWORD',
  'LENSFLOW_13A_CLIENT_EMAIL', 'LENSFLOW_13A_CLIENT_PASSWORD',
  'LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL', 'LENSFLOW_13A_NEW_PHOTOGRAPHER_PASSWORD',
  'LENSFLOW_13A_NEW_CLIENT_EMAIL', 'LENSFLOW_13A_NEW_CLIENT_PASSWORD',
  'LENSFLOW_13A_EXPECTED_TEST_REF', 'LENSFLOW_13A_CONFIRM_TEST_ONLY',
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error(`Missing .env.13a.local settings: ${missing.join(', ')}`);
  process.exit(1);
}
const url = env.LENSFLOW_13A_URL.replace(/\/$/, '');
const urlMatch = /^https:\/\/([a-z0-9-]+)\.supabase\.co$/i.exec(url);
if (!urlMatch || urlMatch[1] !== env.LENSFLOW_13A_EXPECTED_TEST_REF ||
    env.LENSFLOW_13A_CONFIRM_TEST_ONLY !== 'YES_TEST_PROJECT_ONLY') {
  console.error('Safety stop: confirm the recovery TEST project URL/ref and explicit test-only acknowledgement.');
  process.exit(1);
}
const emails = [
  env.LENSFLOW_13A_PHOTOGRAPHER_EMAIL, env.LENSFLOW_13A_CLIENT_EMAIL,
  env.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL, env.LENSFLOW_13A_NEW_CLIENT_EMAIL,
];
if (new Set(emails.map((x) => x.toLowerCase())).size !== 4) {
  console.error('Safety stop: four distinct test emails are required.');
  process.exit(1);
}
const dbFor = () => createClient(url, env.LENSFLOW_13A_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const existingPhotographerDb = dbFor();
const existingClientDb = dbFor();
const newPhotographerDb = dbFor();
const newClientDb = dbFor();
const all = [existingPhotographerDb, existingClientDb, newPhotographerDb, newClientDb];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function login(db, email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user?.id || !data.session?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? 'no authenticated session'}`);
  }
  assert(data.user.email?.toLowerCase() === email.toLowerCase(), 'Signed-in account email mismatch');
  return data.user.id;
}
async function single(query, label) {
  const { data, error } = await query.single();
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
async function empty(query, label) {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${label}: ${error.message}`);
  assert(data === null, `${label}: expected no record; do not run this one-time test twice`);
}
const results = [];
async function check(label, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${label}`);
  } catch (error) {
    results.push(false);
    console.error(`FAIL  ${label}: ${error.message}`);
    // Stop on the first failure; later steps rely on earlier test fixtures.
    throw error;
  }
}
async function blockedInsert(query, label) {
  const { data, error } = await query.select('*');
  assert(error, `${label}: insert unexpectedly succeeded (${data?.length ?? 0} rows)`);
  assert(error.code === '42501', `${label}: expected RLS denial (42501), got ${error.code}: ${error.message}`);
}

try {
  const [oldPhotographerId, oldClientId, photographerId, clientId] = await Promise.all([
    login(existingPhotographerDb, env.LENSFLOW_13A_PHOTOGRAPHER_EMAIL, env.LENSFLOW_13A_PHOTOGRAPHER_PASSWORD),
    login(existingClientDb, env.LENSFLOW_13A_CLIENT_EMAIL, env.LENSFLOW_13A_CLIENT_PASSWORD),
    login(newPhotographerDb, env.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL, env.LENSFLOW_13A_NEW_PHOTOGRAPHER_PASSWORD),
    login(newClientDb, env.LENSFLOW_13A_NEW_CLIENT_EMAIL, env.LENSFLOW_13A_NEW_CLIENT_PASSWORD),
  ]);
  assert(new Set([oldPhotographerId, oldClientId, photographerId, clientId]).size === 4,
    'Expected four different authenticated users');

  // A second independent safety check: production must not contain the
  // previous milestone's deliberately named test-only photographer fixture.
  const existingBusiness = await single(
    existingPhotographerDb.from('photographer_profiles')
      .select('photographer_id,user_id,slug,published').eq('user_id', oldPhotographerId),
    'Previous milestone photographer fixture',
  );
  const existingClient = await single(
    existingClientDb.from('clients').select('user_id,photographer_id').eq('user_id', oldClientId),
    'Previous milestone client fixture',
  );
  assert(existingBusiness.slug === 'lensflow-recovery-13a' && existingBusiness.published === true &&
    existingClient.photographer_id === existingBusiness.photographer_id,
    'Safety stop: prior LensFlow-Recovery-Test fixture does not match');
  await empty(newPhotographerDb.from('profiles').select('user_id').eq('user_id', photographerId),
    'New photographer profile preflight');
  await empty(newClientDb.from('profiles').select('user_id').eq('user_id', clientId),
    'New client profile preflight');
  await empty(newPhotographerDb.from('photographer_profiles').select('photographer_id').eq('user_id', photographerId),
    'New business preflight');
  await empty(newClientDb.from('clients').select('client_id').eq('user_id', clientId),
    'New client record preflight');
  console.log('Safety checks passed: recovery fixtures verified; fresh users have no application records.\n');

  let business;
  await check('New photographer can create own account profile', async () => {
    const row = await single(newPhotographerDb.from('profiles').insert({
      user_id: photographerId, role: 'photographer', first_name: 'Registration',
      last_name: 'Photographer', email: env.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL,
    }).select('user_id,role'), 'Photographer profile insert');
    assert(row.user_id === photographerId && row.role === 'photographer', 'Unexpected photographer profile');
  });
  await check('New photographer can create an unpublished business', async () => {
    business = await single(newPhotographerDb.from('photographer_profiles').insert({
      user_id: photographerId, business_name: 'LensFlow Registration 13A',
      slug: `lensflow-registration-13a-${photographerId.slice(0, 8)}`,
      email: env.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL, published: false,
    }).select('photographer_id,user_id,published'), 'Unpublished business insert');
    assert(business.user_id === photographerId && business.published === false,
      'New business should start unpublished');
  });
  await check('New client can create own client-role profile', async () => {
    const row = await single(newClientDb.from('profiles').insert({
      user_id: clientId, role: 'client', first_name: 'Registration',
      last_name: 'Client', email: env.LENSFLOW_13A_NEW_CLIENT_EMAIL,
    }).select('user_id,role'), 'Client profile insert');
    assert(row.user_id === clientId && row.role === 'client', 'Unexpected client profile');
  });
  await check('Client cannot register with unpublished photographer', () => blockedInsert(
    newClientDb.from('clients').insert({ user_id: clientId, photographer_id: business.photographer_id }),
    'Unpublished photographer client insert'));
  await check('Denied unpublished registration created no client record', () => empty(
    newClientDb.from('clients').select('client_id').eq('user_id', clientId),
    'Denied client insert verification'));
  await check('Photographer cannot create a client record', () => blockedInsert(
    newPhotographerDb.from('clients').insert({ user_id: photographerId, photographer_id: business.photographer_id }),
    'Photographer client insert'));
  await check('Client cannot create a photographer business', () => blockedInsert(
    newClientDb.from('photographer_profiles').insert({
      user_id: clientId, business_name: 'Forbidden Business',
      slug: `forbidden-13a-${clientId.slice(0, 8)}`,
      email: env.LENSFLOW_13A_NEW_CLIENT_EMAIL,
    }), 'Client photographer profile insert'));
  await check('Photographer can publish own business', async () => {
    const row = await single(newPhotographerDb.from('photographer_profiles')
      .update({ published: true }).eq('photographer_id', business.photographer_id)
      .select('photographer_id,published'), 'Business publish');
    assert(row.published === true, 'Business did not become published');
  });
  await check('Client can register with published photographer', async () => {
    const row = await single(newClientDb.from('clients').insert({
      user_id: clientId, photographer_id: business.photographer_id,
    }).select('user_id,photographer_id'), 'Published photographer client insert');
    assert(row.user_id === clientId && row.photographer_id === business.photographer_id,
      'Unexpected client ownership');
  });
  await check('Client can read own linked record', async () => {
    const row = await single(newClientDb.from('clients')
      .select('user_id,photographer_id').eq('user_id', clientId), 'Linked client read');
    assert(row.photographer_id === business.photographer_id, 'Client linked to wrong business');
  });
  console.log(`\nMilestone 13A registration: ${results.filter(Boolean).length}/${results.length} checks passed.`);
  console.log('Synthetic profiles and published test business were intentionally retained in the TEST project.');
} catch (error) {
  console.error(`\nStopped: ${error.message}`);
  console.error('This script is stateful. Do not rerun blindly after a partial failure; share the PASS/FAIL lines first.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled(all.map((db) => db.auth.signOut()));
}
