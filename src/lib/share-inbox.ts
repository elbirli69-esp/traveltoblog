import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, sanitizeExifMetadata } from "@/lib/exif";
import { isMediaFile, isVideoFile } from "@/lib/media-types";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/media-limits";
import { createLocalId } from "@/lib/utils";

const SHARE_INBOX_DIR =
  process.env.SHARE_INBOX_DIR ?? path.join(process.cwd(), "data", "share-inbox");

const MAX_FILES = 20;

export interface SharedFileMeta {
  name: string;
  type: string;
  size: number;
  mediaType?: "IMAGE" | "VIDEO";
  exifDateTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SharedBundle {
  id: string;
  createdAt: string;
  files: SharedFileMeta[];
}

function bundleDir(id: string): string {
  return path.join(SHARE_INBOX_DIR, id);
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]/g, "_");
  return base || `media-${createLocalId()}.jpg`;
}

export async function saveSharedFiles(files: File[]): Promise<SharedBundle> {
  const mediaFiles = files.filter((file) => isMediaFile(file));
  if (mediaFiles.length === 0) {
    throw new Error("No media files in share payload");
  }
  if (mediaFiles.length > MAX_FILES) {
    throw new Error("Too many files");
  }

  const id = createLocalId();
  const dir = bundleDir(id);
  await mkdir(dir, { recursive: true });

  const saved: SharedFileMeta[] = [];
  for (const file of mediaFiles.slice(0, MAX_FILES)) {
    const video = isVideoFile(file);
    const maxBytes = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) continue;
    const name = sanitizeFilename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, name), buffer);
    const exif = video
      ? { dateTime: null as Date | null, latitude: null as number | null, longitude: null as number | null }
      : sanitizeExifMetadata(await extractExifFromBuffer(buffer));
    saved.push({
      name,
      type: file.type || (video ? "video/mp4" : "image/jpeg"),
      size: buffer.length,
      mediaType: video ? "VIDEO" : "IMAGE",
      exifDateTime: exif.dateTime?.toISOString() ?? null,
      latitude: exif.latitude,
      longitude: exif.longitude,
    });
  }

  if (saved.length === 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("No valid media files");
  }

  const bundle: SharedBundle = {
    id,
    createdAt: new Date().toISOString(),
    files: saved,
  };

  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(bundle));
  return bundle;
}

export async function getSharedBundle(id: string): Promise<SharedBundle | null> {
  try {
    const raw = await readFile(path.join(bundleDir(id), "manifest.json"), "utf8");
    return JSON.parse(raw) as SharedBundle;
  } catch {
    return null;
  }
}

export async function readSharedFile(id: string, filename: string): Promise<Buffer | null> {
  const safeName = sanitizeFilename(filename);
  const bundle = await getSharedBundle(id);
  if (!bundle?.files.some((file) => file.name === safeName)) return null;
  try {
    return await readFile(path.join(bundleDir(id), safeName));
  } catch {
    return null;
  }
}

export async function deleteSharedBundle(id: string): Promise<void> {
  await rm(bundleDir(id), { recursive: true, force: true });
}

export async function cleanupOldBundles(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await readdir(SHARE_INBOX_DIR);
  } catch {
    return;
  }

  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(
    entries.map(async (id) => {
      const bundle = await getSharedBundle(id);
      if (!bundle) return;
      if (new Date(bundle.createdAt).getTime() < cutoff) {
        await deleteSharedBundle(id);
      }
    })
  );
}
