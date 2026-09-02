import sharp from "sharp";
import { normalizeImageForStorage } from "@/lib/photo-storage";

export const EXPORT_DISPLAY_MAX_WIDTH = 1600;
export const EXPORT_DISPLAY_JPEG_QUALITY = 80;
export const EXPORT_THUMB_MAX_WIDTH = 480;
export const EXPORT_THUMB_JPEG_QUALITY = 72;

export interface ExportImageSet {
  display: Buffer;
  thumb: Buffer;
}

/** Web-optimized JPEG variants for HTML/ZIP export (not print). */
export async function createExportImageSet(
  source: Buffer,
  originalExt = ".jpg"
): Promise<ExportImageSet> {
  let buffer = source;
  if (/\.(heic|heif)$/i.test(originalExt)) {
    const normalized = await normalizeImageForStorage(source, originalExt);
    buffer = Buffer.from(normalized.buffer);
  }

  const rotated = sharp(buffer).rotate();

  const display = await rotated
    .clone()
    .resize({ width: EXPORT_DISPLAY_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: EXPORT_DISPLAY_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const thumb = await rotated
    .clone()
    .resize({ width: EXPORT_THUMB_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: EXPORT_THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return { display, thumb };
}

export function exportDisplayPathFromThumb(thumbPath: string): string {
  return thumbPath.replace(/-thumb\.jpg$/i, ".jpg");
}
