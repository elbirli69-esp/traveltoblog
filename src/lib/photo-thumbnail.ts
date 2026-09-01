import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { normalizeImageForStorage } from "@/lib/photo-storage";

export const THUMB_MAX_WIDTH = 480;
export const THUMB_JPEG_QUALITY = 72;

export function thumbFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "");
  return `${base}.thumb.jpg`;
}

export function thumbDirPath(travelId: string): string {
  return path.join(process.cwd(), "public", "uploads", travelId, "thumbs");
}

export function thumbFilePath(travelId: string, filename: string): string {
  return path.join(thumbDirPath(travelId), thumbFilename(filename));
}

export async function thumbFileExists(
  travelId: string,
  filename: string
): Promise<boolean> {
  try {
    await access(thumbFilePath(travelId, filename));
    return true;
  } catch {
    return false;
  }
}

/** Genera miniatura JPEG optimizada para la UI (no usar en export). */
export async function generateThumbnail(
  sourceBuffer: Buffer,
  travelId: string,
  filename: string
): Promise<string> {
  const thumbDir = thumbDirPath(travelId);
  await mkdir(thumbDir, { recursive: true });
  const thumbName = thumbFilename(filename);
  const thumbPath = path.join(thumbDir, thumbName);

  const thumbBuffer = await sharp(sourceBuffer, { failOnError: false })
    .rotate()
    .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
    .catch(async () =>
      sharp({
        create: {
          width: THUMB_MAX_WIDTH,
          height: Math.round(THUMB_MAX_WIDTH * 0.75),
          channels: 3,
          background: "#e7e5e4",
        },
      })
        .jpeg({ quality: THUMB_JPEG_QUALITY })
        .toBuffer()
    );

  await writeFile(thumbPath, thumbBuffer);
  return thumbName;
}

/** Lee miniatura de disco o la genera desde el original (fotos legacy). */
export async function ensureThumbnailBuffer(
  travelId: string,
  filename: string,
  fullBuffer: Buffer,
  originalExt: string
): Promise<Buffer> {
  const exists = await thumbFileExists(travelId, filename);
  if (exists) {
    return readFile(thumbFilePath(travelId, filename));
  }

  let buffer = fullBuffer;
  if (/\.(heic|heif)$/i.test(filename) || /\.(heic|heif)$/i.test(originalExt)) {
    const normalized = await normalizeImageForStorage(fullBuffer, originalExt);
    buffer = Buffer.from(normalized.buffer);
  }

  await generateThumbnail(buffer, travelId, filename);
  return readFile(thumbFilePath(travelId, filename));
}

export async function deleteThumbnailFile(
  travelId: string,
  filename: string
): Promise<void> {
  const { unlink } = await import("fs/promises");
  try {
    await unlink(thumbFilePath(travelId, filename));
  } catch {
    // already gone
  }
}
