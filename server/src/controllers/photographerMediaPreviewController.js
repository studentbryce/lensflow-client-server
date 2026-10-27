import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { MediaPreviewRequestError, generatePhotographerImagePreview } from '../services/photographerMediaPreviewService.js';
import { BookingRequestError } from '../services/bookingCreateService.js';

// Controller function to generate a media preview for a photographer's media item
export async function generateMediaPreview(req, res, next) {
  // Default OFF: opt in only after confirming the original production project.
  if (process.env.ENABLE_MEDIA_PREVIEW_WRITES !== 'true') {
    return res.status(503).set('Cache-Control', 'no-store').json({
      success: false, error: { code: 'PREVIEW_WRITES_DISABLED', message: 'Preview generation is not enabled.' },
    });
  }
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await generatePhotographerImagePreview(db, req.user.id, req.params.id, req.params.mediaId);
    return res.status(201).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) {
    if (error instanceof MediaPreviewRequestError || error instanceof BookingRequestError) {
      return res.status(error.status).set('Cache-Control', 'no-store').json({
        success: false, error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
}
