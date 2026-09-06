import sharp from "sharp";
import { normalizeImageForStorage } from "@/lib/photo-storage";
import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/export-reel";

/**
 * Fit the full photo inside Instagram Reels 9:16 (letterbox on black).
 * Ken Burns can then start/end on the complete image and only crop while zoomed.
 */
export async function createReelFrameJpeg(
  source: Buffer,
  originalExt = ".jpg"
): Promise<Buffer> {
  let buffer = source;
  if (/\.(heic|heif)$/i.test(originalExt)) {
    const normalized = await normalizeImageForStorage(source, originalExt);
    buffer = Buffer.from(normalized.buffer);
  }

  return sharp(buffer)
    .rotate()
    .resize({
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      withoutEnlargement: false,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
