/** Path and input validation for private client-media previews. No DB or Storage side effects. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// Main function to check if a given value is a valid UUID string
export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

// Main function to validate if a given path is a valid original media path for a specific photographer and gallery
export function originalPathIsValid(path, photographerId, galleryId) {
  if (!isUuid(photographerId) || !isUuid(galleryId) || typeof path !== 'string') return false;
  const prefix = `${photographerId}/${galleryId}/`;
  if (!path.startsWith(prefix) || path.length > 1024 || path.includes('\\') || path.includes('..')) return false;
  const relative = path.slice(prefix.length);
  // Generated previews must never be treated as an original.
  return !!relative && !relative.startsWith('previews/') && !relative.split('/').some(part => !part || part === '.' || part === '..');
}

// Main function to validate if a given path is a valid preview media path for a specific photographer, gallery, and media item
export function previewPathForMedia(photographerId, galleryId, mediaId) {
  if (![photographerId, galleryId, mediaId].every(isUuid)) throw new TypeError('Valid media identifiers are required.');
  return `${photographerId}/${galleryId}/previews/${mediaId}.webp`;
}

// Main function to generate a watermark text for a business name, ensuring it is cleaned and truncated to a maximum length
export function watermarkForBusiness(businessName) {
  const cleaned = typeof businessName === 'string' ? businessName.replace(/\s+/g, ' ').trim() : '';
  return (cleaned || 'LensFlow Preview').slice(0, 48);
}
