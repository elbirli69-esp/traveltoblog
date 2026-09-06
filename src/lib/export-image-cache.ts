import { mkdir, readFile, writeFile, stat } from "fs/promises";
import path from "path";
import { readStoredPhotoBuffer } from "@/lib/photo-gps";
import {
  createExportImageSet,
  createPdfBleedImage,
  createPdfPrintImage,
  EXPORT_CACHE_VERSION,
  PDF_CACHE_VERSION,
  type ExportImageSet,
} from "@/lib/export-images";

const CACHE_ROOT = path.join(process.cwd(), "data", "export-cache");

interface CacheMeta {
  version: number;
  /** Set when print.jpg / bleed.jpg match this source file. */
  pdfVersion?: number;
  mtimeMs: number;
  size: number;
}

export interface PdfImageSet {
  print: Buffer;
  bleed: Buffer;
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

function sourceMatches(
  meta: CacheMeta,
  sourceStat: { mtimeMs: number; size: number }
): boolean {
  return meta.mtimeMs === sourceStat.mtimeMs && meta.size === sourceStat.size;
}

/** Read cached WebP derivatives or generate and persist them for faster HTML re-exports. */
export async function getOrCreateExportImageSet(
  travelId: string,
  photoId: string,
  photoUrl: string
): Promise<ExportImageSet | null> {
  const sourceStat = await getSourceStat(photoUrl);
  const dir = cacheDir(travelId, photoId);
  const metaPath = path.join(dir, "meta.json");
  const displayPath = path.join(dir, "display.webp");
  const thumbPath = path.join(dir, "thumb.webp");

  if (sourceStat) {
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
      if (meta.version === EXPORT_CACHE_VERSION && sourceMatches(meta, sourceStat)) {
        const [display, thumb] = await Promise.all([
          readFile(displayPath),
          readFile(thumbPath),
        ]);
        return { display, thumb };
      }
    } catch {
      // cache miss
    }
  }

  const original = await readStoredPhotoBuffer(photoUrl);
  if (!original) return null;

  const ext = path.extname(photoUrl) || ".jpg";
  const set = await createExportImageSet(original, ext);

  // Persist cache when we know the source mtime/size; otherwise return in-memory only.
  if (sourceStat) {
    await mkdir(dir, { recursive: true });

    let pdfVersion: number | undefined;
    try {
      const existing = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
      if (existing.pdfVersion === PDF_CACHE_VERSION && sourceMatches(existing, sourceStat)) {
        pdfVersion = existing.pdfVersion;
      }
    } catch {
      // no prior pdf meta
    }

    const meta: CacheMeta = {
      version: EXPORT_CACHE_VERSION,
      ...(pdfVersion != null ? { pdfVersion } : {}),
      mtimeMs: sourceStat.mtimeMs,
      size: sourceStat.size,
    };
    await Promise.all([
      writeFile(displayPath, set.display),
      writeFile(thumbPath, set.thumb),
      writeFile(metaPath, JSON.stringify(meta)),
    ]);
  }

  return set;
}

/**
 * Cache print + bleed JPEGs for PDF export under data/export-cache.
 * First export pays sharp cost; later exports reuse the files until the
 * source photo or PDF_CACHE_VERSION changes.
 */
export async function getOrCreatePdfImageSet(
  travelId: string,
  photoId: string,
  photoUrl: string,
  filename?: string
): Promise<PdfImageSet | null> {
  const sourceStat = await getSourceStat(photoUrl);
  if (!sourceStat) return null;

  const dir = cacheDir(travelId, photoId);
  const metaPath = path.join(dir, "meta.json");
  const printPath = path.join(dir, "print.jpg");
  const bleedPath = path.join(dir, "bleed.jpg");

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
    if (meta.pdfVersion === PDF_CACHE_VERSION && sourceMatches(meta, sourceStat)) {
      const [print, bleed] = await Promise.all([
        readFile(printPath),
        readFile(bleedPath),
      ]);
      return { print, bleed };
    }
  } catch {
    // cache miss
  }

  const original = await readStoredPhotoBuffer(photoUrl);
  if (!original) return null;

  const ext = path.extname(filename || photoUrl) || ".jpg";
  const [print, bleed] = await Promise.all([
    createPdfPrintImage(original, ext),
    createPdfBleedImage(original, ext),
  ]);

  await mkdir(dir, { recursive: true });

  let version = EXPORT_CACHE_VERSION;
  try {
    const existing = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
    if (existing.version === EXPORT_CACHE_VERSION && sourceMatches(existing, sourceStat)) {
      version = existing.version;
    }
  } catch {
    // no prior webp meta
  }

  const meta: CacheMeta = {
    version,
    pdfVersion: PDF_CACHE_VERSION,
    mtimeMs: sourceStat.mtimeMs,
    size: sourceStat.size,
  };
  await Promise.all([
    writeFile(printPath, print),
    writeFile(bleedPath, bleed),
    writeFile(metaPath, JSON.stringify(meta)),
  ]);

  return { print, bleed };
}
