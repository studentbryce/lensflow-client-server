/**
 * LensFlow Milestone 13A: direct PostgREST authenticated security checks.
 * Run ONLY against LensFlow-Recovery-Test with synthetic accounts.
 * Requires @supabase/supabase-js from the existing LensFlow project.
 * Usage: node --env-file=.env.13a.local documents/security/milestone13a/authenticated_13a_tests.mjs
 */
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const required = [
  'LENSFLOW_13A_URL',
  'LENSFLOW_13A_ANON_KEY',
  'LENSFLOW_13A_PHOTOGRAPHER_EMAIL',
  'LENSFLOW_13A_PHOTOGRAPHER_PASSWORD',
  'LENSFLOW_13A_CLIENT_EMAIL',
  'LENSFLOW_13A_CLIENT_PASSWORD',
];
const missing = required.filter((name) => !env[name]);
if (missing.length) {
  console.error(`Missing local environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const url = env.LENSFLOW_13A_URL.replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  console.error('Invalid test Supabase URL. Expected https://<project-ref>.supabase.co');
  process.exit(1);
}
if (env.LENSFLOW_13A_PHOTOGRAPHER_EMAIL === env.LENSFLOW_13A_CLIENT_EMAIL) {
  console.error('Photographer and client test emails must be different.');
  process.exit(1);
}

const clientFor = () => createClient(url, env.LENSFLOW_13A_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const photographerDb = clientFor();
const clientDb = clientFor();

async function login(db, email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session?.access_token) {
    throw new Error(`Test account sign-in failed for ${email}: ${error?.message ?? 'missing session'}`);
  }
  return data.user.id;
}
async function one(query, label) {
  const { data, error } = await query.single();
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const results = [];
async function check(label, test) {
  try {
    await test();
    results.push({ label, passed: true });
    console.log(`PASS  ${label}`);
  } catch (e) {
    results.push({ label, passed: false });
    console.error(`FAIL  ${label}: ${e.message}`);
  }
}
async function expectTriggerBlocked(query, expectedMessage) {
  const { data, error } = await query.select('*');
  assert(error, `Update was accepted (${data?.length ?? 0} rows returned)`);
  assert(error.code === '42501', `Expected trigger SQLSTATE 42501; got ${error.code}: ${error.message}`);
  assert(error.message.includes(expectedMessage), `Unexpected denial source: ${error.message}`);
}
async function expectAllowed(query, label) {
  const { data, error } = await query.select('*');
  if (error) throw new Error(`${label}: ${error.message}`);
  assert(Array.isArray(data) && data.length === 1, `${label}: expected exactly one updated row, got ${data?.length ?? 'none'}`);
}

try {
  const photographerUserId = await login(
    photographerDb,
    env.LENSFLOW_13A_PHOTOGRAPHER_EMAIL,
    env.LENSFLOW_13A_PHOTOGRAPHER_PASSWORD,
  );
  const clientUserId = await login(
    clientDb,
    env.LENSFLOW_13A_CLIENT_EMAIL,
    env.LENSFLOW_13A_CLIENT_PASSWORD,
  );

  // Safety gate: do not mutate anything until test-only fixture identities match.
  const photographerProfile = await one(
    photographerDb.from('profiles').select('user_id,role,first_name,email').eq('user_id', photographerUserId),
    'Photographer fixture profile',
  );
  const clientProfile = await one(
    clientDb.from('profiles').select('user_id,role,first_name,email,phone').eq('user_id', clientUserId),
    'Client fixture profile',
  );
  const business = await one(
    photographerDb.from('photographer_profiles')
      .select('photographer_id,user_id,business_name,slug,published')
      .eq('user_id', photographerUserId),
    'Photographer business fixture',
  );
  const clientRecord = await one(
    clientDb.from('clients').select('client_id,user_id,photographer_id,notes').eq('user_id', clientUserId),
    'Client association fixture',
  );
  assert(photographerProfile.role === 'photographer' && photographerProfile.first_name === 'Test', 'Photographer fixture does not match test setup');
  assert(clientProfile.role === 'client' && clientProfile.first_name === 'Test', 'Client fixture does not match test setup');
  assert(business.slug === 'lensflow-recovery-13a' && business.published === true, 'Business fixture does not match test setup');
  assert(clientRecord.photographer_id === business.photographer_id, 'Client does not belong to test photographer');
  assert(photographerProfile.email === env.LENSFLOW_13A_PHOTOGRAPHER_EMAIL, 'Photographer email mismatch');
  assert(clientProfile.email === env.LENSFLOW_13A_CLIENT_EMAIL, 'Client email mismatch');
  console.log('Fixture safety checks passed; using authenticated user sessions (no service role key).\n');

  // Allowed updates use existing values, so business data does not need restoration.
  await check('Client can update own name', () => expectAllowed(
    clientDb.from('profiles').update({ first_name: clientProfile.first_name }).eq('user_id', clientUserId), 'Client profile edit'));
  await check('Client can update own phone', () => expectAllowed(
    clientDb.from('profiles').update({ phone: clientProfile.phone }).eq('user_id', clientUserId), 'Client phone edit'));
  await check('Photographer can edit linked client name', () => expectAllowed(
    photographerDb.from('profiles').update({ first_name: clientProfile.first_name }).eq('user_id', clientUserId), 'Photographer client edit'));
  await check('Photographer can edit client notes', () => expectAllowed(
    photographerDb.from('clients').update({ notes: clientRecord.notes }).eq('client_id', clientRecord.client_id), 'Client notes edit'));
  await check('Photographer can update own business', () => expectAllowed(
    photographerDb.from('photographer_profiles').update({ business_name: business.business_name }).eq('photographer_id', business.photographer_id), 'Business edit'));

  await check('Client cannot change own role', () => expectTriggerBlocked(
    clientDb.from('profiles').update({ role: 'photographer' }).eq('user_id', clientUserId), 'Profile role cannot be changed'));
  await check('Photographer cannot change client role', () => expectTriggerBlocked(
    photographerDb.from('profiles').update({ role: 'photographer' }).eq('user_id', clientUserId), 'Profile role cannot be changed'));
  await check('Client cannot change linked photographer', () => expectTriggerBlocked(
    clientDb.from('clients').update({ photographer_id: '00000000-0000-4000-8000-000000000001' }).eq('client_id', clientRecord.client_id), 'Client identity and photographer association cannot be changed'));
  await check('Photographer cannot reassign client user', () => expectTriggerBlocked(
    photographerDb.from('clients').update({ user_id: photographerUserId }).eq('client_id', clientRecord.client_id), 'Client identity and photographer association cannot be changed'));
  await check('Photographer cannot transfer business ownership', () => expectTriggerBlocked(
    photographerDb.from('photographer_profiles').update({ user_id: clientUserId }).eq('photographer_id', business.photographer_id), 'Photographer identity and owner cannot be changed'));

  // Cross-account access should be filtered by RLS; verify row count, not just error.
  await check('Client cannot edit photographer account', async () => {
    const { data, error } = await clientDb.from('profiles')
      .update({ first_name: 'ShouldNotChange' }).eq('user_id', photographerUserId).select('user_id');
    if (error && error.code !== '42501') throw new Error(error.message);
    assert(!data?.length, 'Client unexpectedly updated photographer profile');
    const current = await one(
      photographerDb.from('profiles').select('first_name').eq('user_id', photographerUserId),
      'Photographer after cross-account attempt',
    );
    assert(current.first_name === photographerProfile.first_name, 'Photographer name changed');
  });

  const failures = results.filter((r) => !r.passed);
  console.log(`\nMilestone 13A: ${results.length - failures.length}/${results.length} checks passed.`);
  if (failures.length) process.exitCode = 1;
} catch (e) {
  console.error(`ABORTED before completing checks: ${e.message}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([photographerDb.auth.signOut(), clientDb.auth.signOut()]);
}
