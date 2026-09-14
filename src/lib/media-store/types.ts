/**
 * Logical media keys stay stable across drivers:
 *   uploads/{travelId}/{filename}
 *   uploads/{travelId}/thumbs/{base}.thumb.jpg
 * Photo.url in DB remains `/uploads/{travelId}/{filename}`.
 */

export type MediaPutOptions = {
  contentType?: string;
  /** When true, overwrite existing object (Blob upsert / fs write). */
  overwrite?: boolean;
};

export type MediaObject = {
  key: string;
  buffer: Buffer;
  contentType?: string;
};

export interface MediaStore {
  readonly driver: "fs" | "blob";
  /** Persist bytes at logical key. Returns public URL path or absolute Blob URL. */
  put(key: string, data: Buffer, options?: MediaPutOptions): Promise<{ url: string }>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Delete all objects under uploads/{travelId}/ (and thumbs). */
  deleteTravelPrefix(travelId: string): Promise<void>;
  /** True if object exists. */
  exists(key: string): Promise<boolean>;
  /**
   * URL the browser can fetch.
   * fs → `/uploads/...` (served by app route)
   * blob → absolute https://….public.blob.vercel-storage.com/…
   */
  publicUrl(key: string): string;
}

export function mediaKey(travelId: string, filename: string): string {
  return `uploads/${travelId}/${filename}`;
}

export function thumbMediaKey(travelId: string, filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "");
  return `uploads/${travelId}/thumbs/${base}.thumb.jpg`;
}

/** Normalize Photo.url or path segments into a store key. */
export function urlToMediaKey(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      const pathname = u.pathname.replace(/^\/+/, "");
      if (pathname.startsWith("uploads/")) return pathname;
      // Vercel Blob pathname may include store prefix; keep full pathname
      return pathname;
    }
  } catch {
    // fall through
  }
  const noLeading = trimmed.replace(/^\/+/, "");
  return noLeading.startsWith("uploads/") ? noLeading : `uploads/${noLeading}`;
}

export function contentTypeForFilename(filename: string): string {
  const ext = filename.includes(".")
    ? `.${filename.split(".").pop()!.toLowerCase()}`
    : "";
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".avif": "image/avif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
  };
  return map[ext] ?? "application/octet-stream";
}
