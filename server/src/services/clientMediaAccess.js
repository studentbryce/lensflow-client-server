/**
 * Client display decisions must be made on the server, never in React.
 * - Download-approved media can be viewed in original quality.
 * - View-only images can be viewed ONLY via a generated watermarked preview.
 * - View-only videos are unavailable until a protected video preview exists.
 * These decisions do NOT replace Supabase Storage RLS. Apply the matching
 * Storage SELECT policy before treating original-file access as protected.
 */
import { originalPathIsValid, previewPathForMedia, isUuid } from './mediaPreviewPaths.js';

// Helper function to determine the display asset for a media item in a gallery, based on ownership, download permissions, and media type
export function clientDisplayAsset(item, gallery) {
  if (!item || !gallery || !isUuid(item.media_id) || !isUuid(item.gallery_id)
      || !isUuid(item.photographer_id) || item.gallery_id !== gallery.gallery_id
      || item.photographer_id !== gallery.photographer_id) return null;

  const approved = gallery.allow_downloads === true && item.is_downloadable === true;
  if (approved) {
    if (!originalPathIsValid(item.storage_path, item.photographer_id, item.gallery_id)) return null;
    // Keep signed original URLs short-lived: download permission can change.
    return { path: item.storage_path, expiresIn: 60 };
  }

  if (item.media_type !== 'image') return null;
  const expected = previewPathForMedia(item.photographer_id, item.gallery_id, item.media_id);
  if (item.thumbnail_path !== expected) return null;
  return { path: expected, expiresIn: 300 };
}
