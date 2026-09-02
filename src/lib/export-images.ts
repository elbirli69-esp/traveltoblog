import sharp from "sharp";
import { normalizeImageForStorage } from "@/lib/photo-storage";

/** Bump when resize format/quality changes to invalidate on-disk cache. */
export const EXPORT_CACHE_VERSION = 2;

export const EXPORT_IMAGE_EXT = ".webp";
export const EXPORT_IMAGE_MIME = "image/webp";

export const EXPORT_DISPLAY_MAX_WIDTH = 1600;
export const EXPORT_DISPLAY_WEBP_QUALITY = 82;
export const EXPORT_THUMB_MAX_WIDTH = 480;
export const EXPORT_THUMB_WEBP_QUALITY = 75;

/** Print PDF: JPEG max width (~1800px fits A4 landscape photo column at 300 DPI). */
export const PDF_PRINT_MAX_WIDTH = 1800;
export const PDF_JPEG_QUALITY = 86;

export interface ExportImageSet {
  display: Buffer;
  thumb: Buffer;
}

export function exportPhotoPaths(index: number): { localPath: string; thumbPath: string } {
  const base = `photos/${String(index + 1).padStart(3, "0")}`;
  return {
    localPath: `${base}${EXPORT_IMAGE_EXT}`,
    thumbPath: `${base}-thumb${EXPORT_IMAGE_EXT}`,
  };
}

export function exportDisplayPathFromThumb(thumbPath: string): string {
  return thumbPath.replace(/-thumb\.webp$/i, ".webp");
}

/** Web-optimized WebP variants for HTML/ZIP export (not print). */
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
    .webp({ quality: EXPORT_DISPLAY_WEBP_QUALITY })
    .toBuffer();

  const thumb = await rotated
    .clone()
    .resize({ width: EXPORT_THUMB_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: EXPORT_THUMB_WEBP_QUALITY })
    .toBuffer();

  return { display, thumb };
}

/** JPEG optimized for WeasyPrint print PDF (smaller files, reliable rendering). */
export async function createPdfPrintImage(
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
    .resize({ width: PDF_PRINT_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: PDF_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
