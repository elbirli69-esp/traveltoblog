import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { createLocalId } from "@/lib/utils";

const SHARE_INBOX_DIR =
  process.env.SHARE_INBOX_DIR ?? path.join(process.cwd(), "data", "share-inbox");

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 20;

export interface SharedFileMeta {
  name: string;
  type: string;
  size: number;
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
  return base || `photo-${createLocalId()}.jpg`;
}

export async function saveSharedFiles(files: File[]): Promise<SharedBundle> {
  const imageFiles = files.filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
  if (imageFiles.length === 0) {
    throw new Error("No image files in share payload");
  }
  if (imageFiles.length > MAX_FILES) {
    throw new Error("Too many files");
  }

  const id = createLocalId();
  const dir = bundleDir(id);
  await mkdir(dir, { recursive: true });

  const saved: SharedFileMeta[] = [];
  for (const file of imageFiles.slice(0, MAX_FILES)) {
    if (file.size > MAX_FILE_BYTES) continue;
    const name = sanitizeFilename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, name), buffer);
    saved.push({ name, type: file.type || "image/jpeg", size: buffer.length });
  }

  if (saved.length === 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("No valid image files");
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
