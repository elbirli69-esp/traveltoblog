import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, mergeExifMetadata } from "@/lib/exif";
import type { ExifMetadata } from "@/types";
import { normalizeImageForStorage, photoFilePath } from "@/lib/photo-storage";
import { generateThumbnail } from "@/lib/photo-thumbnail";
import type { MediaKind } from "@/lib/media-types";

export interface PreparedPhotoUpload {
  buffer: Buffer;
  ext: string;
  exif: ExifMetadata;
  filename: string;
  filepath: string;
  mediaType: MediaKind;
  durationMs: number | null;
  posterFilename: string | null;
}

function normalizeVideoExt(originalExt: string): string {
  const ext = originalExt.toLowerCase().startsWith(".")
    ? originalExt.toLowerCase()
    : `.${originalExt.toLowerCase()}`;
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return ext;
  return ".mp4";
}

/** Read EXIF from original bytes, then normalize format (e.g. HEIC → JPEG) for storage. */
export async function preparePhotoForStorage(
  travelId: string,
  localId: string,
  originalBuffer: Buffer,
  originalExt: string,
  clientMeta: Partial<ExifMetadata>,
  options?: {
    mediaType?: MediaKind;
    durationMs?: number | null;
    posterBuffer?: Buffer | null;
  }
): Promise<PreparedPhotoUpload> {
  const mediaType = options?.mediaType ?? "IMAGE";

  if (mediaType === "VIDEO") {
    const fileExif = await extractExifFromBuffer(originalBuffer).catch(() => ({
      dateTime: null,
      latitude: null,
      longitude: null,
    }));
    const exif = mergeExifMetadata(clientMeta, fileExif);
    const ext = normalizeVideoExt(originalExt);
    const filename = `${localId}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", travelId);
    await mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, originalBuffer);

    let posterFilename: string | null = null;
    const posterBuffer = options?.posterBuffer ?? null;
    if (posterBuffer && posterBuffer.length > 0) {
      posterFilename = `${localId}.poster.jpg`;
      await writeFile(photoFilePath(travelId, posterFilename), posterBuffer);
      try {
        await generateThumbnail(posterBuffer, travelId, filename);
      } catch (thumbError) {
        console.warn("Video poster thumbnail failed", thumbError);
      }
    }

    return {
      buffer: originalBuffer,
      ext,
      exif,
      filename,
      filepath,
      mediaType: "VIDEO",
      durationMs: options?.durationMs ?? null,
      posterFilename,
    };
  }

  const fileExif = await extractExifFromBuffer(originalBuffer);
  const exif = mergeExifMetadata(clientMeta, fileExif);

  const normalized = await normalizeImageForStorage(originalBuffer, originalExt);
  const buffer = Buffer.from(normalized.buffer);
  const ext = normalized.ext;
  const filename = `${localId}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", travelId);
  await mkdir(uploadDir, { recursive: true });
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  try {
    await generateThumbnail(buffer, travelId, filename);
  } catch (thumbError) {
    console.warn("Thumbnail generation failed", thumbError);
  }

  return {
    buffer,
    ext,
    exif,
    filename,
    filepath,
    mediaType: "IMAGE",
    durationMs: null,
    posterFilename: null,
  };
}
