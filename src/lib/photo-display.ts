/** Public URL to display a stored photo (handles HEIC and archivos faltantes en /uploads). */
export function photoImageUrl(photoId: string): string {
  return `/api/photos/${photoId}/image`;
}

const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeicPath(path: string): boolean {
  return HEIC_EXT.test(path);
}
