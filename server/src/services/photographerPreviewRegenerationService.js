/**
 * Explicit, single-image preview regeneration. Uses the caller's RLS-scoped
 * Supabase client. Backs up the existing preview before overwriting that same
 * preview path; NEVER writes/deletes the original or changes media rows.
 *
 * The exact deterministic preview path is required by the production Storage
 * client SELECT policy. Do not change it to a versioned path without a separate
 * RLS migration.
 */
import { randomUUID, createHash } from 'node:crypto';
import { resolvePhotographer } from './photographerBookingFormService.js';
import { createWatermarkedPreview } from './imagePreviewProcessor.js';
import { isUuid, originalPathIsValid, previewPathForMedia, watermarkForBusiness, MAX_IMAGE_BYTES } from './mediaPreviewPaths.js';

export class PreviewRegenerationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => { throw new PreviewRegenerationError(status, code, message); };
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

async function one(query, label) {
  const { data, error } = await query;
  if (error) { const err = new Error(`Unable to verify ${label}.`); err.cause = error; throw err; }
  return data;
}
async function readObject(bucket, path, code) {
  const { data, error } = await bucket.download(path);
  if (error || !data) fail(409, code, 'Required private Storage object is unavailable.');
  return Buffer.from(await data.arrayBuffer());
}
async function context(db, userId, galleryId, mediaId) {
  if (!isUuid(galleryId) || !isUuid(mediaId)) fail(400, 'INVALID_ID', 'Valid gallery and media IDs are required.');
  const photographer = await resolvePhotographer(db, userId);
  const photographerId = photographer.photographer_id;
  const gallery = await one(db.from('galleries').select('gallery_id')
    .eq('gallery_id', galleryId).eq('photographer_id', photographerId).maybeSingle(), 'gallery ownership');
  if (!gallery) fail(404, 'GALLERY_NOT_FOUND', 'Gallery not found.');
  const media = await one(db.from('media')
    .select('media_id,gallery_id,photographer_id,media_type,mime_type,file_size,storage_path,thumbnail_path')
    .eq('media_id', mediaId).eq('gallery_id', galleryId)
    .eq('photographer_id', photographerId).maybeSingle(), 'media ownership');
  if (!media) fail(404, 'MEDIA_NOT_FOUND', 'Media not found.');
  if (media.media_type !== 'image' || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(media.mime_type)) {
    fail(415, 'UNSUPPORTED_MEDIA', 'Only JPEG, PNG and WebP originals can be regenerated.');
  }
  if (!Number.isSafeInteger(media.file_size) || media.file_size <= 0 || media.file_size > MAX_IMAGE_BYTES) {
    fail(413, 'IMAGE_TOO_LARGE', 'Original image exceeds the 25 MiB limit.');
  }
  if (!originalPathIsValid(media.storage_path, photographerId, galleryId)) {
    fail(409, 'INVALID_ORIGINAL_PATH', 'The registered original path is invalid.');
  }
  const expectedPath = previewPathForMedia(photographerId, galleryId, mediaId);
  if (media.thumbnail_path !== expectedPath) {
    fail(409, 'PREVIEW_PATH_MISMATCH', 'An existing deterministic preview is required; no preview path was changed.');
  }
  return { photographer, media, expectedPath, bucket: db.storage.from('client-media') };
}

/** Read-only check. Downloads only the existing private preview. */
export async function inspectPhotographerPreviewRegeneration(db, userId, galleryId, mediaId) {
  const { media, expectedPath, bucket } = await context(db, userId, galleryId, mediaId);
  const existing = await readObject(bucket, expectedPath, 'PREVIEW_UNAVAILABLE');
  if (!existing.length || existing.length > MAX_IMAGE_BYTES) fail(409, 'PREVIEW_INVALID', 'Existing preview size is invalid.');
  const original = await readObject(bucket, media.storage_path, 'ORIGINAL_UNAVAILABLE');
  if (!original.length || original.length > MAX_IMAGE_BYTES) fail(413, 'IMAGE_TOO_LARGE', 'Original image exceeds the 25 MiB limit.');
  return {
    media_id: media.media_id,
    thumbnail_path: expectedPath,
    existing_preview_bytes: existing.length,
    existing_preview_sha256: digest(existing),
    original_bytes: original.length,
    original_sha256: digest(original),
    safe_to_attempt: true,
    writes_performed: false,
  };
}

/** One explicitly confirmed, gated replacement. Never removes originals. */
export async function regeneratePhotographerPreview(db, userId, galleryId, mediaId, {
  processor = createWatermarkedPreview,
  newId = randomUUID,
} = {}) {
  const { photographer, media, expectedPath, bucket } = await context(db, userId, galleryId, mediaId);
  const oldPreview = await readObject(bucket, expectedPath, 'PREVIEW_UNAVAILABLE');
  if (!oldPreview.length || oldPreview.length > MAX_IMAGE_BYTES) fail(409, 'PREVIEW_INVALID', 'Existing preview size is invalid.');
  const original = await readObject(bucket, media.storage_path, 'ORIGINAL_UNAVAILABLE');
  if (!original.length || original.length > MAX_IMAGE_BYTES) fail(413, 'IMAGE_TOO_LARGE', 'Original image exceeds the 25 MiB limit.');
  const originalHash = digest(original);
  const rendered = await processor(original, { watermarkText: watermarkForBusiness(photographer.business_name) });
  if (!rendered || !Buffer.isBuffer(rendered.buffer) || !rendered.buffer.length ||
      rendered.contentType !== 'image/webp' || !Number.isSafeInteger(rendered.width) ||
      !Number.isSafeInteger(rendered.height) || rendered.width < 1 || rendered.height < 1 ||
      rendered.width > 1600 || rendered.height > 1600) {
    fail(422, 'INVALID_GENERATED_PREVIEW', 'Generated preview is invalid; no files were changed.');
  }
  const newHash = digest(rendered.buffer);
  if (newHash === digest(oldPreview)) fail(409, 'PREVIEW_UNCHANGED', 'Generated preview is identical; no files were changed.');

  // Backups are NOT referenced by media.thumbnail_path and therefore are not
  // readable by clients under the verified exact-path Storage SELECT policy.
  const backupPath = `${media.photographer_id}/${media.gallery_id}/previews/backups/${media.media_id}/${newId()}.webp`;
  const { error: backupError } = await bucket.upload(backupPath, oldPreview, {
    contentType: 'image/webp', cacheControl: '60', upsert: false,
  });
  if (backupError) fail(502, 'BACKUP_FAILED', 'Unable to back up old preview. The current preview was not overwritten.');
  const backupCheck = await readObject(bucket, backupPath, 'BACKUP_VERIFY_FAILED');
  if (digest(backupCheck) !== digest(oldPreview)) {
    fail(502, 'BACKUP_VERIFY_FAILED', 'Backup verification failed. The current preview was not overwritten.');
  }

  // Same path means the existing exact-match Storage RLS remains valid and no
  // media row update is needed. Backup remains available for manual recovery.
  const { error: overwriteError } = await bucket.upload(expectedPath, rendered.buffer, {
    contentType: 'image/webp', cacheControl: '60', upsert: true,
  });
  if (overwriteError) {
    fail(502, 'OVERWRITE_FAILED', `Preview replacement failed; backup was saved at ${backupPath}. Check current object before retrying.`);
  }
  let replacement;
  try {
    replacement = await readObject(bucket, expectedPath, 'REPLACEMENT_VERIFY_FAILED');
  } catch (error) {
    if (error instanceof PreviewRegenerationError) {
      fail(502, 'REPLACEMENT_VERIFY_FAILED', `Preview was uploaded but read-back failed. Backup retained at ${backupPath}; inspect Storage before retrying.`);
    }
    throw error;
  }
  if (digest(replacement) !== newHash) {
    fail(502, 'REPLACEMENT_VERIFY_FAILED', `Preview read-back did not match. Backup retained at ${backupPath}; inspect Storage before any retry.`);
  }
  return {
    media_id: media.media_id,
    thumbnail_path: expectedPath,
    backup_path: backupPath,
    original_unchanged: true,
    original_sha256_before: originalHash,
    previous_preview_sha256: digest(oldPreview),
    new_preview_sha256: newHash,
    width: rendered.width,
    height: rendered.height,
    content_type: 'image/webp',
  };
}
