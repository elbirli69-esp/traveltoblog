import { mkdir, readFile, writeFile, stat } from "fs/promises";
import path from "path";
import { readStoredPhotoBuffer } from "@/lib/photo-gps";
import {
  createExportImageSet,
  EXPORT_CACHE_VERSION,
  type ExportImageSet,
} from "@/lib/export-images";

const CACHE_ROOT = path.join(process.cwd(), "data", "export-cache");

interface CacheMeta {
  version: number;
  mtimeMs: number;
  size: number;
}

async function getSourceStat(photoUrl: string): Promise<{ mtimeMs: number; size: number } | null> {
  const relative = photoUrl.startsWith("/") ? photoUrl.slice(1) : photoUrl;
  const filepath = path.join(process.cwd(), "public", relative);
  try {
    const fileStat = await stat(filepath);
    return { mtimeMs: fileStat.mtimeMs, size: fileStat.size };
  } catch {
    return null;
  }
}

function cacheDir(travelId: string, photoId: string): string {
  return path.join(CACHE_ROOT, travelId, photoId);
}

/** Read cached WebP derivatives or generate and persist them for faster re-exports. */
export async function getOrCreateExportImageSet(
  travelId: string,
  photoId: string,
  photoUrl: string
): Promise<ExportImageSet | null> {
  const sourceStat = await getSourceStat(photoUrl);
  if (!sourceStat) return null;

  const dir = cacheDir(travelId, photoId);
  const metaPath = path.join(dir, "meta.json");
  const displayPath = path.join(dir, "display.webp");
  const thumbPath = path.join(dir, "thumb.webp");

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
    if (
      meta.version === EXPORT_CACHE_VERSION &&
      meta.mtimeMs === sourceStat.mtimeMs &&
      meta.size === sourceStat.size
    ) {
      const [display, thumb] = await Promise.all([readFile(displayPath), readFile(thumbPath)]);
      return { display, thumb };
    }
  } catch {
    // cache miss — regenerate below
  }

  const original = await readStoredPhotoBuffer(photoUrl);
  if (!original) return null;

  const ext = path.extname(photoUrl) || ".jpg";
  const set = await createExportImageSet(original, ext);

  await mkdir(dir, { recursive: true });
  const meta: CacheMeta = {
    version: EXPORT_CACHE_VERSION,
    mtimeMs: sourceStat.mtimeMs,
    size: sourceStat.size,
  };
  await Promise.all([
    writeFile(displayPath, set.display),
    writeFile(thumbPath, set.thumb),
    writeFile(metaPath, JSON.stringify(meta)),
  ]);

  return set;
}
