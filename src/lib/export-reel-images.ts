import sharp from "sharp";
import { normalizeImageForStorage } from "@/lib/photo-storage";
import { REEL_HEIGHT, REEL_WIDTH } from "@/lib/export-reel";

/** Cover-crop a still to Instagram Reels 9:16 JPEG. */
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
      fit: "cover",
      position: "attention",
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
