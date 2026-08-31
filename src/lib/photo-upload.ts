import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, mergeExifMetadata } from "@/lib/exif";
import type { ExifMetadata } from "@/types";
import { normalizeImageForStorage } from "@/lib/photo-storage";

export interface PreparedPhotoUpload {
  buffer: Buffer;
  ext: string;
  exif: ExifMetadata;
  filename: string;
  filepath: string;
}

/** Read EXIF from original bytes, then normalize format (e.g. HEIC → JPEG) for storage. */
export async function preparePhotoForStorage(
  travelId: string,
  localId: string,
  originalBuffer: Buffer,
  originalExt: string,
  clientMeta: Partial<ExifMetadata>
): Promise<PreparedPhotoUpload> {
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

  return { buffer, ext, exif, filename, filepath };
}
