import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { getPhotographerDashboard } from '../services/dashboardService.js';

export async function getDashboard(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await getPhotographerDashboard(db, req.user.id, req.query.today);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) {
    if (error instanceof BookingRequestError) {
      return res.status(error.status).set('Cache-Control', 'no-store').json({
        success: false, error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
}
