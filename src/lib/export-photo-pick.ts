/**
 * Shared photo selection helpers for Reel / PDF / HTML exports.
 * Typed diversity + near-dupe only — no freeform ML.
 */

import { computeReelPhotoPriority } from "@/lib/highlight-score";

export interface ExportPickPhoto {
  id: string;
  highlightScore?: number;
  placeName?: string | null;
  placeId?: string | null;
  placeHighlightScore?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  exifDateTime?: Date | string | null;
  hasCaption?: boolean;
  dayKey?: string | null;
}

export interface PickDiverseOptions {
  max: number;
  maxPerPlace?: number;
  nearDupeMeters?: number;
  nearDupeSeconds?: number;
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isNearDuplicateReelCandidate(
  candidate: {
    id: string;
    placeName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    exifDateTime?: Date | string | null;
  },
  picked: Array<{
    photoId?: string;
    placeName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    exifDateTime?: Date | string | null;
  }>,
  opts: { maxMeters?: number; maxSeconds?: number } = {}
): boolean {
  const maxMeters = opts.maxMeters ?? 45;
  const maxSeconds = opts.maxSeconds ?? 90;
  const candPlace = candidate.placeName?.trim().toLowerCase() || null;
  const candTime = candidate.exifDateTime
    ? new Date(candidate.exifDateTime).getTime()
    : null;

  for (const prev of picked) {
    if (prev.photoId && prev.photoId === candidate.id) return true;
    const prevPlace = prev.placeName?.trim().toLowerCase() || null;
    const samePlace = Boolean(candPlace && prevPlace && candPlace === prevPlace);

    let closeGps = false;
    if (
      candidate.latitude != null &&
      candidate.longitude != null &&
      prev.latitude != null &&
      prev.longitude != null
    ) {
      const meters = haversineMeters(
        candidate.latitude,
        candidate.longitude,
        prev.latitude,
        prev.longitude
      );
      closeGps = meters <= maxMeters;
    }

    let closeTime = false;
    if (candTime != null && prev.exifDateTime) {
      const prevTime = new Date(prev.exifDateTime).getTime();
      if (Number.isFinite(prevTime) && Math.abs(candTime - prevTime) <= maxSeconds * 1000) {
        closeTime = true;
      }
    }

    if (closeGps) return true;
    if (samePlace && closeTime) return true;
  }
  return false;
}

function placeKeyOf(p: ExportPickPhoto): string | null {
  const id = p.placeId?.trim();
  if (id) return `id:${id}`;
  const name = p.placeName?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

function scoreOf(p: ExportPickPhoto): number {
  return computeReelPhotoPriority({
    highlightScore: p.highlightScore,
    hasCaption: Boolean(p.hasCaption),
    placeName: p.placeName,
    placeHighlightScore: p.placeHighlightScore,
  });
}

export function pickDiverseExportPhotos<T extends ExportPickPhoto>(
  photos: T[],
  opts: PickDiverseOptions
): T[] {
  if (photos.length === 0 || opts.max <= 0) return [];
  const max = Math.min(opts.max, photos.length);
  const maxPerPlace = opts.maxPerPlace ?? 2;
  const sorted = [...photos].sort((a, b) => scoreOf(b) - scoreOf(a));

  const picked: T[] = [];
  const pickedMeta: Array<{
    photoId: string;
    placeName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    exifDateTime?: Date | string | null;
  }> = [];
  const placeCounts = new Map<string, number>();

  const tryAdd = (candidate: T, relaxPlace: boolean): boolean => {
    if (picked.length >= max) return false;
    if (picked.some((p) => p.id === candidate.id)) return false;
    if (
      isNearDuplicateReelCandidate(candidate, pickedMeta, {
        maxMeters: opts.nearDupeMeters ?? 45,
        maxSeconds: opts.nearDupeSeconds ?? 90,
      })
    ) {
      return false;
    }
    const pk = placeKeyOf(candidate);
    if (pk && !relaxPlace) {
      const used = placeCounts.get(pk) ?? 0;
      if (used >= maxPerPlace) return false;
    }
    picked.push(candidate);
    pickedMeta.push({
      photoId: candidate.id,
      placeName: candidate.placeName,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      exifDateTime: candidate.exifDateTime,
    });
    if (pk) placeCounts.set(pk, (placeCounts.get(pk) ?? 0) + 1);
    return true;
  };

  for (const candidate of sorted) {
    if (picked.length >= max) break;
    tryAdd(candidate, false);
  }
  if (picked.length < max) {
    for (const candidate of sorted) {
      if (picked.length >= max) break;
      tryAdd(candidate, true);
    }
  }
  return picked;
}

export function exportPlaceKey(
  placeName?: string | null,
  placeId?: string | null
): string | null {
  return placeKeyOf({ id: "", placeName, placeId });
}
