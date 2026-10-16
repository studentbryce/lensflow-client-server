import test from 'node:test';
import assert from 'node:assert/strict';
import { needsImagePreview, galleryStoragePathsForRemoval } from '../src/services/galleryPreviewWorkflow.js';
const p = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const g = '5595d51e-1a03-4190-949e-fecf5d38f610';
const m = '89e3c5af-eb76-4e43-949d-5bed4dcd0bcc';
const original = `${p}/${g}/photo.png`;
const preview = `${p}/${g}/previews/${m}.webp`;
test('only images with no thumbnail need a preview', () => {
  assert.equal(needsImagePreview({ media_type: 'image', thumbnail_path: null }), true);
  assert.equal(needsImagePreview({ media_type: 'image', thumbnail_path: preview }), false);
  assert.equal(needsImagePreview({ media_type: 'video', thumbnail_path: null }), false);
});
test('delete helper includes original and deterministic preview', () => {
  assert.deepEqual(galleryStoragePathsForRemoval([{ media_id:m, media_type:'image', storage_path:original, thumbnail_path:preview }],p,g), [original,preview]);
});
test('video deletion includes only original', () => {
  assert.deepEqual(galleryStoragePathsForRemoval([{media_type:'video',storage_path:original}],p,g), [original]);
});
test('cross-gallery original rejected before deletion', () => {
  assert.throws(() => galleryStoragePathsForRemoval([{storage_path:`${p}/other/file.png`}],p,g), /Invalid original/);
});
test('unregistered and backup preview paths are never deleted', () => {
  assert.throws(() => galleryStoragePathsForRemoval([{media_id:m,media_type:'image',storage_path:original,thumbnail_path:`${p}/${g}/previews/backups/${m}/backup.webp`}],p,g), /Unexpected preview/);
});
test('traversal and nested originals are rejected', () => {
  assert.throws(() => galleryStoragePathsForRemoval([{storage_path:`${p}/${g}/../file.png`}],p,g));
  assert.throws(() => galleryStoragePathsForRemoval([{storage_path:`${p}/${g}/nested/file.png`}],p,g));
});
test('wrong owner is rejected', () => {
  assert.throws(() => galleryStoragePathsForRemoval([{photographer_id:g,storage_path:original}],p,g), /Unexpected media owner/);
});
