/** User-JWT scoped client image export. No service-role key and no Storage writes. */
import { findAuthenticatedClient } from './clientBookingService.js';
import { originalPathIsValid } from './mediaPreviewPaths.js';
import { ClientGalleryError } from './clientGalleriesService.js';
import { createSocialJpeg, socialFileName, SOCIAL_MAX_INPUT_BYTES, SocialImageError } from './clientSocialImageProcessor.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function exportClientSocialImage(db, userId, galleryId, mediaId) {
  if (!UUID.test(galleryId || '') || !UUID.test(mediaId || '')) {
    throw new ClientGalleryError(400, 'INVALID_ID', 'A valid gallery and photo are required.');
  }
  const clientId = await findAuthenticatedClient(db, userId);
  const { data: gallery, error: galleryError } = await db.from('galleries')
    .select('gallery_id,photographer_id,client_id,is_published,allow_downloads')
    .eq('gallery_id', galleryId).eq('client_id', clientId).eq('is_published', true).maybeSingle();
  if (galleryError) throw galleryError;
  if (!gallery) throw new ClientGalleryError(404, 'GALLERY_NOT_FOUND', 'Gallery not found or not available.');
  if (gallery.allow_downloads !== true) {
    throw new ClientGalleryError(403, 'DOWNLOADS_DISABLED', 'Downloads are disabled for this gallery.');
  }
  const { data: item, error: mediaError } = await db.from('media')
    .select('media_id,gallery_id,photographer_id,file_name,storage_path,media_type,mime_type,file_size,is_downloadable')
    .eq('media_id', mediaId).eq('gallery_id', galleryId)
    .eq('photographer_id', gallery.photographer_id).maybeSingle();
  if (mediaError) throw mediaError;
  if (!item) throw new ClientGalleryError(404, 'MEDIA_NOT_FOUND', 'Photo not found.');
  if (item.is_downloadable !== true) {
    throw new ClientGalleryError(403, 'DOWNLOADS_DISABLED', 'Downloads are disabled for this photo.');
  }
  if (item.media_type !== 'image') {
    throw new ClientGalleryError(415, 'NOT_AN_IMAGE', 'Social media optimization is available for photos only.');
  }
  if (!originalPathIsValid(item.storage_path, gallery.photographer_id, galleryId)) {
    throw new ClientGalleryError(404, 'MEDIA_NOT_FOUND', 'Photo file not found.');
  }
  if (Number(item.file_size) > SOCIAL_MAX_INPUT_BYTES) {
    throw new SocialImageError(413, 'IMAGE_TOO_LARGE', 'This photo is too large to optimize. Please download the original instead.');
  }
  // Supabase Storage applies the same JWT and SELECT RLS to this download.
  const { data: original, error: storageError } = await db.storage.from('client-media').download(item.storage_path);
  if (storageError || !original) {
    throw new ClientGalleryError(404, 'MEDIA_NOT_FOUND', 'This photo is currently unavailable.');
  }
  if (original.size > SOCIAL_MAX_INPUT_BYTES) {
    throw new SocialImageError(413, 'IMAGE_TOO_LARGE', 'This photo is too large to optimize. Please download the original instead.');
  }
  const buffer = await createSocialJpeg(Buffer.from(await original.arrayBuffer()));
  return { buffer, fileName: socialFileName(item.file_name) };
}
