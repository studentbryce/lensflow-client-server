import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { ClientBookingError } from '../services/clientBookingService.js';
import {
  ClientReviewError, listClientReviews, createClientReview, updateClientReview,
} from '../services/clientReviewsService.js';

// Error handling middleware for client reviews routes
function handleError(error, res, next) {
  if (error instanceof ClientReviewError || error instanceof ClientBookingError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}

// Generic handler to wrap service functions and handle errors
const handler = action => async (req, res, next) => {
  try {
    const data = await action(createUserSupabaseClient(req.accessToken), req.user.id, req.body);
    return res.json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
};

// Controller functions for client reviews routes
export const listReviews = handler(listClientReviews);
export const createReview = async (req, res, next) => {
  try {
    const data = await createClientReview(createUserSupabaseClient(req.accessToken), req.user.id, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
};

// Controller function to update a specific review for a client by ID
export const updateReview = async (req, res, next) => {
  try {
    const data = await updateClientReview(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id, req.body);
    return res.json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
};
