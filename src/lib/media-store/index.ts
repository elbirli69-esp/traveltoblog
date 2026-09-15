import { createBlobMediaStore } from "@/lib/media-store/blob-store";
import { createFsMediaStore } from "@/lib/media-store/fs-store";
import type { MediaPutOptions, MediaStore } from "@/lib/media-store/types";
import {
  contentTypeForFilename,
  mediaKey,
  thumbMediaKey,
  urlToMediaKey,
} from "@/lib/media-store/types";
import { getStorageDriver } from "@/lib/runtime-config";

export type { MediaPutOptions, MediaStore } from "@/lib/media-store/types";
export {
  contentTypeForFilename,
  mediaKey,
  thumbMediaKey,
  urlToMediaKey,
} from "@/lib/media-store/types";

let cached: MediaStore | null = null;

export function getMediaStore(): MediaStore {
  if (cached) return cached;
  cached =
    getStorageDriver() === "blob"
      ? createBlobMediaStore()
      : createFsMediaStore();
  return cached;
}

/** Test helper — reset singleton between driver switches. */
export function resetMediaStoreCache(): void {
  cached = null;
}

/** Logical public path stored in Photo.url (always /uploads/...). */
export function logicalPhotoUrl(travelId: string, filename: string): string {
  return `/uploads/${travelId}/${filename}`;
}

export async function putTravelFile(
  travelId: string,
  filename: string,
  data: Buffer,
  contentType?: string
): Promise<{ key: string; url: string }> {
  const key = mediaKey(travelId, filename);
  await getMediaStore().put(key, data, {
    contentType: contentType ?? contentTypeForFilename(filename),
    overwrite: true,
  });
  return { key, url: logicalPhotoUrl(travelId, filename) };
}

export async function getTravelFile(
  travelId: string,
  filename: string
): Promise<Buffer | null> {
  return getMediaStore().get(mediaKey(travelId, filename));
}

export async function getByPhotoUrl(photoUrl: string): Promise<Buffer | null> {
  const key = urlToMediaKey(photoUrl);
  if (!key) return null;
  return getMediaStore().get(key);
}

export async function deleteTravelFile(
  travelId: string,
  filename: string
): Promise<void> {
  await getMediaStore().delete(mediaKey(travelId, filename));
}

export async function deleteTravelMedia(travelId: string): Promise<void> {
  await getMediaStore().deleteTravelPrefix(travelId);
}
