import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  inspectPhotographerPreviewRegeneration,
  regeneratePhotographerPreview,
} from '../src/services/photographerPreviewRegenerationService.js';

const p = '11111111-1111-4111-8111-111111111111';
const g = '22222222-2222-4222-8222-222222222222';
const m = '33333333-3333-4333-8333-333333333333';
const user = '44444444-4444-4444-8444-444444444444';
const originalPath = `${p}/${g}/original.png`;
const previewPath = `${p}/${g}/previews/${m}.webp`;
const sha = b => createHash('sha256').update(b).digest('hex');
const original = Buffer.from('original-image-byte-content');
const old = Buffer.from('old-watermarked-preview');
const newer = Buffer.from('new-watermarked-preview');
const processor = async () => ({ buffer: newer, contentType: 'image/webp', width: 1200, height: 800 });

function fixture({ role = 'photographer', galleryExists = true, thumbnail = previewPath, failBackup = false,
  failOverwrite = false, tamperBackup = false, failOriginal = false } = {}) {
  const objects = new Map([[originalPath, Buffer.from(original)], [previewPath, Buffer.from(old)]]);
  const operations = [];
  const media = { media_id: m, gallery_id: g, photographer_id: p, media_type: 'image',
    mime_type: 'image/png', file_size: original.length, storage_path: originalPath, thumbnail_path: thumbnail };
  const rows = { profiles: { role }, photographer_profiles: { photographer_id: p, business_name: 'RLS Test Photography A' },
    galleries: galleryExists ? { gallery_id: g } : null, media };
  const bucket = {
    async download(path) {
      operations.push(['download', path]);
      if (path === originalPath && failOriginal) return { error: new Error('missing') };
      const b = objects.get(path);
      if (!b) return { error: new Error('missing') };
      const bytes = tamperBackup && path.includes('/previews/backups/') ? Buffer.from('tampered') : b;
      return { data: { arrayBuffer: async () => bytes } };
    },
    async upload(path, bytes, opts) {
      operations.push(['upload', path, opts.upsert]);
      if (path.includes('/previews/backups/') && failBackup) return { error: new Error('backup denied') };
      if (path === previewPath && failOverwrite) return { error: new Error('update denied') };
      if (!opts.upsert && objects.has(path)) return { error: new Error('exists') };
      objects.set(path, Buffer.from(bytes));
      return { data: { path } };
    },
  };
  const db = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() { return { data: rows[table], error: null }; },
      };
      return query;
    },
    storage: { from(name) { assert.equal(name, 'client-media'); return bucket; } },
  };
  return { db, objects, operations, media };
}
const args = [user, g, m];

test('read-only preflight verifies exact preview and performs zero uploads', async () => {
  const f = fixture();
  const result = await inspectPhotographerPreviewRegeneration(f.db, ...args);
  assert.equal(result.safe_to_attempt, true);
  assert.equal(result.existing_preview_sha256, sha(old));
  assert.equal(result.writes_performed, false);
  assert.equal(f.operations.filter(op => op[0] === 'upload').length, 0);
});

test('regeneration backs up old preview, verifies backup, overwrites only preview and verifies result', async () => {
  const f = fixture();
  const result = await regeneratePhotographerPreview(f.db, ...args, { processor, newId: () => 'backup-1' });
  assert.equal(result.thumbnail_path, previewPath);
  assert.equal(result.backup_path, `${p}/${g}/previews/backups/${m}/backup-1.webp`);
  assert.deepEqual(f.objects.get(originalPath), original);
  assert.deepEqual(f.objects.get(previewPath), newer);
  assert.deepEqual(f.objects.get(result.backup_path), old);
  assert.equal(result.new_preview_sha256, sha(newer));
  assert.equal(f.media.thumbnail_path, previewPath);
  assert.deepEqual(f.operations.filter(op => op[0] === 'upload').map(op => [op[1], op[2]]),
    [[result.backup_path, false], [previewPath, true]]);
});

test('missing existing preview is rejected without uploading', async () => {
  const f = fixture(); f.objects.delete(previewPath);
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'PREVIEW_UNAVAILABLE' });
  assert.equal(f.operations.some(op => op[0] === 'upload'), false);
});

test('wrong preview path is rejected before accessing Storage', async () => {
  const f = fixture({ thumbnail: `${p}/${g}/previews/other.webp` });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'PREVIEW_PATH_MISMATCH' });
  assert.equal(f.operations.length, 0);
});

test('non-photographer cannot regenerate', async () => {
  const f = fixture({ role: 'client' });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'PHOTOGRAPHER_REQUIRED' });
  assert.equal(f.operations.length, 0);
});

test('failed backup leaves original and current preview untouched', async () => {
  const f = fixture({ failBackup: true });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'BACKUP_FAILED' });
  assert.deepEqual(f.objects.get(originalPath), original);
  assert.deepEqual(f.objects.get(previewPath), old);
});

test('failed backup verification never overwrites preview', async () => {
  const f = fixture({ tamperBackup: true });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'BACKUP_VERIFY_FAILED' });
  assert.deepEqual(f.objects.get(previewPath), old);
});

test('failed overwrite retains backup and original', async () => {
  const f = fixture({ failOverwrite: true });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor, newId: () => 'backup-1' }), { code: 'OVERWRITE_FAILED' });
  assert.deepEqual(f.objects.get(originalPath), original);
  assert.deepEqual(f.objects.get(previewPath), old);
  assert.deepEqual(f.objects.get(`${p}/${g}/previews/backups/${m}/backup-1.webp`), old);
});

test('identical preview avoids creating backups or overwriting', async () => {
  const f = fixture();
  const sameProcessor = async () => ({ buffer: Buffer.from(old), contentType: 'image/webp', width: 1200, height: 800 });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor: sameProcessor }), { code: 'PREVIEW_UNCHANGED' });
  assert.equal(f.operations.some(op => op[0] === 'upload'), false);
});

test('missing original prevents all writes', async () => {
  const f = fixture({ failOriginal: true });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'ORIGINAL_UNAVAILABLE' });
  assert.equal(f.operations.some(op => op[0] === 'upload'), false);
});

test('foreign gallery cannot regenerate preview', async () => {
  const f = fixture({ galleryExists: false });
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, { processor }), { code: 'GALLERY_NOT_FOUND' });
  assert.equal(f.operations.length, 0);
});

test('processor failure cannot change either Storage object', async () => {
  const f = fixture();
  await assert.rejects(regeneratePhotographerPreview(f.db, ...args, {
    processor: async () => { throw new Error('sharp failed'); },
  }), /sharp failed/);
  assert.deepEqual(f.objects.get(originalPath), original);
  assert.deepEqual(f.objects.get(previewPath), old);
  assert.equal(f.operations.some(op => op[0] === 'upload'), false);
});
