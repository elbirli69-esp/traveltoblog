import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativePickedPhoto {
  name: string;
  mimeType: string;
  webPath: string;
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

export async function nativePhotoToFile(photo: NativePickedPhoto): Promise<File> {
  const response = await fetch(photo.webPath);
  if (!response.ok) {
    throw new Error(`No se pudo leer la foto: ${photo.name}`);
  }
  const blob = await response.blob();
  return new File([blob], photo.name, { type: photo.mimeType || blob.type || "image/jpeg" });
}
