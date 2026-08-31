import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativePickedPhoto {
  name: string;
  mimeType: string;
  /** Absolute path on device — prefer this with Capacitor.convertFileSrc */
  path?: string;
  webPath: string;
  /** Base64 payload when file is small enough for the bridge */
  base64?: string;
  latitude: number | null;
  longitude: number | null;
  dateTime: string | null;
  gpsStripped: boolean;
}

export interface PhotoExifPlugin {
  pickImages(options?: { limit?: number }): Promise<{ photos: NativePickedPhoto[] }>;
}

export const PhotoExif = registerPlugin<PhotoExifPlugin>("PhotoExif");

export function isCapacitorAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

function base64ToFile(base64: string, name: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: mimeType || "image/jpeg" });
}

export async function nativePhotoToFile(photo: NativePickedPhoto): Promise<File> {
  if (photo.base64) {
    return base64ToFile(photo.base64, photo.name, photo.mimeType);
  }

  const sources: string[] = [];
  if (photo.path) {
    sources.push(Capacitor.convertFileSrc(photo.path));
  }
  if (photo.webPath) {
    sources.push(photo.webPath);
  }

  let lastError: unknown;
  for (const src of sources) {
    try {
      const response = await fetch(src);
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.size) continue;
      return new File([blob], photo.name, {
        type: photo.mimeType || blob.type || "image/jpeg",
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`No se pudo leer la foto: ${photo.name}`);
}
