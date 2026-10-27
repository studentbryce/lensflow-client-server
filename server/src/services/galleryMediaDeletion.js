import { BookingRequestError } from './bookingCreateService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 100;
const reject = (message) => { throw new BookingRequestError(409, 'INVALID_MEDIA_PATH', message); };

// Only delete paths registered in owned media rows. Do not delete regeneration
// backups, unregistered objects, or anything outside the exact gallery prefix.
// Main function to validate and return the registered gallery media paths for deletion, ensuring they belong to the specified photographer and gallery
export function registeredGalleryMediaPaths(items, photographerId, galleryId) {
  if (!UUID.test(photographerId || '') || !UUID.test(galleryId || '')) {
    reject('Unable to verify gallery ownership. Nothing was deleted.');
  }
  const prefix = `${photographerId}/${galleryId}/`;
  const paths = new Set();
  for (const item of items) {
    if (item.photographer_id !== photographerId || item.gallery_id !== galleryId) {
      reject('A media record does not belong to this gallery. Nothing was deleted.');
    }
    if (!UUID.test(item.media_id || '')) reject('Invalid media identifier. Nothing was deleted.');
    const original = item.storage_path;
    if (typeof original !== 'string' || !original.startsWith(prefix) ||
        !original.slice(prefix.length) || original.slice(prefix.length).includes('/') ||
        original.includes('..') || original.includes('\\')) {
      reject('Invalid original file path. Nothing was deleted.');
    }
    paths.add(original);
    if (item.thumbnail_path != null) {
      const expected = `${prefix}previews/${item.media_id}.webp`;
      if (item.media_type !== 'image' || item.thumbnail_path !== expected) {
        reject('Invalid registered preview path. Nothing was deleted.');
      }
      paths.add(expected);
    }
  }
  return [...paths];
}

// Uses the authenticated user's Supabase client, not the service-role key.
// Storage and PostgreSQL are not a single transaction; retry is supported if
// an intermediate step fails, but callers must not report success on error.
// Main function to remove the registered gallery media files from Supabase Storage in batches, handling errors and retries
export async function removeRegisteredGalleryFiles(db, paths) {
  for (let offset=0; offset<paths.length; offset+=BATCH_SIZE) {
    const batch = paths.slice(offset,offset+BATCH_SIZE);
    let result;
    try { result = await db.storage.from('client-media').remove(batch); }
    catch (cause) {
      const error = new BookingRequestError(502,'STORAGE_DELETE_FAILED','Could not remove the gallery files. Please try again.');
      error.cause=cause;
      throw error;
    }
    if (result?.error) {
      const error = new BookingRequestError(502,'STORAGE_DELETE_FAILED','Could not remove the gallery files. Please try again.');
      error.cause=result.error;
      throw error;
    }
  }
}
