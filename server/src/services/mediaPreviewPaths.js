/** Path and input validation for private client-media previews. No DB or Storage side effects. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function originalPathIsValid(path, photographerId, galleryId) {
  if (!isUuid(photographerId) || !isUuid(galleryId) || typeof path !== 'string') return false;
  const prefix = `${photographerId}/${galleryId}/`;
  if (!path.startsWith(prefix) || path.length > 1024 || path.includes('\\') || path.includes('..')) return false;
  const relative = path.slice(prefix.length);
  // Generated previews must never be treated as an original.
  return !!relative && !relative.startsWith('previews/') && !relative.split('/').some(part => !part || part === '.' || part === '..');
}

export function previewPathForMedia(photographerId, galleryId, mediaId) {
  if (![photographerId, galleryId, mediaId].every(isUuid)) throw new TypeError('Valid media identifiers are required.');
  return `${photographerId}/${galleryId}/previews/${mediaId}.webp`;
}

export function watermarkForBusiness(businessName) {
  const cleaned = typeof businessName === 'string' ? businessName.replace(/\s+/g, ' ').trim() : '';
  return (cleaned || 'LensFlow Preview').slice(0, 48);
}
