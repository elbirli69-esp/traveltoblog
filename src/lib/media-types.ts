const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;

export type MediaKind = "IMAGE" | "VIDEO";

export function isImageFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

export function isVideoFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}

export function isMediaFile(file: { name: string; type: string }): boolean {
  return isImageFile(file) || isVideoFile(file);
}

export function mediaKindFromFile(file: { name: string; type: string }): MediaKind {
  return isVideoFile(file) ? "VIDEO" : "IMAGE";
}

export function mediaKindFromFilename(filename: string): MediaKind {
  return VIDEO_EXT.test(filename) ? "VIDEO" : "IMAGE";
}

export function videoMimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".webm") return "video/webm";
  if (e === ".mov") return "video/quicktime";
  if (e === ".m4v") return "video/x-m4v";
  if (e === ".avi") return "video/x-msvideo";
  if (e === ".mkv") return "video/x-matroska";
  return "video/mp4";
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function posterPublicUrl(travelId: string, posterFilename: string): string {
  return `/uploads/${travelId}/${posterFilename}`;
}
