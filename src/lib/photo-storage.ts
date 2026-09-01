import { unlink } from "fs/promises";
import path from "path";
import convert from "heic-convert";
import { deleteThumbnailFile } from "@/lib/photo-thumbnail";

const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeicFilename(filename: string): boolean {
  return HEIC_EXT.test(filename);
}

export async function normalizeImageForStorage(
  buffer: Buffer,
  ext: string
): Promise<{ buffer: Buffer; ext: string }> {
  if (!HEIC_EXT.test(ext)) {
    return { buffer, ext };
  }

  try {
    const converted = await convert({
      buffer,
      format: "JPEG",
      quality: 0.9,
    });
    return { buffer: Buffer.from(converted), ext: ".jpg" };
  } catch (error) {
    console.warn("HEIC conversion (quality 0.9) failed, retrying", error);
  }

  try {
    const converted = await convert({
      buffer,
      format: "JPEG",
      quality: 0.75,
    });
    return { buffer: Buffer.from(converted), ext: ".jpg" };
  } catch (error) {
    console.error("HEIC conversion failed, storing original", error);
    return { buffer, ext: ext.toLowerCase() === ext ? ext : ext.toLowerCase() };
  }
}

export function photoFilePath(travelId: string, filename: string): string {
  return path.join(process.cwd(), "public", "uploads", travelId, filename);
}

export async function deleteStoredPhotoFile(travelId: string, filename: string): Promise<void> {
  try {
    await unlink(photoFilePath(travelId, filename));
  } catch {
    // File may already be missing.
  }
  await deleteThumbnailFile(travelId, filename);
}
