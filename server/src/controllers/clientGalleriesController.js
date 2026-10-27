import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { ClientBookingError } from '../services/clientBookingService.js';
import { SocialImageError } from '../services/clientSocialImageProcessor.js';
import { exportClientSocialImage } from '../services/clientSocialExportService.js';
import { ClientGalleryError, listClientGalleries, getClientGallery, getClientGalleryDownload } from '../services/clientGalleriesService.js';

// Error handling middleware for client galleries routes
function fail(error, res, next) {
  if (error instanceof ClientGalleryError || error instanceof ClientBookingError || error instanceof SocialImageError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}
// Controller functions for client galleries routes
export async function listGalleries(req, res, next) {
  try { return res.json({ success: true, data: await listClientGalleries(createUserSupabaseClient(req.accessToken), req.user.id) }); }
  catch (error) { return fail(error, res, next); }
}
// Controller function to get a specific client gallery by ID
export async function getGallery(req, res, next) {
  try { return res.json({ success: true, data: await getClientGallery(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id) }); }
  catch (error) { return fail(error, res, next); }
}
// Controller function to download a specific media file from a client gallery
export async function downloadMedia(req, res, next) {
  try { return res.json({ success: true, data: await getClientGalleryDownload(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id, req.params.mediaId) }); }
  catch (error) { return fail(error, res, next); }
}

// Streams the in-memory optimized JPEG; never exposes a preview or Storage path.
export async function exportSocialMedia(req, res, next) {
  try {
    if (req.query.size !== 'social') {
      throw new ClientGalleryError(400, 'INVALID_EXPORT_SIZE', 'Please select a valid download quality.');
    }
    const { buffer, fileName } = await exportClientSocialImage(
      createUserSupabaseClient(req.accessToken), req.user.id, req.params.id, req.params.mediaId
    );
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buffer);
  } catch (error) { return fail(error, res, next); }
}
