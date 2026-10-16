import test from 'node:test';
import assert from 'node:assert/strict';
import { originalPathIsValid, previewPathForMedia, watermarkForBusiness } from '../src/services/mediaPreviewPaths.js';
const p='11111111-1111-4111-8111-111111111111';
const g='22222222-2222-4222-8222-222222222222';
const m='33333333-3333-4333-8333-333333333333';
test('accepts gallery-owned original paths', () => {
  assert.equal(originalPathIsValid(`${p}/${g}/originals/photo.jpg`,p,g),true);
  assert.equal(originalPathIsValid(`${p}/${g}/photo.jpg`,p,g),true);
});
test('rejects other gallery, preview and traversal paths', () => {
  for(const path of [`${p}/${m}/photo.jpg`, `${p}/${g}/previews/${m}.webp`,
    `${p}/${g}/../photo.jpg`, `${p}/${g}/a\\b.jpg`, `${p}/${g}/`, `${p}/${g}//photo.jpg`]) {
    assert.equal(originalPathIsValid(path,p,g),false,path);
  }
});
test('preview paths are deterministic and scoped', () => {
  assert.equal(previewPathForMedia(p,g,m),`${p}/${g}/previews/${m}.webp`);
  assert.throws(()=>previewPathForMedia(p,g,'not-a-uuid'),TypeError);
});
test('watermark text is normalized and bounded', () => {
  assert.equal(watermarkForBusiness('  My  Studio\nPhotography  '),'My Studio Photography');
  assert.equal(watermarkForBusiness(''), 'LensFlow Preview');
  assert.equal(watermarkForBusiness('x'.repeat(100)).length,48);
});
