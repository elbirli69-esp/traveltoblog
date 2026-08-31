import type { ExifMetadata } from "@/types";
import { isValidGps } from "@/lib/exif";

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation-unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 60_000,
    });
  });
}

/** Tag photos missing GPS with the device location (common workaround on Android). */
export async function applyCurrentLocationToPhotos<T extends { exif: ExifMetadata }>(
  photos: T[]
): Promise<T[]> {
  const needsGps = photos.some(
    (p) => !isValidGps(p.exif.latitude, p.exif.longitude)
  );
  if (!needsGps) return photos;

  const pos = await getCurrentPosition();
  const { latitude, longitude } = pos.coords;

  return photos.map((photo) => {
    if (isValidGps(photo.exif.latitude, photo.exif.longitude)) return photo;
    return {
      ...photo,
      exif: {
        ...photo.exif,
        latitude,
        longitude,
      },
    };
  });
}
