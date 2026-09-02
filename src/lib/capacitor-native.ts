import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativePickedPhoto {
  name: string;
  mimeType: string;
  path?: string;
  webPath?: string;
  latitude: number | null;
  longitude: number | null;
  dateTime: string | null;
  gpsStripped: boolean;
}

export interface PhotoExifPlugin {
  ping(): Promise<{ ok: boolean }>;
  pickImages(options?: { limit?: number }): Promise<{ photos: NativePickedPhoto[] }>;
  takePhoto(): Promise<{ photos: NativePickedPhoto[] }>;
  readPhotoFile(options: { path: string }): Promise<{ base64: string; mimeType: string }>;
  shareExportFile(options: {
    base64: string;
    filename: string;
    mimeType?: string;
  }): Promise<{ ok: boolean; mode: string }>;
  saveExportFile(options: {
    base64: string;
    filename: string;
    mimeType?: string;
  }): Promise<{ ok: boolean; mode: string; path?: string }>;
}

export const PhotoExif = registerPlugin<PhotoExifPlugin>("PhotoExif");

export function isCapacitorAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function isPhotoExifPluginAvailable(): boolean {
  return Capacitor.isPluginAvailable("PhotoExif");
}

export function formatCapacitorError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg) return msg;
  }
  return String(error);
}

async function base64ToFile(base64: string, name: string, mimeType: string): Promise<File> {
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64}`;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: mimeType || blob.type || "image/jpeg" });
}

export async function nativePhotoToFile(photo: NativePickedPhoto): Promise<File> {
  if (photo.path) {
    const { base64, mimeType } = await PhotoExif.readPhotoFile({ path: photo.path });
    return base64ToFile(base64, photo.name, mimeType || photo.mimeType);
  }

  const sources: string[] = [];
  if (photo.webPath) sources.push(photo.webPath);
  if (photo.path) sources.push(Capacitor.convertFileSrc(photo.path));

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
