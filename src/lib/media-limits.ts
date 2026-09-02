/** Upload and export size policy for images vs videos. */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_VIDEOS_PER_BATCH = 10;
/** Soft warning when selected videos in an export exceed this total. */
export const EXPORT_VIDEO_WARN_BYTES = 200 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function maxBytesForMedia(isVideo: boolean): number {
  return isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}
