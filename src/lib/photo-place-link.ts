import { isValidGps } from "@/lib/exif";
import { findNearby, NEARBY_THRESHOLD_M } from "@/lib/geo";

export interface PhotoForPlaceLink {
  id: string;
  latitude: number | null;
  longitude: number | null;
  placeId?: string | null;
  isTransportStart?: boolean;
  isTransportEnd?: boolean;
}

export interface PlaceForLink {
  id: string;
  latitude: number;
  longitude: number;
}

/** Closest registered place within threshold, or null if none / not eligible. */
export function matchPhotoToPlaceId(
  photo: PhotoForPlaceLink,
  places: PlaceForLink[],
  thresholdM: number = NEARBY_THRESHOLD_M
): string | null {
  if (photo.placeId) return null;
  if (photo.isTransportStart || photo.isTransportEnd) return null;
  if (!isValidGps(photo.latitude, photo.longitude)) return null;
  if (!places.length) return null;

  const nearby = findNearby(
    { latitude: photo.latitude!, longitude: photo.longitude! },
    places,
    thresholdM
  );
  return nearby[0]?.id ?? null;
}

/** Plan photo → place links without overriding existing associations. */
export function planPhotoPlaceLinks(
  photos: PhotoForPlaceLink[],
  places: PlaceForLink[],
  thresholdM: number = NEARBY_THRESHOLD_M
): Map<string, string> {
  const links = new Map<string, string>();
  for (const photo of photos) {
    const placeId = matchPhotoToPlaceId(photo, places, thresholdM);
    if (placeId) links.set(photo.id, placeId);
  }
  return links;
}

export interface UnlinkedPhotosSummary {
  /** Photos without place (excluding transport), when travel has places. */
  unlinked: number;
  /** Same pool as unlinked (non-transport, no place yet). */
  eligible: number;
  /** Photos with GPS in range of a place but still unlinked (subset of eligible). */
  matchable: number;
  /** Eligible photos with GPS but farther than threshold from every place. */
  withGpsFar: number;
  /** Eligible photos without usable GPS (manual link only). */
  withoutGps: number;
}

export function summarizeUnlinkedPhotos(
  photos: PhotoForPlaceLink[],
  places: PlaceForLink[],
  thresholdM: number = NEARBY_THRESHOLD_M
): UnlinkedPhotosSummary {
  if (!places.length) {
    return {
      unlinked: 0,
      eligible: 0,
      matchable: 0,
      withGpsFar: 0,
      withoutGps: 0,
    };
  }

  const eligiblePhotos = photos.filter(
    (p) => !p.isTransportStart && !p.isTransportEnd && !p.placeId
  );
  let matchable = 0;
  let withGpsFar = 0;
  let withoutGps = 0;
  for (const photo of eligiblePhotos) {
    if (!isValidGps(photo.latitude, photo.longitude)) {
      withoutGps += 1;
      continue;
    }
    if (matchPhotoToPlaceId(photo, places, thresholdM)) {
      matchable += 1;
    } else {
      withGpsFar += 1;
    }
  }

  return {
    unlinked: eligiblePhotos.length,
    eligible: eligiblePhotos.length,
    matchable,
    withGpsFar,
    withoutGps,
  };
}
