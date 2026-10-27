/** Idempotent onboarding via verified Supabase user + user-scoped RLS. No service-role key. */

// Define a regular expression for validating UUIDs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OnboardingError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// Helper function to create a failure error with a label and cause
function failure(label, cause) { const error = new Error(`Unable to ${label}.`); error.cause = cause; return error; }
async function query(request, label) {
  const { data, error } = await request;
  if (error) throw failure(label, error);
  return data;
}

// Helper function to clean and validate text input
function cleanText(value, max, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new OnboardingError(422, 'INCOMPLETE_SIGNUP', `${label} is missing or invalid.`);
  return text;
}

// Helper function to slugify a string value for use in URLs
function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// Function to get the account profile for onboarding
export async function getAccountProfile(db, user) {
  if (!user?.id) throw new OnboardingError(401, 'UNAUTHORIZED', 'Please sign in.');
  return await query(db.from('profiles').select('*').eq('user_id', user.id).maybeSingle(), 'load account profile');
}

// Function to complete the account onboarding process
export async function completeAccount(db, user) {
  if (!user?.id || !user.email) throw new OnboardingError(401, 'UNAUTHORIZED', 'Please sign in.');
  const metadata = user.user_metadata ?? {};
  const role = metadata.signup_type;
  if (role !== 'client' && role !== 'photographer') {
    // Accounts created outside the registration flow must not be assigned an invented role.
    return await getAccountProfile(db, user);
  }
  const firstName = cleanText(metadata.first_name, 100, 'First name');
  const lastName = cleanText(metadata.last_name, 100, 'Last name');
  const email = cleanText(user.email, 255, 'Email');
  let photographerId;
  let businessName;
  if (role === 'client') {
    photographerId = metadata.photographer_id;
    if (typeof photographerId !== 'string' || !UUID.test(photographerId)) {
      throw new OnboardingError(422, 'INVALID_PHOTOGRAPHER', 'A photographer must be selected.');
    }
  } else {
    businessName = cleanText(metadata.business_name, 150, 'Business name');
  }
  const existing = await getAccountProfile(db, user);
  if (existing && existing.role !== role) {
    // Never change a role based on mutable user_metadata.
    return existing;
  }
  // Confirm selected photographer is still published even if signup metadata was edited.
  if (role === 'client') {
    const available = await query(db.from('photographer_profiles').select('photographer_id')
      .eq('photographer_id', photographerId).eq('published', true).maybeSingle(), 'check photographer availability');
    if (!available) throw new OnboardingError(422, 'PHOTOGRAPHER_UNAVAILABLE', 'The selected photographer is no longer available for online signup.');
  }
  if (!existing) {
    const { error } = await db.from('profiles').insert({
      user_id: user.id, role, first_name: firstName, last_name: lastName, email,
    });
    if (error && error.code !== '23505') throw failure('create account profile', error);
  }
  if (role === 'client') {
    const current = await query(db.from('clients').select('client_id,photographer_id')
      .eq('user_id', user.id).maybeSingle(), 'load client account');
    if (!current) {
      const { error } = await db.from('clients').insert({ user_id: user.id, photographer_id: photographerId });
      if (error && error.code !== '23505') throw failure('create client account', error);
    }
    // Existing client affiliation is never changed by metadata edits or retries.
  } else {
    const current = await query(db.from('photographer_profiles').select('photographer_id')
      .eq('user_id', user.id).maybeSingle(), 'load photographer account');
    if (!current) {
      const slug = `${slugify(businessName) || 'photographer'}-${user.id.slice(0, 8)}`;
      const { error } = await db.from('photographer_profiles').insert({
        user_id: user.id, business_name: businessName, slug, email, published: false,
      });
      if (error && error.code !== '23505') throw failure('create photographer account', error);
    }
  }
  return await getAccountProfile(db, user);
}
