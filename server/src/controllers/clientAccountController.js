import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { ClientBookingError } from '../services/clientBookingService.js';
import { ClientAccountError, loadClientDashboard, getClientProfile, updateClientProfile } from '../services/clientAccountService.js';

// Error handling middleware for client account routes
function errorResponse(error, res, next) {
  if (error instanceof ClientBookingError || error instanceof ClientAccountError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}

// Controller function to get the client dashboard data
export async function getDashboard(req, res, next) {
  try {
    const data = await loadClientDashboard(createUserSupabaseClient(req.accessToken), req.user.id, req.query.today);
    return res.json({ success: true, data });
  } catch (error) { return errorResponse(error, res, next); }
}

// Controller function to get the client profile data
export async function getProfile(req, res, next) {
  try {
    const data = await getClientProfile(createUserSupabaseClient(req.accessToken), req.user.id);
    return res.json({ success: true, data });
  } catch (error) { return errorResponse(error, res, next); }
}

// Controller function to update the client profile data
export async function patchProfile(req, res, next) {
  try {
    const data = await updateClientProfile(createUserSupabaseClient(req.accessToken), req.user.id, req.body);
    return res.json({ success: true, data });
  } catch (error) { return errorResponse(error, res, next); }
}
