import { BookingRequestError } from '../services/bookingCreateService.js';

/**
 * The Website API contains handlers with different service signatures:
 *   collection reads: (db, userId)
 *   collection writes: (db, userId, body)
 *   item deletes: (db, userId, id)
 *   item updates: (db, userId, id, body)
 * Do not blindly pass req.params.id to collection-write services.
 */

// Generic wrapper to create handlers for photographer website operations
export function createWebsiteHandler(fn, createDb, { status = 200, mode = 'read' } = {}) {
  if (!['read', 'body', 'item', 'itemBody'].includes(mode)) {
    throw new TypeError(`Unsupported website handler mode: ${mode}`);
  }
  return async (req, res, next) => {
    try {
      const db = createDb(req.accessToken);
      const args = [db, req.user.id];
      if (mode === 'item' || mode === 'itemBody') args.push(req.params.id);
      if (mode === 'body' || mode === 'itemBody') args.push(req.body);
      const data = await fn(...args);
      return res.status(status).set('Cache-Control', 'no-store').json({ success: true, data });
    } catch (error) {
      if (error instanceof BookingRequestError) {
        return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
      }
      if (error.cause?.code === '23505') {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A website slug or ordering value already exists.' } });
      }
      return next(error);
    }
  };
}
