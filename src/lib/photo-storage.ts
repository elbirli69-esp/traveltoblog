import path from "path";
import convert from "heic-convert";
import {
  deleteTravelFile,
  getMediaStore,
  mediaKey,
  thumbMediaKey,
} from "@/lib/media-store";
import { isBlobStorage } from "@/lib/runtime-config";

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

/** Absolute fs path — only meaningful for STORAGE_DRIVER=fs. Prefer media-store. */
export function photoFilePath(travelId: string, filename: string): string {
  return path.join(process.cwd(), "public", "uploads", travelId, filename);
}

export async function deleteStoredPhotoFile(
  travelId: string,
  filename: string,
  posterFilename?: string | null
): Promise<void> {
  await deleteTravelFile(travelId, filename);
  if (posterFilename) {
    await deleteTravelFile(travelId, posterFilename);
  }
  await getMediaStore().delete(thumbMediaKey(travelId, filename));

  // Best-effort cleanup of legacy sibling thumb on disk
  if (!isBlobStorage()) {
    try {
      const { unlink } = await import("fs/promises");
      const base = filename.replace(/\.[^.]+$/i, "");
      await unlink(
        path.join(
          process.cwd(),
          "public",
          "uploads",
          travelId,
          "thumbs",
          `${base}.thumb.jpg`
        )
      );
    } catch {
      // ignore
    }
  }
}

/** @deprecated Prefer mediaKey from media-store. */
export function photoMediaKey(travelId: string, filename: string): string {
  return mediaKey(travelId, filename);
}
