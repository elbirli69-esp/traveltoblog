/** Miniatura optimizada para la UI (galería, días, mapa). */
export function photoThumbUrl(photoId: string): string {
  return `/api/photos/${photoId}/thumb`;
}

/** Imagen completa — solo detalle en app o export HTML/PDF. */
export function photoFullUrl(photoId: string): string {
  return `/api/photos/${photoId}/image`;
}

const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeicPath(path: string): boolean {
  return HEIC_EXT.test(path);
}

/** @deprecated Usar photoThumbUrl o photoFullUrl */
export function photoImageUrl(photoId: string): string {
  return photoFullUrl(photoId);
}
