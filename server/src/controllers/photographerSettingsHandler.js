import { BookingRequestError } from '../services/bookingCreateService.js';
import { savePhotographerAccount } from '../services/photographerSettingsService.js';

// Generic handler to wrap service functions and handle errors
export function makeSettingsHandler(action, clientFactory) {
  return async (req, res, next) => {
    try {
      const db = clientFactory(req.accessToken);
      // Prevent an unconfirmed or forged profile email from replacing the Auth email.
      if (action === savePhotographerAccount && req.body?.email !== undefined &&
          (typeof req.body.email !== 'string' || req.body.email.trim().toLowerCase() !== (req.user.email || '').toLowerCase())) {
        throw new BookingRequestError(400, 'EMAIL_NOT_CONFIRMED', 'The account email must match your confirmed login email.');
      }
      const data = await action(db, req.user.id, req.body, req.user.email);
      res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
    } catch (error) {
      if (error instanceof BookingRequestError) return res.status(error.status).set('Cache-Control', 'no-store').json({ success: false, error: { code: error.code, message: error.message } });
      next(error);
    }
  };
}
