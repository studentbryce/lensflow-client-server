/**
 * Generate ONE private watermarked image preview on explicit photographer request.
 * Uses the authenticated caller's Supabase client, preserving RLS (no service role).
 * Does not change existing originals, gallery permissions or Storage policies.
 */
import { resolvePhotographer } from './photographerBookingFormService.js';
import { createWatermarkedPreview } from './imagePreviewProcessor.js';
import { isUuid, originalPathIsValid, previewPathForMedia, watermarkForBusiness, MAX_IMAGE_BYTES } from './mediaPreviewPaths.js';

export class MediaPreviewRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const reject = (status, code, message) => { throw new MediaPreviewRequestError(status, code, message); };

async function one(query, label) {
  const { data, error } = await query;
  if (error) { const err = new Error(`Unable to verify ${label}.`); err.cause = error; throw err; }
  return data;
}

export async function generatePhotographerImagePreview(db, userId, galleryId, mediaId, {
  processor = createWatermarkedPreview,
} = {}) {
  if (!isUuid(galleryId) || !isUuid(mediaId)) reject(400, 'INVALID_ID', 'Valid gallery and media IDs are required.');
  const photographer = await resolvePhotographer(db, userId);
  const photographerId = photographer.photographer_id;
  const gallery = await one(db.from('galleries').select('gallery_id')
    .eq('gallery_id', galleryId).eq('photographer_id', photographerId).maybeSingle(), 'gallery ownership');
  if (!gallery) reject(404, 'GALLERY_NOT_FOUND', 'Gallery not found.');

  const media = await one(db.from('media')
    .select('media_id,gallery_id,photographer_id,media_type,mime_type,file_size,storage_path,thumbnail_path')
    .eq('media_id', mediaId).eq('gallery_id', galleryId)
    .eq('photographer_id', photographerId).maybeSingle(), 'media ownership');
  if (!media) reject(404, 'MEDIA_NOT_FOUND', 'Media not found.');
  if (media.media_type !== 'image' || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(media.mime_type)) {
    reject(415, 'UNSUPPORTED_MEDIA', 'Watermarked previews currently support JPEG, PNG and WebP images only.');
  }
  if (!Number.isSafeInteger(media.file_size) || media.file_size <= 0 || media.file_size > MAX_IMAGE_BYTES) {
    reject(413, 'IMAGE_TOO_LARGE', 'Image exceeds the 25 MiB processing limit.');
  }
  if (!originalPathIsValid(media.storage_path, photographerId, galleryId)) {
    reject(409, 'INVALID_ORIGINAL_PATH', 'The original media path is invalid.');
  }
  if (media.thumbnail_path) reject(409, 'PREVIEW_EXISTS', 'A preview is already registered for this image.');

  const bucket = db.storage.from('client-media');
  const { data: original, error: downloadError } = await bucket.download(media.storage_path);
  if (downloadError || !original) reject(502, 'ORIGINAL_UNAVAILABLE', 'Unable to retrieve the original image.');
  if (original.size > MAX_IMAGE_BYTES) reject(413, 'IMAGE_TOO_LARGE', 'Image exceeds the 25 MiB processing limit.');
  const input = Buffer.from(await original.arrayBuffer());
  const preview = await processor(input, { watermarkText: watermarkForBusiness(photographer.business_name) });
  const path = previewPathForMedia(photographerId, galleryId, mediaId);
  const { error: uploadError } = await bucket.upload(path, preview.buffer, {
    contentType: 'image/webp', cacheControl: '60', upsert: false,
  });
  if (uploadError) { const err = new Error('Unable to save preview.'); err.cause = uploadError; throw err; }

  // Best-effort cleanup only for the preview just uploaded by this request.
  // Never remove or overwrite the original. A concurrent request may have won
  // the DB update; in that case do not remove a path now referenced by the DB.
  try {
    const updated = await one(db.from('media').update({ thumbnail_path: path })
      .eq('media_id', mediaId).eq('gallery_id', galleryId)
      .eq('photographer_id', photographerId).is('thumbnail_path', null)
      .select('media_id,thumbnail_path').maybeSingle(), 'preview registration');
    if (!updated) {
      // The preview was not registered. The uploaded object may be orphaned;
      // manual reconciliation is safer than deleting a potentially referenced path.
      reject(409, 'PREVIEW_CONFLICT', 'Preview registration changed; check the media record before retrying.');
    }
  } catch (error) {
    // If DB query errored, registration outcome may be unknown. Preserve file
    // for safe reconciliation rather than risk deleting a referenced preview.
    throw error;
  }
  return { media_id: mediaId, thumbnail_path: path, width: preview.width, height: preview.height, content_type: 'image/webp' };
}
