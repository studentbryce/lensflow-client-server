/**
 * Choose at most one original photo for each gallery cover.
 * Media are supplied in upload order by the existing Express endpoint.
 * Do not fall back to watermarked previews on the photographer overview.
 */
export function selectGalleryCoverMedia(galleries, media) {
  const galleryIds = new Set(galleries.map((gallery) => gallery.gallery_id));
  const selected = new Set();
  const covers = [];

  for (const item of media) {
    if (
      item.media_type !== "image" ||
      !item.storage_path ||
      !galleryIds.has(item.gallery_id) ||
      selected.has(item.gallery_id)
    ) continue;

    selected.add(item.gallery_id);
    covers.push(item);
  }
  return covers;
}
