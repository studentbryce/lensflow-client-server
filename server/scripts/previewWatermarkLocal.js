/**
 * Optional offline watermark preview. Does not connect to Supabase or Express.
 * Usage (from server/):
 * node scripts/previewWatermarkLocal.js "/path/to/photo.jpg" "/path/to/preview.webp" "Business Name"
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createWatermarkedPreview } from '../src/services/imagePreviewProcessor.js';

const [inputPath, outputPath, ...nameParts] = process.argv.slice(2);
const watermarkText = nameParts.join(' ');
if (!inputPath || !outputPath || !watermarkText) {
  console.error('Usage: node scripts/previewWatermarkLocal.js <input-image> <output.webp> <business-name>');
  process.exitCode = 1;
} else {
  try {
    const input = await readFile(inputPath);
    const result = await createWatermarkedPreview(input, { watermarkText });
    // wx: refuse to overwrite an existing file, including the original.
    await writeFile(outputPath, result.buffer, { flag: 'wx' });
    console.log(`Created ${outputPath} (${result.width} x ${result.height}, ${result.contentType})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
