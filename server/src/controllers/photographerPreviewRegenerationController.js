import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import {
  PreviewRegenerationError,
  inspectPhotographerPreviewRegeneration,
  regeneratePhotographerPreview,
} from '../services/photographerPreviewRegenerationService.js';

function handleError(error, res, next) {
  if (error instanceof PreviewRegenerationError || error instanceof BookingRequestError) {
    return res.status(error.status).set('Cache-Control', 'no-store').json({
      success: false, error: { code: error.code, message: error.message },
    });
  }
  return next(error);
}

export async function previewRegenerationCheck(req, res, next) {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await inspectPhotographerPreviewRegeneration(db, req.user.id, req.params.id, req.params.mediaId);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}

export async function regenerateMediaPreview(req, res, next) {
  if (process.env.ENABLE_MEDIA_PREVIEW_REGENERATION !== 'true') {
    return res.status(503).set('Cache-Control', 'no-store').json({
      success: false, error: { code: 'PREVIEW_REGENERATION_DISABLED', message: 'Preview regeneration is disabled.' },
    });
  }
  if (req.body?.confirm !== 'REGENERATE_PREVIEW') {
    return res.status(400).set('Cache-Control', 'no-store').json({
      success: false, error: { code: 'CONFIRMATION_REQUIRED', message: 'Explicit preview regeneration confirmation is required.' },
    });
  }
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await regeneratePhotographerPreview(db, req.user.id, req.params.id, req.params.mediaId);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}
