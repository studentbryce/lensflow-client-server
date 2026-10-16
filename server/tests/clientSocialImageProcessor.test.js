import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createSocialJpeg, socialFileName, SOCIAL_MAX_INPUT_BYTES, SOCIAL_MAX_EDGE } from '../src/services/clientSocialImageProcessor.js';

test('landscape JPEG becomes <=1080px JPEG without enlargement', async () => {
  const original = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
  const result = await createSocialJpeg(original);
  const meta = await sharp(result).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 648);
  assert.equal(meta.orientation, undefined);
  assert.ok(result.length < original.length * 3); // Content-dependent; avoid assuming huge savings on solid-color images.
});

test('portrait PNG is resized with original aspect ratio', async () => {
  const original = await sharp({ create: { width: 900, height: 1800, channels: 4, background: '#88aacc' } }).png().toBuffer();
  const result = await createSocialJpeg(original);
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 540);
  assert.equal(meta.height, SOCIAL_MAX_EDGE);
  assert.equal(meta.format, 'jpeg');
});

test('small image is never enlarged', async () => {
  const original = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  const meta = await sharp(await createSocialJpeg(original)).metadata();
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 240);
});

test('corrupt image is rejected', async () => {
  await assert.rejects(() => createSocialJpeg(Buffer.from('not an image')), { code: 'IMAGE_PROCESSING_FAILED' });
});

test('oversize image is rejected before decoding', async () => {
  await assert.rejects(() => createSocialJpeg(Buffer.alloc(SOCIAL_MAX_INPUT_BYTES + 1)), { code: 'IMAGE_TOO_LARGE' });
});

test('filenames are sanitized and converted to JPG', () => {
  assert.equal(socialFileName('Summer Photo.PNG'), 'Summer Photo-social.jpg');
  assert.equal(socialFileName('a\r\nInjected.jpg'), 'a--Injected-social.jpg');
});
