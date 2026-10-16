import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientGalleryDownload } from '../src/services/clientGalleriesService.js';

const photographer_id = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const gallery_id = '5595d51e-1a03-4190-949e-fecf5d38f610';
const media_id = '89e3c5af-eb76-4e43-949d-5bed4dcd0bcc';
const client_id = 'e741e4bc-11d0-414a-b731-a197f0b9e6e0';
const original = `${photographer_id}/${gallery_id}/photo.png`;

function stubDb({ allow_downloads = true, is_downloadable = true, storage_path = original, media_photographer_id = photographer_id } = {}) {
  const signed = [];
  const rows = {
    clients: { client_id },
    galleries: { gallery_id, client_id, photographer_id, allow_downloads, is_published: true },
    media: { media_id, gallery_id, photographer_id: media_photographer_id, is_downloadable, storage_path, file_name: 'photo.png' },
  };
  return {
    signed,
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: rows[table] ?? null, error: null }; },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'client-media');
        return {
          async createSignedUrl(path, expiry) {
            signed.push({ path, expiry });
            return { data: { signedUrl: 'https://example.invalid/signed' }, error: null };
          },
        };
      },
    },
  };
}

test('explicit download signs only a validated, approved original for 60 seconds', async () => {
  const db = stubDb();
  const result = await getClientGalleryDownload(db, 'authenticated-user', gallery_id, media_id);
  assert.deepEqual(result, { url: 'https://example.invalid/signed', fileName: 'photo.png' });
  assert.deepEqual(db.signed, [{ path: original, expiry: 60 }]);
});

test('gallery-level download denial never calls the Storage signer', async () => {
  const db = stubDb({ allow_downloads: false });
  await assert.rejects(getClientGalleryDownload(db, 'authenticated-user', gallery_id, media_id), { code: 'DOWNLOADS_DISABLED' });
  assert.equal(db.signed.length, 0);
});

test('media-level download denial includes null, never signs', async () => {
  for (const is_downloadable of [false, null]) {
    const db = stubDb({ is_downloadable });
    await assert.rejects(getClientGalleryDownload(db, 'authenticated-user', gallery_id, media_id), { code: 'DOWNLOADS_DISABLED' });
    assert.equal(db.signed.length, 0);
  }
});

test('wrong owner and preview/cross-gallery paths never reach Storage signer', async () => {
  for (const opts of [
    { media_photographer_id: '00000000-0000-0000-0000-000000000000' },
    { storage_path: `${photographer_id}/${gallery_id}/previews/${media_id}.webp` },
    { storage_path: `${photographer_id}/00000000-0000-0000-0000-000000000000/photo.png` },
    { storage_path: `${photographer_id}/${gallery_id}/../photo.png` },
  ]) {
    const db = stubDb(opts);
    await assert.rejects(getClientGalleryDownload(db, 'authenticated-user', gallery_id, media_id), { code: 'MEDIA_NOT_FOUND' });
    assert.equal(db.signed.length, 0);
  }
});
