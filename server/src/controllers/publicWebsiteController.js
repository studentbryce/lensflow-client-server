import { createPublicSupabaseClient } from '../config/supabasePublic.js';
import { PublicWebsiteError, listPublicPhotographers, loadPublicWebsite } from '../services/publicWebsiteService.js';

// Generic error response handler for public website operations
function handle(error, res, next) {
  if (error instanceof PublicWebsiteError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}

// Controller function to get the list of public photographers
export async function getPublicPhotographers(req, res, next) {
  try {
    const data = await listPublicPhotographers(createPublicSupabaseClient());
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
}

// Controller function to get the public website for a specific photographer
export async function getPublicWebsite(req, res, next) {
  try {
    const data = await loadPublicWebsite(createPublicSupabaseClient(), req.params.slug);
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
}
