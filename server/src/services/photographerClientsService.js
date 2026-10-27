/**
 * Photographer Clients pages: list, detail, edit.
 * All database access is made with the verified caller's JWT; PostgreSQL RLS
 * remains enforced. Never accept a photographer_id or user_id from the client.
 */
import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
const PROFILE_CHUNK_SIZE = 100;

// Helper function to throw a BookingRequestError with a specific status, code, and message
function fail(status, code, message) {
  throw new BookingRequestError(status, code, message);
}

// Validate if a given string is a valid UUID
export function validateClientId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) {
    fail(400, 'INVALID_CLIENT_ID', 'Client ID must be a valid UUID.');
  }
  return id;
}

// Helper function to query the database and return data or throw an error with a message and cause
async function read(query, message) {
  const { data, error } = await query;
  if (error) {
    const failure = new Error(message);
    failure.cause = error;
    throw failure;
  }
  return data ?? [];
}

// Helper function to read all rows from a query builder in batches, handling pagination
async function readAll(buildQuery, message) {
  const all = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await read(buildQuery().range(start, start + PAGE_SIZE - 1), message);
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

// Helper function to load profiles for a list of clients, batching requests to avoid exceeding limits
async function loadProfiles(db, clients) {
  const ids = [...new Set(clients.map(c => c.user_id).filter(Boolean))];
  const map = new Map();
  for (let start = 0; start < ids.length; start += PROFILE_CHUNK_SIZE) {
    const profiles = await read(db.from('profiles')
      .select('user_id,first_name,last_name,email,phone,avatar_url')
      .in('user_id', ids.slice(start, start + PROFILE_CHUNK_SIZE)), 'Unable to load client profiles.');
    for (const profile of profiles) map.set(profile.user_id, profile);
  }
  return map;
}

function clientWithProfile(client, profileMap) {
  return { ...client, profile: profileMap.get(client.user_id) ?? null };
}

// Main function to list the photographer's clients, including their profiles and booking summaries
export async function listPhotographerClients(db, userId) {
  const photographer = await resolvePhotographer(db, userId);
  const id = photographer.photographer_id;
  const clients = await readAll(() => db.from('clients')
    .select('client_id,photographer_id,user_id,notes,created_at')
    .eq('photographer_id', id)
    .order('created_at', { ascending: false })
    .order('client_id', { ascending: false }), 'Unable to load clients.');

  if (!clients.length) return [];

  const profiles = await loadProfiles(db, clients);
  // All bookings are needed to preserve the existing client list's counts and
  // latest-booking summary. Page results to avoid PostgREST row-limit truncation.
  const bookings = await readAll(() => db.from('bookings')
    .select('booking_id,client_id,booking_date,status,total_amount,services(name)')
    .eq('photographer_id', id)
    .order('booking_date', { ascending: false })
    .order('booking_id', { ascending: false }), 'Unable to load client booking summaries.');
  const clientIds = new Set(clients.map(c => c.client_id));
  const grouped = new Map();
  for (const booking of bookings) {
    if (!clientIds.has(booking.client_id)) continue;
    if (!grouped.has(booking.client_id)) grouped.set(booking.client_id, []);
    grouped.get(booking.client_id).push(booking);
  }
  return clients.map(c => {
    const history = grouped.get(c.client_id) ?? [];
    return {
      ...clientWithProfile(c, profiles),
      bookings: history,
      bookingCount: history.length,
      latestBooking: history[0] ?? null,
    };
  });
}

// Main function to find a specific client owned by the photographer, throwing an error if not found
async function findOwnedClient(db, photographerId, clientId) {
  const row = await read(db.from('clients')
    .select('client_id,photographer_id,user_id,notes,created_at')
    .eq('client_id', clientId)
    .eq('photographer_id', photographerId)
    .maybeSingle(), 'Unable to load client.');
  if (!row || Array.isArray(row)) fail(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  return row;
}

// Main function to get a specific client owned by the photographer, including their profile and booking history
export async function getPhotographerClient(db, userId, clientId) {
  validateClientId(clientId);
  const photographer = await resolvePhotographer(db, userId);
  const client = await findOwnedClient(db, photographer.photographer_id, clientId);
  const profiles = await loadProfiles(db, [client]);
  const bookings = await readAll(() => db.from('bookings')
    .select('booking_id,client_id,booking_date,start_time,end_time,status,total_amount,services(name)')
    .eq('photographer_id', photographer.photographer_id)
    .eq('client_id', clientId)
    .order('booking_date', { ascending: false })
    .order('booking_id', { ascending: false }), 'Unable to load client bookings.');
  return { client: clientWithProfile(client, profiles), bookings };
}

// Main function to update a specific client owned by the photographer, including their profile and notes
export function validateClientUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(400, 'INVALID_BODY', 'A JSON client update object is required.');
  }
  const allowed = ['first_name', 'last_name', 'email', 'phone', 'notes'];
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !allowed.includes(key))) {
    fail(400, 'INVALID_FIELDS', 'Only first_name, last_name, email, phone and notes may be updated.');
  }
  const limits = { first_name: 100, last_name: 100, email: 254, phone: 40, notes: 5000 };
  const result = {};
  for (const key of keys) {
    if (typeof body[key] !== 'string' || body[key].length > limits[key]) {
      fail(400, 'INVALID_FIELDS', `${key} must be text of at most ${limits[key]} characters.`);
    }
    const value = body[key].trim();
    if (key === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        fail(400, 'INVALID_EMAIL', 'Enter a valid client email address.');
      }
      result[key] = value;
    } else if (key === 'phone' || key === 'notes') {
      result[key] = value || null;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Main function to update a specific client owned by the photographer, including their profile and notes
export async function updatePhotographerClient(db, userId, clientId, body) {
  validateClientId(clientId);
  const changes = validateClientUpdate(body);
  const photographer = await resolvePhotographer(db, userId);
  const client = await findOwnedClient(db, photographer.photographer_id, clientId);
  const { notes, ...profileChanges } = changes;
  let profile = null;

  // The profile and client-note writes are separate PostgREST transactions.
  // An error on the second write can leave a partial update; see README.
  if (Object.keys(profileChanges).length) {
    profile = await read(db.from('profiles').update(profileChanges)
      .eq('user_id', client.user_id)
      .select('user_id,first_name,last_name,email,phone,avatar_url')
      .maybeSingle(), 'Unable to update client profile.');
    if (!profile || Array.isArray(profile)) {
      fail(403, 'PROFILE_UPDATE_DENIED', 'Client profile could not be updated. Check the profiles RLS policy.');
    }
  }
  let updatedClient = client;
  if (Object.hasOwn(changes, 'notes')) {
    updatedClient = await read(db.from('clients').update({ notes })
      .eq('client_id', clientId)
      .eq('photographer_id', photographer.photographer_id)
      .select('client_id,photographer_id,user_id,notes,created_at')
      .maybeSingle(), 'Unable to update client notes.');
    if (!updatedClient || Array.isArray(updatedClient)) {
      fail(404, 'CLIENT_NOT_FOUND', 'Client not found.');
    }
  }
  return { client: updatedClient, profile };
}
