import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredGalleryMediaPaths, removeRegisteredGalleryFiles } from '../src/services/galleryMediaDeletion.js';
const p='07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const g='5595d51e-1a03-4190-949e-fecf5d38f610';
const m='89e3c5af-eb76-4e43-949d-5bed4dcd0bcc';
const row={photographer_id:p,gallery_id:g,media_id:m,media_type:'image',storage_path:`${p}/${g}/photo.jpg`,thumbnail_path:`${p}/${g}/previews/${m}.webp`};
test('registered original and preview only',()=>assert.deepEqual(registeredGalleryMediaPaths([row],p,g),[row.storage_path,row.thumbnail_path]));
test('video original only',()=>assert.deepEqual(registeredGalleryMediaPaths([{...row,media_type:'video',thumbnail_path:null}],p,g),[row.storage_path]));
test('empty gallery has no paths',()=>assert.deepEqual(registeredGalleryMediaPaths([],p,g),[]));
test('reject other photographer',()=>assert.throws(()=>registeredGalleryMediaPaths([{...row,photographer_id:g}],p,g),/does not belong/));
test('reject nested original',()=>assert.throws(()=>registeredGalleryMediaPaths([{...row,storage_path:`${p}/${g}/other/photo.jpg`}],p,g),/original file path/));
test('reject traversal',()=>assert.throws(()=>registeredGalleryMediaPaths([{...row,storage_path:`${p}/${g}/../photo.jpg`}],p,g),/original file path/));
test('reject unregistered backup',()=>assert.throws(()=>registeredGalleryMediaPaths([{...row,thumbnail_path:`${p}/${g}/previews/backups/${m}.webp`}],p,g),/preview path/));
test('reject wrong preview ID',()=>assert.throws(()=>registeredGalleryMediaPaths([{...row,thumbnail_path:`${p}/${g}/previews/${g}.webp`}],p,g),/preview path/));
test('storage failure stops processing', async () => {
  let calls = 0;
  const db = { storage: { from: () => ({ remove: async () => {
    calls++;
    return { error: new Error('denied') };
  } }) } };
  await assert.rejects(removeRegisteredGalleryFiles(db, [row.storage_path]), /Could not remove/);
  assert.equal(calls, 1);
});
test('storage deletes in batches', async () => {
  const batches = [];
  const db = { storage: { from: () => ({ remove: async (paths) => {
    batches.push(paths);
    return { data: paths, error: null };
  } }) } };
  await removeRegisteredGalleryFiles(db, Array.from({ length: 201 }, (_, i) => `file${i}`));
  assert.deepEqual(batches.map(x => x.length), [100, 100, 1]);
});
