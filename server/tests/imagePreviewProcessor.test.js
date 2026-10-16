import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createWatermarkedPreview, ImagePreviewError } from '../src/services/imagePreviewProcessor.js';

test('produces a reduced watermarked WebP without changing the original bytes', async () => {
  const original = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#556677' } }).png().toBuffer();
  const snapshot = Buffer.from(original);
  const result = await createWatermarkedPreview(original, { watermarkText: 'LensFlow Proof' });
  assert.equal(result.contentType, 'image/webp');
  assert.equal(result.extension, 'webp');
  assert.equal(result.width, 1600);
  assert.equal(result.height, 1067);
  assert.deepEqual(original, snapshot);
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, result.width);
  assert.equal(meta.height, result.height);
  const withoutMark = await sharp(original).resize({ width: 1600, height: 1600, fit: 'inside' }).webp({ quality: 78 }).toBuffer();
  assert.notDeepEqual(result.buffer, withoutMark);
});

test('does not upscale small photographs', async () => {
  const input = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
  const output = await createWatermarkedPreview(input);
  assert.equal(output.width, 320);
  assert.equal(output.height, 240);
});

test('rejects invalid image content and watermark text', async () => {
  await assert.rejects(() => createWatermarkedPreview(Buffer.from('not an image')), ImagePreviewError);
  const input = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#eeeeee' } }).png().toBuffer();
  await assert.rejects(() => createWatermarkedPreview(input, { watermarkText: '<'.repeat(49) }), ImagePreviewError);
  const output = await createWatermarkedPreview(input, { watermarkText: '<Proof & Review>' });
  assert.equal(output.width, 600);
});

test('watermark uses one solid, 50% opacity fill without outlined lettering', async () => {
  const { buildWatermarkSvg } = await import('../src/services/imagePreviewProcessor.js');
  const svg = buildWatermarkSvg(1238, 1600, 'RLS Test Photography').toString('utf8');
  assert.match(svg, /fill="#E6E6E650"/);
  assert.doesNotMatch(svg, /fill-opacity|stroke=|stroke-opacity|opacity=/);
  assert.match(svg, /patternTransform="rotate\(-28\)"/);
  assert.match(svg, /RLS Test Photography/);
});

test('repeated labels have generous spacing and longer names receive wider tiles', async () => {
  const { buildWatermarkSvg } = await import('../src/services/imagePreviewProcessor.js');
  const shortSvg = buildWatermarkSvg(1238, 1600, 'Photo').toString('utf8');
  const longSvg = buildWatermarkSvg(1238, 1600, 'RLS Test Photography').toString('utf8');
  const width = svg => Number(svg.match(/<pattern id="wm" width="(\d+)"/)[1]);
  const height = svg => Number(svg.match(/<pattern id="wm" width="\d+" height="(\d+)"/)[1]);
  assert.ok(width(longSvg) > width(shortSvg));
  assert.ok(width(longSvg) > 500, 'label repetitions should be separated');
  assert.ok(height(longSvg) >= 200, 'diagonal rows should be separated');
});

test('updated watermark is visibly composited on a preview and leaves original unchanged', async () => {
  const original = await sharp({ create: { width: 1238, height: 1600, channels: 3, background: '#283828' } }).png().toBuffer();
  const snapshot = Buffer.from(original);
  const result = await createWatermarkedPreview(original, { watermarkText: 'RLS Test Photography' });
  assert.deepEqual(original, snapshot);
  const preview = await sharp(result.buffer).raw().toBuffer();
  const plain = await sharp(original).webp({ quality: 78, effort: 4 }).raw().toBuffer();
  assert.notDeepEqual(preview, plain);
  assert.equal(result.width, 1238);
  assert.equal(result.height, 1600);
});
