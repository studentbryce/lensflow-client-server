/** Milestone 11A: client dashboard and own profile, using a verified user JWT + RLS. */
import { findAuthenticatedClient } from './clientBookingService.js';

export class ClientAccountError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function dbFailure(message, cause) {
  const error = new Error(message); error.cause = cause; return error;
}

function assertDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new ClientAccountError(400, 'INVALID_DATE', 'today must be a valid YYYY-MM-DD date.');
  }
  return value;
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw dbFailure(`Unable to load ${label}.`, error);
  return data ?? [];
}

export async function loadClientDashboard(db, userId, today) {
  const date = assertDate(today);
  const clientId = await findAuthenticatedClient(db, userId);
  const { data: client, error: clientError } = await db.from('clients')
    .select('client_id, profiles(first_name, last_name)')
    .eq('client_id', clientId).maybeSingle();
  if (clientError) throw dbFailure('Unable to load client details.', clientError);
  if (!client) throw new ClientAccountError(403, 'CLIENT_REQUIRED', 'A client profile is required.');

  const bookings = await queryRows(db.from('bookings')
    .select('booking_id, booking_date, start_time, end_time, status, total_amount, services(service_id, name)')
    .eq('client_id', clientId).order('booking_date', { ascending: false }), 'bookings');
  const invoices = await queryRows(db.from('invoices')
    .select('invoice_id, invoice_number, issue_date, due_date, total_amount, status')
    .eq('client_id', clientId).order('due_date', { ascending: true }), 'invoices');
  const galleries = await queryRows(db.from('galleries')
    .select('gallery_id, name, description, is_published, allow_downloads, created_at')
    .eq('client_id', clientId).eq('is_published', true)
    .order('created_at', { ascending: false }), 'galleries');

  const upcoming = bookings.filter(b => b.booking_date >= date && ['pending', 'confirmed'].includes(b.status))
    .sort((a, b) => `${a.booking_date}T${a.start_time || '00:00:00'}`.localeCompare(`${b.booking_date}T${b.start_time || '00:00:00'}`)).slice(0, 5);
  const unpaid = invoices.filter(i => ['sent', 'overdue'].includes(i.status));
  const outstanding = unpaid.reduce((total, invoice) => total + Number(invoice.total_amount || 0), 0);
  return {
    profile: { first_name: client.profiles?.first_name || '', last_name: client.profiles?.last_name || '' },
    stats: { bookings: bookings.length, upcomingBookings: upcoming.length, outstanding, galleries: galleries.length },
    upcomingBookings: upcoming,
    outstandingInvoices: unpaid.slice(0, 5),
    recentGalleries: galleries.slice(0, 4),
  };
}

const PROFILE_FIELDS = 'user_id, first_name, last_name, email, phone';

export async function getClientProfile(db, userId) {
  await findAuthenticatedClient(db, userId);
  const { data, error } = await db.from('profiles').select(PROFILE_FIELDS).eq('user_id', userId).maybeSingle();
  if (error) throw dbFailure('Unable to load profile.', error);
  if (!data) throw new ClientAccountError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
  return data;
}

export function validateProfileUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['first_name', 'last_name', 'phone'].includes(key))) {
    throw new ClientAccountError(400, 'INVALID_PROFILE', 'Only first name, last name and phone can be changed.');
  }
  for (const key of ['first_name', 'last_name']) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > 100) {
      throw new ClientAccountError(400, 'INVALID_PROFILE', `${key} must be 1–100 characters.`);
    }
  }
  if (body.phone != null && (typeof body.phone !== 'string' || body.phone.trim().length > 30)) {
    throw new ClientAccountError(400, 'INVALID_PROFILE', 'Phone must be 30 characters or fewer.');
  }
  return {
    first_name: body.first_name.trim(), last_name: body.last_name.trim(),
    phone: body.phone?.trim() || null,
  };
}

export async function updateClientProfile(db, userId, body) {
  const values = validateProfileUpdate(body);
  await findAuthenticatedClient(db, userId);
  const { data, error } = await db.from('profiles').update(values)
    .eq('user_id', userId).select(PROFILE_FIELDS).maybeSingle();
  if (error) throw dbFailure('Unable to update profile.', error);
  if (!data) throw new ClientAccountError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
  return data;
}
