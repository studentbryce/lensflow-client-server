/** Milestone 10G: photographer settings. All database calls use the caller JWT and RLS. */
import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };
const allowed = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) {
    fail(400, 'INVALID_FIELDS', 'Unexpected or missing settings fields.');
  }
};
const text = (value, label, max, required = false) => {
  if (typeof value !== 'string' || value.length > max) fail(400, 'INVALID_FIELD', `${label} is invalid.`);
  const v = value.trim();
  if (required && !v) fail(400, 'INVALID_FIELD', `${label} is required.`);
  return v || null;
};
const email = value => {
  const v = text(value, 'Email', 254, true)?.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  return v;
};
const read = async (query, message) => {
  const { data, error } = await query;
  if (error) { const e = new Error(message); e.cause = error; throw e; }
  return data;
};
const owned = async (db, userId) => resolvePhotographer(db, userId);
const PROFILE_FIELDS = 'user_id,role,first_name,last_name,email,phone';
const BUSINESS_FIELDS = 'photographer_id,user_id,business_name,description,email,phone,website_url,address';
const PAYMENT_FIELDS = 'bank_account_name,bank_name,bank_account_number,bank_payment_instructions,gst_tax_number,default_tax_rate';
const STRIPE_FIELDS = 'stripe_account_id,charges_enabled,payouts_enabled,details_submitted';
const CALENDAR_FIELDS = 'integration_id,photographer_id,provider,calendar_id,token_expires_at,is_active,created_at,updated_at';

export async function getPhotographerSettings(db, userId, authEmail) {
  const owner = await owned(db, userId);
  const id = owner.photographer_id;
  const [profile, business, payment, stripe, calendar] = await Promise.all([
    read(db.from('profiles').select(PROFILE_FIELDS).eq('user_id', userId).single(), 'Unable to load account.'),
    read(db.from('photographer_profiles').select(BUSINESS_FIELDS).eq('photographer_id', id).single(), 'Unable to load business.'),
    read(db.from('photographer_payment_settings').select(PAYMENT_FIELDS).eq('photographer_id', id).maybeSingle(), 'Unable to load payment settings.'),
    read(db.from('photographer_stripe_accounts').select(STRIPE_FIELDS).eq('photographer_id', id).maybeSingle(), 'Unable to load Stripe status.'),
    read(db.from('calendar_integrations').select(CALENDAR_FIELDS).eq('photographer_id', id).eq('provider', 'google').maybeSingle(), 'Unable to load calendar integration.'),
  ]);
  return { profile: { ...profile, email: authEmail || profile.email }, business, payment, stripe, calendar };
}

export async function savePhotographerAccount(db, userId, body) {
  await owned(db, userId);
  allowed(body, ['first_name', 'last_name', 'phone', 'email']);
  const patch = {
    first_name: text(body.first_name, 'First name', 100, true),
    last_name: text(body.last_name, 'Last name', 100, true),
    phone: text(body.phone ?? '', 'Phone', 50),
  };
  // Account email is never accepted from the browser as an ordinary profile update.
  // If supplied, the controller verifies it against the authenticated Supabase Auth email.
  if (body.email !== undefined) patch.email = email(body.email);
  return read(db.from('profiles').update(patch).eq('user_id', userId).select(PROFILE_FIELDS).single(), 'Unable to save account.');
}

export async function savePhotographerBusiness(db, userId, body) {
  const owner = await owned(db, userId);
  allowed(body, ['business_name','email','phone','address','website_url','description']);
  const url = text(body.website_url ?? '', 'Website URL', 2048);
  if (url) {
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
    catch { fail(400, 'INVALID_URL', 'Website URL must start with http:// or https://.'); }
  }
  const patch = {
    business_name: text(body.business_name, 'Business name', 200, true),
    email: email(body.email),
    phone: text(body.phone ?? '', 'Phone', 50),
    address: text(body.address ?? '', 'Address', 2000),
    website_url: url,
    description: text(body.description ?? '', 'Description', 10000),
  };
  return read(db.from('photographer_profiles').update(patch).eq('photographer_id', owner.photographer_id).eq('user_id', userId).select(BUSINESS_FIELDS).single(), 'Unable to save business.');
}

export function validateTax(body) {
  allowed(body, ['gst_tax_number','default_tax_rate']);
  const rate = Number(body.default_tax_rate);
  if (body.default_tax_rate === '' || body.default_tax_rate === null || body.default_tax_rate === undefined ||
      !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-6) {
    fail(400, 'INVALID_TAX_RATE', 'Tax rate must be between 0 and 100 with at most two decimals.');
  }
  return { gst_tax_number: text(body.gst_tax_number ?? '', 'GST number', 100), default_tax_rate: Math.round(rate * 100) / 100 };
}
export async function savePhotographerTax(db, userId, body) {
  const owner = await owned(db, userId);
  return read(db.from('photographer_payment_settings').upsert({ photographer_id: owner.photographer_id, ...validateTax(body) }, { onConflict: 'photographer_id' }).select(PAYMENT_FIELDS).single(), 'Unable to save tax settings.');
}

export function validateBank(body) {
  const keys = ['bank_account_name','bank_name','bank_account_number','bank_payment_instructions'];
  allowed(body, keys);
  const patch = Object.fromEntries(keys.map(k => [k, text(body[k] ?? '', k, k === 'bank_payment_instructions' ? 2000 : 200)]));
  if (Object.values(patch).some(Boolean) && (!patch.bank_account_name || !patch.bank_account_number)) {
    fail(400, 'INVALID_BANK_DETAILS', 'Enter an account name and account number, or leave all bank fields blank.');
  }
  return patch;
}
export async function savePhotographerBank(db, userId, body) {
  const owner = await owned(db, userId);
  const patch = validateBank(body);
  // Deliberately do not rewrite historical invoices. They retain the bank details
  // shown at issuance; newly generated invoices can use the updated settings.
  return read(db.from('photographer_payment_settings').upsert({ photographer_id: owner.photographer_id, ...patch }, { onConflict: 'photographer_id' }).select(PAYMENT_FIELDS).single(), 'Unable to save bank details.');
}
