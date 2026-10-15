/**
 * Resume LensFlow 13A registration tests after exactly the first 3 PASSes and
 * the 42P17 recursion error at test 4. TEST PROJECT ONLY.
 * Never re-run the original stateful registration script on these fixtures.
 */
import { createClient } from '@supabase/supabase-js';

const e = process.env;
const required = [
  'LENSFLOW_13A_URL', 'LENSFLOW_13A_ANON_KEY',
  'LENSFLOW_13A_PHOTOGRAPHER_EMAIL', 'LENSFLOW_13A_PHOTOGRAPHER_PASSWORD',
  'LENSFLOW_13A_CLIENT_EMAIL', 'LENSFLOW_13A_CLIENT_PASSWORD',
  'LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL', 'LENSFLOW_13A_NEW_PHOTOGRAPHER_PASSWORD',
  'LENSFLOW_13A_NEW_CLIENT_EMAIL', 'LENSFLOW_13A_NEW_CLIENT_PASSWORD',
  'LENSFLOW_13A_EXPECTED_TEST_REF', 'LENSFLOW_13A_CONFIRM_TEST_ONLY',
];
const missing = required.filter(k => !e[k]);
if (missing.length) { console.error(`Missing environment settings: ${missing.join(', ')}`); process.exit(1); }
const url = e.LENSFLOW_13A_URL.replace(/\/$/, '');
const match = /^https:\/\/([a-z0-9-]+)\.supabase\.co$/i.exec(url);
if (!match || match[1] !== e.LENSFLOW_13A_EXPECTED_TEST_REF ||
    e.LENSFLOW_13A_CONFIRM_TEST_ONLY !== 'YES_TEST_PROJECT_ONLY') {
  console.error('Safety stop: not explicitly configured for the expected recovery TEST project');
  process.exit(1);
}
const emails = [e.LENSFLOW_13A_PHOTOGRAPHER_EMAIL, e.LENSFLOW_13A_CLIENT_EMAIL,
  e.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL, e.LENSFLOW_13A_NEW_CLIENT_EMAIL];
if (new Set(emails.map(x => x.toLowerCase())).size !== 4) {
  console.error('Safety stop: expected four distinct test users'); process.exit(1);
}
const dbFor = () => createClient(url, e.LENSFLOW_13A_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const [oldPhotographerDb, oldClientDb, newPhotographerDb, newClientDb] =
  Array.from({ length: 4 }, dbFor);
const all = [oldPhotographerDb, oldClientDb, newPhotographerDb, newClientDb];
function assert(condition, message) { if (!condition) throw new Error(message); }
async function login(db, email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data?.user?.id || !data?.session?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? 'no session'}`);
  }
  assert(data.user.email?.toLowerCase() === email.toLowerCase(), 'Signed-in account email mismatch');
  return data.user.id;
}
async function single(query, label) {
  const { data, error } = await query.single();
  if (error) throw new Error(`${label}: ${error.code ?? ''} ${error.message}`);
  return data;
}
async function empty(query, label) {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${label}: ${error.code ?? ''} ${error.message}`);
  assert(data === null, `${label}: expected no record; stop and investigate`);
}
async function blockedInsert(query, label) {
  const { data, error } = await query.select('*');
  assert(error, `${label}: insert unexpectedly succeeded (${data?.length ?? 0} rows)`);
  assert(error.code === '42501', `${label}: expected RLS denial (42501), got ${error.code}: ${error.message}`);
}
let completed = 0;
async function check(label, fn) {
  try { await fn(); completed++; console.log(`PASS  ${label}`); }
  catch (error) { console.error(`FAIL  ${label}: ${error.message}`); throw error; }
}
try {
  const [oldPhotographerId, oldClientId, photographerId, clientId] = await Promise.all([
    login(oldPhotographerDb, e.LENSFLOW_13A_PHOTOGRAPHER_EMAIL, e.LENSFLOW_13A_PHOTOGRAPHER_PASSWORD),
    login(oldClientDb, e.LENSFLOW_13A_CLIENT_EMAIL, e.LENSFLOW_13A_CLIENT_PASSWORD),
    login(newPhotographerDb, e.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL, e.LENSFLOW_13A_NEW_PHOTOGRAPHER_PASSWORD),
    login(newClientDb, e.LENSFLOW_13A_NEW_CLIENT_EMAIL, e.LENSFLOW_13A_NEW_CLIENT_PASSWORD),
  ]);
  assert(new Set([oldPhotographerId, oldClientId, photographerId, clientId]).size === 4,
    'Expected four different authenticated users');

  // Verify the exact partial state from the original test run.
  const previousBusiness = await single(oldPhotographerDb.from('photographer_profiles')
    .select('photographer_id,user_id,slug,published').eq('user_id', oldPhotographerId),
    'Previous test photographer business');
  const previousClient = await single(oldClientDb.from('clients')
    .select('user_id,photographer_id').eq('user_id', oldClientId),
    'Previous test client');
  assert(previousBusiness.slug === 'lensflow-recovery-13a' && previousBusiness.published === true &&
    previousClient.photographer_id === previousBusiness.photographer_id,
    'Safety stop: original test fixtures do not match');

  const newPhotographerProfile = await single(newPhotographerDb.from('profiles')
    .select('user_id,role,first_name,last_name,email').eq('user_id', photographerId),
    'Partially created photographer account');
  const newClientProfile = await single(newClientDb.from('profiles')
    .select('user_id,role,first_name,last_name,email').eq('user_id', clientId),
    'Partially created client account');
  const business = await single(newPhotographerDb.from('photographer_profiles')
    .select('photographer_id,user_id,slug,published').eq('user_id', photographerId),
    'Partially created unpublished business');
  assert(newPhotographerProfile.role === 'photographer' &&
    newPhotographerProfile.first_name === 'Registration' &&
    newPhotographerProfile.last_name === 'Photographer' &&
    newPhotographerProfile.email?.toLowerCase() === e.LENSFLOW_13A_NEW_PHOTOGRAPHER_EMAIL.toLowerCase() &&
    newClientProfile.role === 'client' &&
    newClientProfile.first_name === 'Registration' &&
    newClientProfile.last_name === 'Client' &&
    newClientProfile.email?.toLowerCase() === e.LENSFLOW_13A_NEW_CLIENT_EMAIL.toLowerCase() &&
    business.user_id === photographerId &&
    business.slug === `lensflow-registration-13a-${photographerId.slice(0, 8)}` &&
    business.published === false,
    'Safety stop: partial fixtures do not match the original first three PASSes');
  await empty(newClientDb.from('clients').select('client_id').eq('user_id', clientId),
    'New client record must not exist before resuming');
  await empty(newPhotographerDb.from('clients').select('client_id').eq('user_id', photographerId),
    'New photographer must not have a client record');
  console.log('Partial fixture safety checks passed: first three original steps preserved; resuming at step 4.\n');

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
      email: e.LENSFLOW_13A_NEW_CLIENT_EMAIL,
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
  console.log(`\nMilestone 13A registration: ${3 + completed}/10 checks passed (3 original + ${completed} resumed).`);
  console.log('Synthetic records retained in the recovery TEST project.');
} catch (error) {
  console.error(`\nStopped: ${error.message}`);
  console.error('Do not rerun this stateful resume script after a partial failure. Share PASS/FAIL output.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled(all.map(db => db.auth.signOut()));
}
