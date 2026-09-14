import {
  contentTypeForFilename,
  logicalPhotoUrl,
  putTravelFile,
} from "@/lib/media-store";
import { extractExifFromBuffer, mergeExifMetadata } from "@/lib/exif";
import type { ExifMetadata } from "@/types";
import { normalizeImageForStorage } from "@/lib/photo-storage";
import { generateThumbnail } from "@/lib/photo-thumbnail";
import type { MediaKind } from "@/lib/media-types";

export interface PreparedPhotoUpload {
  buffer: Buffer;
  ext: string;
  exif: ExifMetadata;
  filename: string;
  /** Logical public URL stored in DB (`/uploads/...`). */
  url: string;
  /** @deprecated Use url; kept for callers that expected a filesystem path. */
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
    await putTravelFile(
      travelId,
      filename,
      originalBuffer,
      contentTypeForFilename(filename)
    );

    let posterFilename: string | null = null;
    const posterBuffer = options?.posterBuffer ?? null;
    if (posterBuffer && posterBuffer.length > 0) {
      posterFilename = `${localId}.poster.jpg`;
      await putTravelFile(travelId, posterFilename, posterBuffer, "image/jpeg");
      try {
        await generateThumbnail(posterBuffer, travelId, filename);
      } catch (thumbError) {
        console.warn("Video poster thumbnail failed", thumbError);
      }
    }

    const url = logicalPhotoUrl(travelId, filename);
    return {
      buffer: originalBuffer,
      ext,
      exif,
      filename,
      url,
      filepath: url,
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
  await putTravelFile(
    travelId,
    filename,
    buffer,
    contentTypeForFilename(filename)
  );

  try {
    await generateThumbnail(buffer, travelId, filename);
  } catch (thumbError) {
    console.warn("Thumbnail generation failed", thumbError);
  }

  const url = logicalPhotoUrl(travelId, filename);
  return {
    buffer,
    ext,
    exif,
    filename,
    url,
    filepath: url,
    mediaType: "IMAGE",
    durationMs: null,
    posterFilename: null,
  };
}
