/**
 * Browser-side image shrink before multipart upload.
 * Keeps payloads under Vercel’s ~4.5MB serverless body limit (and helps Tailscale/NAS).
 * Videos are left unchanged.
 */

const HEIC_EXT = /\.(heic|heif)$/i;

/** Longest edge after resize (phone JPEGs are often 4000–6000px). */
export const UPLOAD_MAX_EDGE = 2560;
export const UPLOAD_JPEG_QUALITY = 0.82;
/**
 * Soft per-request budget for multipart bodies (files + metadata overhead).
 * Vercel rejects above ~4.5MB with 413 FUNCTION_PAYLOAD_TOO_LARGE.
 */
export const UPLOAD_SOFT_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);
/** Always compress (or convert HEIC) when source is larger than this. */
export const UPLOAD_COMPRESS_THRESHOLD_BYTES = Math.floor(1 * 1024 * 1024);
/** Prefer one photo per POST; packing may add more only when under budget. */
export const PHOTO_UPLOAD_CHUNK_SIZE = 1;

function isHeicBlob(blob: Blob, filename: string): boolean {
  const type = blob.type.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    HEIC_EXT.test(filename)
  );
}

function isVideoBlob(blob: Blob, filename: string, mediaType?: string): boolean {
  if (mediaType === "VIDEO") return true;
  if (blob.type.toLowerCase().startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v)$/i.test(filename);
}

function jpegFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "") || "photo";
  return `${base}.jpg`;
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function heicToJpegBlob(blob: Blob): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob,
    toType: "image/jpeg",
    quality: UPLOAD_JPEG_QUALITY,
  });
  return Array.isArray(converted) ? converted[0] : converted;
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error("No se pudo comprimir la imagen"))),
      "image/jpeg",
      quality
    );
  });
}

async function resizeBlobToJpeg(
  source: Blob,
  maxEdge: number,
  quality: number
): Promise<Blob> {
  const bitmap = await blobToImageBitmap(source);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToJpegBlob(canvas, quality);
  } finally {
    bitmap.close();
  }
}

export interface PreparedUploadFile {
  blob: Blob;
  filename: string;
  compressed: boolean;
}

/**
 * Convert/resize images for upload. Returns a JPEG File/Blob when compressed.
 * On failure, returns the original (caller may still hit 413 — surface that clearly).
 */
export async function prepareImageForUpload(
  blob: Blob,
  filename: string,
  options?: { mediaType?: "IMAGE" | "VIDEO" }
): Promise<PreparedUploadFile> {
  if (isVideoBlob(blob, filename, options?.mediaType)) {
    return { blob, filename, compressed: false };
  }

  // Tiny non-HEIC images already fit; skip work.
  if (
    !isHeicBlob(blob, filename) &&
    blob.size <= UPLOAD_COMPRESS_THRESHOLD_BYTES
  ) {
    return { blob, filename, compressed: false };
  }

  try {
    let working: Blob = blob;
    if (isHeicBlob(blob, filename)) {
      working = await heicToJpegBlob(blob);
    }

    let out = await resizeBlobToJpeg(working, UPLOAD_MAX_EDGE, UPLOAD_JPEG_QUALITY);
    // Tighten if still over soft budget (rare for 2560@0.82).
    let edge = UPLOAD_MAX_EDGE;
    let quality = UPLOAD_JPEG_QUALITY;
    for (let i = 0; i < 3 && out.size > UPLOAD_SOFT_MAX_BYTES; i++) {
      edge = Math.round(edge * 0.75);
      quality = Math.max(0.55, quality - 0.12);
      out = await resizeBlobToJpeg(working, edge, quality);
    }

    const name = jpegFilename(filename);
    const file =
      typeof File !== "undefined"
        ? new File([out], name, { type: "image/jpeg", lastModified: Date.now() })
        : out;
    return { blob: file, filename: name, compressed: true };
  } catch (err) {
    console.warn("prepareImageForUpload failed; using original", err);
    return { blob, filename, compressed: false };
  }
}

/** Pack items so each chunk’s estimated file bytes stay under soft max. */
export function packByUploadBudget<T>(
  items: T[],
  sizeOf: (item: T) => number,
  maxBytes: number = UPLOAD_SOFT_MAX_BYTES,
  maxItems: number = PHOTO_UPLOAD_CHUNK_SIZE
): T[][] {
  if (!items.length) return [];
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;

  for (const item of items) {
    const size = Math.max(0, sizeOf(item));
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= maxItems || bytes + size > maxBytes);
    if (wouldOverflow) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
    // Single item larger than budget still goes alone (error path handles 413).
    if (current.length >= maxItems) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Human-readable message for oversized / 413 upload responses. */
export function describeUploadHttpError(
  status: number,
  fallback: string,
  serverError?: string | null
): string {
  if (serverError?.trim()) {
    if (status === 413) {
      return `${serverError.trim()} (HTTP 413: el archivo supera el límite del servidor cloud)`;
    }
    return serverError.trim();
  }
  if (status === 413) {
    return (
      "La foto es demasiado grande para el servidor (HTTP 413). " +
      "Prueba una imagen más pequeña o comprueba la conexión; no se ha puesto en cola como «sin conexión»."
    );
  }
  return `${fallback} (HTTP ${status})`;
}
