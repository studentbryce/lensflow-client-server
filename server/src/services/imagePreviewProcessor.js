
/**
 * LensFlow: pure, offline image preview processor.
 *
 * Generates reduced-size, watermarked WebP previews.
 *
 * Security:
 * - No Supabase calls or database writes.
 * - Never modifies the original image.
 * - Call only after server-side authorization and ownership validation.
 * - Validates image size, format and output options.
 * - Escapes watermark text before inserting it into SVG.
 *
 * Font:
 * - Uses a bundled TrueType font embedded into the watermark SVG.
 * - Avoids depending solely on system-installed fonts.
 * - The deployed Sharp SVG renderer must support embedded fonts.
 */

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

// --------------------------------------------------
// Processing limits
// --------------------------------------------------

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_PREVIEW_EDGE = 1600;

const ALLOWED_FORMATS = new Set([
  'jpeg',
  'png',
  'webp',
]);

const DEFAULT_WATERMARK = 'LensFlow • Preview';

// --------------------------------------------------
// Watermark appearance
// --------------------------------------------------

const WATERMARK_FONT_FAMILY = 'LensFlowWatermark';
const WATERMARK_COLOUR = '#E6E6E6';
const WATERMARK_OPACITY = 0.31;
const WATERMARK_ROTATION = -28;

// Adjust this relative path to match the actual
// location of imagePreviewProcessor.js.
//
// Example project structure:
//
// express-api/
//   assets/fonts/DejaVuSans-Bold.ttf
//   src/services/imagePreviewProcessor.js
//
const WATERMARK_FONT_URL = new URL(
  '../../assets/fonts/DejaVuSans-Bold.ttf',
  import.meta.url
);

const FONTCONFIG_URL = new URL(
  '../../assets/fonts/fonts.conf',
  import.meta.url
);

// --------------------------------------------------
// Error type
// --------------------------------------------------

export class ImagePreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImagePreviewError';
  }
}

// --------------------------------------------------
// XML escaping
// --------------------------------------------------

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// --------------------------------------------------
// Watermark text validation
// --------------------------------------------------

function normaliseWatermarkText(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 48
  ) {
    throw new ImagePreviewError(
      'Watermark must be 1–48 characters.'
    );
  }

  const normalised = value
    .trim()
    .replace(/\s+/g, ' ');

  // Prevent invalid XML control characters.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(normalised)) {
    throw new ImagePreviewError(
      'Watermark contains unsupported characters.'
    );
  }

  return normalised;
}

// --------------------------------------------------
// Bundled font loading
// --------------------------------------------------

// Cache the font-loading promise to avoid reading
// the font file for every generated preview.
//
// If loading fails, clear the cached promise so
// a subsequent request can retry.

let watermarkFontPromise;

async function loadWatermarkFontBase64() {
  if (!watermarkFontPromise) {
    watermarkFontPromise = readFile(WATERMARK_FONT_URL)
      .then((fontBuffer) => {
        if (fontBuffer.length === 0) {
          throw new Error('Watermark font is empty.');
        }

        return fontBuffer.toString('base64');
      })
      .catch((error) => {
        watermarkFontPromise = undefined;
        throw error;
      });
  }

  return watermarkFontPromise;
}

// --------------------------------------------------
// Fontconfig configuration check
// --------------------------------------------------

// Cache the fontconfig check promise to avoid reading
// the fonts.conf file for every generated preview.
//
// If loading fails, clear the cached promise so
// a subsequent request can retry.

let fontConfigPromise;

async function ensureFontConfigAvailable() {
  if (!fontConfigPromise) {
    fontConfigPromise = readFile(FONTCONFIG_URL)
      .then((buffer) => {
        if (buffer.length === 0) {
          throw new Error(
            'Fontconfig configuration file is empty.'
          );
        }

        return true;
      })
      .catch((error) => {
        fontConfigPromise = undefined;
        throw error;
      });
  }

  return fontConfigPromise;
}

// --------------------------------------------------
// Build watermark SVG
// --------------------------------------------------

/**
 * Build a repeated diagonal watermark SVG.
 *
 * The SVG is composited onto the resized preview,
 * never onto the original image.
 *
 * @param {number} width
 * @param {number} height
 * @param {string} text
 * @param {string} [fontBase64]
 * @returns {Buffer}
 */
export function buildWatermarkSvg(
  width,
  height,
  text,
  fontBase64
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_PREVIEW_EDGE ||
    height > MAX_PREVIEW_EDGE
  ) {
    throw new ImagePreviewError(
      'Invalid watermark dimensions.'
    );
  }

  const watermarkText = normaliseWatermarkText(text);
  const safeText = escapeXml(watermarkText);

  const shortestEdge = Math.min(width, height);

  const fontSize = Math.max(
    16,
    Math.min(
      30,
      Math.round(shortestEdge * 0.026)
    )
  );

  // Approximate bold sans-serif text width.
  // Keep the original generous spacing between
  // watermark repetitions.

  const estimatedTextWidth = Math.ceil(
    Array.from(watermarkText).length *
    fontSize *
    0.64
  );

  const horizontalGap = Math.max(
    160,
    Math.round(shortestEdge * 0.20)
  );

  const tileWidth =
    estimatedTextWidth + horizontalGap + 24;

  const tileHeight = Math.max(
    155,
    Math.round(shortestEdge * 0.20)
  );

  const baseline = Math.round(
    tileHeight * 0.54
  );

  // Use a specific embedded font when supplied.
  // Keep the generic fallback for direct SVG
  // builder calls used by existing unit tests.

  const fontDefinition = fontBase64
    ? `
      <style>
        @font-face {
          font-family: '${WATERMARK_FONT_FAMILY}';
          src: url('data:font/ttf;base64,${fontBase64}')
            format('truetype');
          font-weight: 700;
          font-style: normal;
        }
      </style>
    `
    : '';

  const fontFamily = fontBase64
    ? WATERMARK_FONT_FAMILY
    : 'sans-serif';

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <defs>
        ${fontDefinition}

        <pattern
          id="wm"
          width="${tileWidth}"
          height="${tileHeight}"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(${WATERMARK_ROTATION})"
        >
          <text
            x="12"
            y="${baseline}"
            font-family="${fontFamily}"
            font-size="${fontSize}"
            font-weight="700"
            fill="${WATERMARK_COLOUR}"
            fill-opacity="${WATERMARK_OPACITY}"
          >${safeText}</text>
        </pattern>
      </defs>

      <rect
        width="100%"
        height="100%"
        fill="url(#wm)"
      />
    </svg>
  `;

  return Buffer.from(svg, 'utf8');
}

// --------------------------------------------------
// Create watermarked preview
// --------------------------------------------------

/**
 * Produce a reduced-size, visibly watermarked
 * WebP preview.
 *
 * @param {Buffer} sourceBuffer
 * @param {{
 *   watermarkText?: string,
 *   maxEdge?: number,
 *   quality?: number
 * }} options
 *
 * @returns {Promise<{
 *   buffer: Buffer,
 *   contentType: string,
 *   width: number,
 *   height: number,
 *   extension: string
 * }>}
 */
export async function createWatermarkedPreview(
  sourceBuffer,
  options = {}
) {
  // ----------------------------------------------
  // Validate original image buffer
  // ----------------------------------------------

  if (
    !Buffer.isBuffer(sourceBuffer) ||
    sourceBuffer.length === 0 ||
    sourceBuffer.length > MAX_INPUT_BYTES
  ) {
    throw new ImagePreviewError(
      'Invalid image data or file exceeds the 25 MiB processing limit.'
    );
  }

  const {
    watermarkText = DEFAULT_WATERMARK,
    maxEdge = MAX_PREVIEW_EDGE,
    quality = 78,
  } = options;

  const safeWatermarkText =
    normaliseWatermarkText(watermarkText);

  // ----------------------------------------------
  // Validate processing options
  // ----------------------------------------------

  if (
    !Number.isInteger(maxEdge) ||
    maxEdge < 320 ||
    maxEdge > MAX_PREVIEW_EDGE
  ) {
    throw new ImagePreviewError(
      'Preview dimension must be 320–1600 pixels.'
    );
  }

  if (
    !Number.isInteger(quality) ||
    quality < 45 ||
    quality > 90
  ) {
    throw new ImagePreviewError(
      'Preview quality must be 45–90.'
    );
  }

  try {
    // --------------------------------------------
    // Validate image metadata
    // --------------------------------------------

    const metadata = await sharp(sourceBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();

    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new ImagePreviewError(
        'Only JPEG, PNG and WebP images are supported.'
      );
    }

    // --------------------------------------------
    // Resize original image
    // --------------------------------------------

    // rotate() applies EXIF orientation.
    // withoutEnlargement prevents upscaling.

    const resized = await sharp(sourceBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer({
        resolveWithObject: true,
      });

    const {
      width,
      height,
    } = resized.info;

    if (!width || !height) {
      throw new ImagePreviewError(
        'Unable to determine preview dimensions.'
      );
    }

    // --------------------------------------------
    // Verify required font assets
    // --------------------------------------------

    await ensureFontConfigAvailable();

    // --------------------------------------------
    // Load bundled watermark font
    // --------------------------------------------

    const fontBase64 = await loadWatermarkFontBase64();

    // --------------------------------------------
    // Generate watermark SVG
    // --------------------------------------------

    const watermarkSvg = buildWatermarkSvg(
      width,
      height,
      safeWatermarkText,
      fontBase64
    );

    // --------------------------------------------
    // Composite watermark onto resized preview
    // --------------------------------------------

    const outputBuffer = await sharp(resized.data)
      .composite([
        {
          input: watermarkSvg,
          blend: 'over',
          top: 0,
          left: 0,
        },
      ])
      .webp({
        quality,
        effort: 4,
      })
      .toBuffer();

    // --------------------------------------------
    // Return preview
    // --------------------------------------------

    return {
      buffer: outputBuffer,
      contentType: 'image/webp',
      extension: 'webp',
      width,
      height,
    };

  } catch (error) {
    if (error instanceof ImagePreviewError) {
      throw error;
    }

    // Do not expose internal Sharp errors,
    // file paths or deployment details.

    throw new ImagePreviewError(
      'Unable to process the supplied image.'
    );
  }
}
