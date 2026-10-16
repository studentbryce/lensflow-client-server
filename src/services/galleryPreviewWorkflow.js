/** Pure upload and deletion guards; no Supabase calls. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function needsImagePreview(item) {
  return item?.media_type === 'image' && !item?.thumbnail_path;
}

export function galleryStoragePathsForRemoval(items, photographerId, galleryId) {
  if (!UUID.test(photographerId || '') || !UUID.test(galleryId || '')) {
    throw new Error('Invalid photographer or gallery identifier. Nothing was deleted.');
  }
  const prefix = `${photographerId}/${galleryId}/`;
  const paths = new Set();
  for (const item of items) {
    if (item.photographer_id && item.photographer_id !== photographerId) {
      throw new Error('Unexpected media owner. Nothing was deleted.');
    }
    if (item.gallery_id && item.gallery_id !== galleryId) {
      throw new Error('Unexpected media gallery. Nothing was deleted.');
    }
    const original = item.storage_path;
    if (original) {
      if (typeof original !== 'string' || !original.startsWith(prefix) ||
          original.slice(prefix.length).includes('/') || original.includes('..') || original.includes('\\')) {
        throw new Error('Invalid original media path. Nothing was deleted.');
      }
      paths.add(original);
    }
    if (item.thumbnail_path) {
      const expected = `${prefix}previews/${item.media_id}.webp`;
      if (item.media_type !== 'image' || !UUID.test(item.media_id || '') || item.thumbnail_path !== expected) {
        throw new Error('Unexpected preview path. Nothing was deleted.');
      }
      paths.add(expected);
    }
  }
  return [...paths];
}
