import test from 'node:test';
import assert from 'node:assert/strict';
import { clientDisplayAsset } from '../server/src/services/clientMediaAccess.js';

const photographer_id = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const gallery_id = '5595d51e-1a03-4190-949e-fecf5d38f610';
const media_id = '89e3c5af-eb76-4e43-949d-5bed4dcd0bcc';
const original = `${photographer_id}/${gallery_id}/example.png`;
const preview = `${photographer_id}/${gallery_id}/previews/${media_id}.webp`;
const image = { media_id, gallery_id, photographer_id, media_type: 'image', is_downloadable: true, storage_path: original, thumbnail_path: preview };
const gallery = { gallery_id, photographer_id, allow_downloads: false };

test('view-only image receives only a watermarked preview', () => {
  assert.deepEqual(clientDisplayAsset(image, gallery), { path: preview, expiresIn: 300 });
});
test('missing preview never falls back to original for view-only media', () => {
  assert.equal(clientDisplayAsset({ ...image, thumbnail_path: null }, gallery), null);
});
test('downloadable media can display original with short expiry', () => {
  assert.deepEqual(clientDisplayAsset(image, { ...gallery, allow_downloads: true }), { path: original, expiresIn: 60 });
});
test('individual download flag blocks original even if gallery allows downloads', () => {
  assert.deepEqual(clientDisplayAsset({ ...image, is_downloadable: false }, { ...gallery, allow_downloads: true }), { path: preview, expiresIn: 300 });
});
test('view-only video without protected preview is unavailable', () => {
  assert.equal(clientDisplayAsset({ ...image, media_type: 'video', thumbnail_path: null }, gallery), null);
});
test('wrong or manipulated preview path cannot be signed', () => {
  assert.equal(clientDisplayAsset({ ...image, thumbnail_path: original }, gallery), null);
  assert.equal(clientDisplayAsset({ ...image, thumbnail_path: `${photographer_id}/${gallery_id}/previews/other.webp` }, gallery), null);
});
test('cross-gallery and malformed original paths cannot be signed', () => {
  assert.equal(clientDisplayAsset({ ...image, gallery_id: '00000000-0000-0000-0000-000000000000' }, gallery), null);
  assert.equal(clientDisplayAsset({ ...image, storage_path: `${photographer_id}/${gallery_id}/previews/${media_id}.webp` }, { ...gallery, allow_downloads: true }), null);
});

test('view-only image preview rejects wrong owner and gallery identifiers', () => {
  assert.equal(clientDisplayAsset({ ...image, photographer_id: '00000000-0000-0000-0000-000000000000' }, gallery), null);
  assert.equal(clientDisplayAsset({ ...image, gallery_id: '00000000-0000-0000-0000-000000000000' }, gallery), null);
});
