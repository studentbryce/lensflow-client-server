import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { OnboardingError, getAccountProfile, completeAccount } from '../services/accountOnboardingService.js';
function handle(error, res, next) {
  if (error instanceof OnboardingError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}
export async function getProfile(req, res, next) {
  try {
    const data = await getAccountProfile(createUserSupabaseClient(req.accessToken), req.user);
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
}
export async function finishSignup(req, res, next) {
  try {
    const data = await completeAccount(createUserSupabaseClient(req.accessToken), req.user);
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
}
