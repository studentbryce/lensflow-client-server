import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../src/pages/photographer/GalleryDetails.jsx', import.meta.url), 'utf8');
test('upload preview warning explains the saved original and retry', () => {
  assert.match(source, /Photo uploaded — preview not ready/);
  assert.match(source, /Your original photo is safe/);
  assert.match(source, /Select Retry preview below to try again/);
});
test('upload preview warning does not expose internal Express setting', () => {
  assert.doesNotMatch(source, /after checking Express/);
  assert.doesNotMatch(source, /preview could not be generated: \${message}/);
});
test('media card uses friendly recovery labels', () => {
  assert.match(source, /Preview not ready — photo saved/);
  assert.match(source, /Preview not ready/);
});
