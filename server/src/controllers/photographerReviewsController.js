import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import {
  PhotographerReviewError, listPhotographerReviews, moderatePhotographerReview,
} from '../services/photographerReviewsService.js';

// Generic error response handler for photographer review operations
function handle(error, res, next) {
  if (error instanceof PhotographerReviewError || error instanceof BookingRequestError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}

// Controller function to get the list of reviews for a photographer
export async function getPhotographerReviews(req, res, next) {
  try {
    const data = await listPhotographerReviews(createUserSupabaseClient(req.accessToken), req.user.id);
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
}

// Controller function to moderate a specific review for a photographer
export async function moderateReview(req, res, next) {
  try {
    const data = await moderatePhotographerReview(createUserSupabaseClient(req.accessToken),
      req.user.id, req.params.id, req.body);
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
}
