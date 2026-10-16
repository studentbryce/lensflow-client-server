/** Client galleries. All queries/storage signatures use the verified
 * user's Supabase JWT, never a service-role client or browser-supplied client ID/path.
 * Database RLS enforces paid invoice + successful payment + published status. */
import { findAuthenticatedClient } from './clientBookingService.js';
import { clientDisplayAsset } from './clientMediaAccess.js';
import { originalPathIsValid } from './mediaPreviewPaths.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 250;
const GALLERY_FIELDS = 'gallery_id,photographer_id,client_id,booking_id,name,description,is_published,allow_downloads,created_at,updated_at';
const BOOKING_FIELDS = 'booking_id,booking_date,start_time,end_time,location,status,total_amount';
const MEDIA_FIELDS = 'media_id,gallery_id,photographer_id,file_name,storage_path,media_type,mime_type,file_size,thumbnail_path,is_downloadable,uploaded_at';

export class ClientGalleryError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function dbError(label, cause) {
  const error = new Error(`Unable to load ${label}.`);
  error.cause = cause;
  return error;
}
async function read(query, label) {
  const { data, error } = await query;
  if (error) throw dbError(label, error);
  return data;
}
function validId(id, label = 'gallery') {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new ClientGalleryError(400, 'INVALID_ID', `A valid ${label} ID is required.`);
  }
  return id;
}
async function readAll(queryBuilder, label) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const batch = await read(queryBuilder().range(offset, offset + PAGE_SIZE - 1), label) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}
async function signPreview(db, asset) {
  if (!asset) return null;
  const { data, error } = await db.storage.from('client-media').createSignedUrl(asset.path, asset.expiresIn);
  if (error) return null; // Keep the gallery usable if a preview is unavailable.
  return data?.signedUrl ?? null;
}
async function ownedGallery(db, clientId, galleryId) {
  const gallery = await read(db.from('galleries').select(GALLERY_FIELDS)
    .eq('gallery_id', validId(galleryId)).eq('client_id', clientId)
    .eq('is_published', true).maybeSingle(), 'gallery');
  // A hidden, unpaid, unpublished or foreign gallery always looks unavailable.
  if (!gallery) throw new ClientGalleryError(404, 'GALLERY_NOT_FOUND', 'Gallery not found or not available.');
  return gallery;
}
export async function listClientGalleries(db, userId) {
  const clientId = await findAuthenticatedClient(db, userId);
  const galleries = await readAll(() => db.from('galleries').select(GALLERY_FIELDS)
    .eq('client_id', clientId).eq('is_published', true)
    .order('updated_at', { ascending: false }).order('gallery_id', { ascending: false }), 'galleries');
  if (!galleries.length) return { galleries: [], media: [] };
  const bookingIds = [...new Set(galleries.map(g => g.booking_id).filter(Boolean))];
  const bookings = [];
  for (let i = 0; i < bookingIds.length; i += 100) {
    const ids = bookingIds.slice(i, i + 100);
    bookings.push(...await readAll(() => db.from('bookings').select(BOOKING_FIELDS)
      .eq('client_id', clientId).in('booking_id', ids).order('booking_id'), 'bookings'));
  }
  const media = [];
  for (let i = 0; i < galleries.length; i += 100) {
    const ids = galleries.slice(i, i + 100).map(g => g.gallery_id);
    media.push(...await readAll(() => db.from('media').select(MEDIA_FIELDS)
      .in('gallery_id', ids).order('uploaded_at', { ascending: true })
      .order('media_id', { ascending: true }), 'gallery media'));
  }
  const bookingMap = new Map(bookings.map(b => [b.booking_id, b]));
  const galleryMap = new Map(galleries.map(g => [g.gallery_id, g]));
  const firstImage = new Map();
  for (const item of media) {
    const gallery = galleryMap.get(item.gallery_id);
    if (item.media_type === 'image' && gallery && !firstImage.has(item.gallery_id)
        && clientDisplayAsset(item, gallery)) {
      firstImage.set(item.gallery_id, item);
    }
  }
  const enriched = await Promise.all(galleries.map(async g => {
    const item = firstImage.get(g.gallery_id);
    const url = item ? await signPreview(db, clientDisplayAsset(item, g)) : null;
    return { ...g, booking: bookingMap.get(g.booking_id) ?? null,
      thumbnail: url ? { url, mediaId: item.media_id, fileName: item.file_name } : null };
  }));
  // No storage paths or private bank data needed by the gallery list.
  return { galleries: enriched, media: media.map(({ gallery_id, media_id, media_type }) => ({ gallery_id, media_id, media_type })) };
}
export async function getClientGallery(db, userId, galleryId) {
  validId(galleryId);
  const clientId = await findAuthenticatedClient(db, userId);
  const gallery = await ownedGallery(db, clientId, galleryId);
  const booking = gallery.booking_id ? await read(db.from('bookings').select(BOOKING_FIELDS)
    .eq('client_id', clientId).eq('booking_id', gallery.booking_id).maybeSingle(), 'booking') : null;
  const media = await readAll(() => db.from('media').select(MEDIA_FIELDS)
    .eq('gallery_id', gallery.gallery_id).order('uploaded_at', { ascending: true })
    .order('media_id', { ascending: true }), 'gallery media');
  const previews = await Promise.all(media.map(async item => ({
    ...item, storage_path: undefined, thumbnail_path: undefined,
    previewUrl: await signPreview(db, clientDisplayAsset(item, gallery)),
  })));
  return { gallery, booking, media: previews };
}
export async function getClientGalleryDownload(db, userId, galleryId, mediaId) {
  validId(galleryId);
  validId(mediaId, 'media');
  const clientId = await findAuthenticatedClient(db, userId);
  const gallery = await ownedGallery(db, clientId, galleryId);
  if (!gallery.allow_downloads) {
    throw new ClientGalleryError(403, 'DOWNLOADS_DISABLED', 'Downloads are disabled for this gallery.');
  }
  const item = await read(db.from('media').select('media_id,gallery_id,photographer_id,file_name,storage_path,is_downloadable')
    .eq('gallery_id', gallery.gallery_id).eq('media_id', mediaId).maybeSingle(), 'media');
  if (!item) throw new ClientGalleryError(404, 'MEDIA_NOT_FOUND', 'Media not found.');
  if (item.is_downloadable !== true) {
    throw new ClientGalleryError(403, 'DOWNLOADS_DISABLED', 'Downloads are disabled for this file.');
  }
  if (item.photographer_id !== gallery.photographer_id ||
      !originalPathIsValid(item.storage_path, gallery.photographer_id, gallery.gallery_id)) {
    throw new ClientGalleryError(404, 'MEDIA_NOT_FOUND', 'Media file not found.');
  }
  const { data, error } = await db.storage.from('client-media').createSignedUrl(item.storage_path, 60);
  if (error || !data?.signedUrl) throw dbError('download link', error);
  return { url: data.signedUrl, fileName: item.file_name };
}
