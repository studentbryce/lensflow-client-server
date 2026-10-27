/** Milestone 11E — client reviews using verified JWT and user-scoped Supabase RLS. */
import { findAuthenticatedClient } from './clientBookingService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 250;
const BOOKING_FIELDS = 'booking_id,photographer_id,client_id,service_id,booking_date,start_time,end_time,location,status,services(name)';
const REVIEW_FIELDS = 'review_id,photographer_id,client_id,booking_id,rating,comment,status,created_at,updated_at';

// Helper function to validate a UUID string for booking or review IDs
export class ClientReviewError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
// Helper function to create a database failure error with a message and cause
function dbFailure(label, cause) {
  const error = new Error(`Unable to ${label}.`);
  error.cause = cause;
  return error;
}
// Helper function to query the database and throw a ClientReviewError on failure
async function read(query, label) {
  const { data, error } = await query;
  if (error) throw dbFailure(label, error);
  return data;
}
// Helper function to validate a UUID string for booking or review IDs
function validId(id, label) {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new ClientReviewError(400, 'INVALID_ID', `A valid ${label} ID is required.`);
  }
  return id;
}
// Helper function to validate the review input, ensuring rating is between 1 and 5 and comment is a string of appropriate length
export function validateReviewInput(body) {
  if (!body || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw new ClientReviewError(400, 'INVALID_RATING', 'Please select a whole-number rating between 1 and 5 stars.');
  }
  if (body.comment != null && typeof body.comment !== 'string') {
    throw new ClientReviewError(400, 'INVALID_COMMENT', 'Review comment must be text.');
  }
  const comment = body.comment?.trim() || null;
  if (comment && comment.length > 2000) {
    throw new ClientReviewError(400, 'INVALID_COMMENT', 'Your review must be 2,000 characters or fewer.');
  }
  return { rating: body.rating, comment };
}
// Helper function to read all rows from a query builder in batches, handling pagination
async function allRows(db, table, fields, clientId, orderField) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await read(db.from(table).select(fields).eq('client_id', clientId)
      .order(orderField, { ascending: false })
      .order(table === 'reviews' ? 'review_id' : 'booking_id', { ascending: false })
      .range(offset, offset + PAGE - 1), `load ${table}`) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}
// Main function to list the authenticated client's bookings and reviews, including associated details
export async function listClientReviews(db, userId) {
  const clientId = await findAuthenticatedClient(db, userId);
  const [bookings, reviews] = await Promise.all([
    allRows(db, 'bookings', BOOKING_FIELDS, clientId, 'booking_date'),
    allRows(db, 'reviews', REVIEW_FIELDS, clientId, 'created_at'),
  ]);
  return { clientId, bookings, reviews };
}
// Main function to get a specific review for the authenticated client, including associated booking details
export async function createClientReview(db, userId, body) {
  const { rating, comment } = validateReviewInput(body);
  const bookingId = validId(body.bookingId, 'booking');
  const clientId = await findAuthenticatedClient(db, userId);
  const booking = await read(db.from('bookings')
    .select('booking_id,photographer_id,client_id,status')
    .eq('booking_id', bookingId).eq('client_id', clientId).maybeSingle(), 'load booking');
  // Hide whether an unrelated booking exists.
  if (!booking) throw new ClientReviewError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  if (booking.status !== 'completed') {
    throw new ClientReviewError(409, 'BOOKING_NOT_COMPLETED', 'Reviews can only be submitted for completed bookings.');
  }
  const { data, error } = await db.from('reviews').insert({
    photographer_id: booking.photographer_id, client_id: clientId,
    booking_id: booking.booking_id, rating, comment,
    // Database default and RLS require status = pending; never accept status from caller.
  }).select(REVIEW_FIELDS).single();
  if (error?.code === '23505') {
    throw new ClientReviewError(409, 'ALREADY_REVIEWED', 'You have already reviewed this booking.');
  }
  if (error) throw dbFailure('create review', error);
  return data;
}
// Main function to get a specific review for the authenticated client, including associated booking details
export async function updateClientReview(db, userId, reviewId, body) {
  validId(reviewId, 'review');
  const { rating, comment } = validateReviewInput(body);
  const clientId = await findAuthenticatedClient(db, userId);
  const review = await read(db.from('reviews')
    .select('review_id,client_id,status').eq('review_id', reviewId)
    .eq('client_id', clientId).maybeSingle(), 'load review');
  if (!review) throw new ClientReviewError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
  if (review.status !== 'pending') {
    throw new ClientReviewError(409, 'REVIEW_NOT_PENDING', 'Only pending reviews can be edited.');
  }
  // Database function rechecks identity and pending status atomically; do not use
  // a general UPDATE (which could modify moderation fields).
  const { data, error } = await db.rpc('update_pending_review', {
    p_review_id: reviewId, p_rating: rating, p_comment: comment,
  });
  if (error) {
    // A concurrent moderation decision may occur after our precheck.
    if (/not found|access denied|no longer pending/i.test(error.message || '')) {
      throw new ClientReviewError(409, 'REVIEW_NOT_PENDING', 'Review is no longer available for editing.');
    }
    throw dbFailure('update review', error);
  }
  if (!data || data.review_id !== reviewId || data.client_id !== clientId) {
    throw new Error('Unable to verify updated review.');
  }
  return {
    review_id: data.review_id, photographer_id: data.photographer_id,
    client_id: data.client_id, booking_id: data.booking_id,
    rating: data.rating, comment: data.comment, status: data.status,
    created_at: data.created_at, updated_at: data.updated_at,
  };
}
