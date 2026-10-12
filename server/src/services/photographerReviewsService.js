/** Milestone 12B: photographer review reads and moderation via caller JWT + RLS. */
import { resolvePhotographer } from './photographerBookingFormService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 250;
const CHUNK = 100;
const REVIEW_FIELDS = 'review_id,photographer_id,client_id,booking_id,rating,comment,status,created_at,updated_at';
const BOOKING_FIELDS = 'booking_id,booking_date,start_time,end_time,location,status,service_id,services(name)';
const CLIENT_FIELDS = 'client_id,user_id,profiles(first_name,last_name)';

export class PhotographerReviewError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function dbError(label, cause) {
  const error = new Error(`Unable to ${label}.`);
  error.cause = cause;
  return error;
}
async function read(query, label) {
  const { data, error } = await query;
  if (error) throw dbError(label, error);
  return data;
}
async function readAll(build, label) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await read(build().range(offset, offset + PAGE - 1), label) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
function uniqueIds(items, field) { return [...new Set(items.map(x => x[field]).filter(Boolean))]; }
async function relatedRows(db, table, fields, ids, ownerId) {
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const data = await read(db.from(table).select(fields).eq('photographer_id', ownerId)
      .in(table === 'clients' ? 'client_id' : 'booking_id', chunk), `load ${table}`) ?? [];
    rows.push(...data);
  }
  return rows;
}
export async function listPhotographerReviews(db, userId) {
  const photographer = await resolvePhotographer(db, userId);
  const photographerId = photographer.photographer_id;
  const reviews = await readAll(() => db.from('reviews').select(REVIEW_FIELDS)
    .eq('photographer_id', photographerId).order('created_at', { ascending: false })
    .order('review_id', { ascending: false }), 'load reviews');
  const [clients, bookings] = await Promise.all([
    relatedRows(db, 'clients', CLIENT_FIELDS, uniqueIds(reviews, 'client_id'), photographerId),
    relatedRows(db, 'bookings', BOOKING_FIELDS, uniqueIds(reviews, 'booking_id'), photographerId),
  ]);
  const clientMap = new Map(clients.map(c => [c.client_id, c]));
  const bookingMap = new Map(bookings.map(b => [b.booking_id, b]));
  return {
    photographerId,
    reviews: reviews.map(r => ({ ...r, client: clientMap.get(r.client_id) ?? null,
      booking: bookingMap.get(r.booking_id) ?? null })),
  };
}
export function validateModerationInput(reviewId, body) {
  if (typeof reviewId !== 'string' || !UUID.test(reviewId)) {
    throw new PhotographerReviewError(400, 'INVALID_REVIEW_ID', 'A valid review ID is required.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'status') ||
      !['approved', 'rejected'].includes(body.status)) {
    throw new PhotographerReviewError(400, 'INVALID_MODERATION', 'Status must be approved or rejected.');
  }
  return body.status;
}
export async function moderatePhotographerReview(db, userId, reviewId, body) {
  // Validate before accessing the database or invoking the SECURITY DEFINER RPC.
  const status = validateModerationInput(reviewId, body);
  const photographer = await resolvePhotographer(db, userId);
  const photographerId = photographer.photographer_id;
  const current = await read(db.from('reviews').select('review_id,photographer_id,status')
    .eq('review_id', reviewId).eq('photographer_id', photographerId).maybeSingle(), 'load review');
  // Do not reveal whether an unrelated review exists.
  if (!current) throw new PhotographerReviewError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
  if (current.status === status) {
    throw new PhotographerReviewError(409, 'ALREADY_MODERATED', 'This review already has the selected status.');
  }
  // SECURITY DEFINER function independently resolves auth.uid(), checks ownership,
  // and changes only status. Never accept owner IDs or rating/comment from the caller.
  const { data, error } = await db.rpc('moderate_review', {
    p_review_id: reviewId, p_status: status,
  });
  if (error) {
    if (/not found or access denied/i.test(error.message ?? '')) {
      throw new PhotographerReviewError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    }
    throw dbError('moderate review', error);
  }
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated || updated.review_id !== reviewId ||
      updated.photographer_id !== photographerId || updated.status !== status) {
    throw new Error('Unable to verify moderated review.');
  }
  // Return only fields used by the UI, not arbitrary RPC data.
  return { review_id: updated.review_id, photographer_id: updated.photographer_id,
    status: updated.status, updated_at: updated.updated_at };
}
