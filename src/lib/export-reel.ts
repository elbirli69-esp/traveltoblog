import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";

/** Instagram Reels recommended master: vertical 9:16 H.264 MP4. */
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
/** Target visual bitrate — ~2.8 Mbps keeps a 30s reel near 10–12 MB. */
export const REEL_BITRATE = 2_800_000;

export type ReelDurationPreset = 15 | 30 | 60;

export const REEL_DURATION_OPTIONS: {
  seconds: ReelDurationPreset;
  label: string;
  description: string;
}[] = [
  {
    seconds: 15,
    label: "15 s",
    description: "Ideal Stories / Reels cortos de alto engagement",
  },
  {
    seconds: 30,
    label: "30 s",
    description: "Formato Reel clásico para feed e Instagram",
  },
  {
    seconds: 60,
    label: "60 s",
    description: "Resumen más completo (sigue siendo válido como Reel)",
  },
];

export interface ReelPhotoInput {
  id: string;
  mediaType: "IMAGE" | "VIDEO";
  posterFilename: string | null;
  exifDateTime: Date | string | null;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  selected: boolean;
  placeName?: string | null;
}

export interface ReelFramePlan {
  photoId: string;
  dayKey: string | null;
  dayLabel: string | null;
  placeName: string | null;
  /** Ken Burns direction for visual variety */
  kenBurns: "in" | "out";
}

export interface ReelManifest {
  title: string;
  participants: string[];
  dateRangeLabel: string | null;
  durationSeconds: ReelDurationPreset;
  width: number;
  height: number;
  fps: number;
  secondsPerClip: number;
  frames: ReelFramePlan[];
}

function toDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const iso = typeof value === "string" ? value : value.toISOString();
  return isoToDateKey(iso);
}

function maxFramesForDuration(seconds: ReelDurationPreset): number {
  if (seconds <= 15) return 8;
  if (seconds <= 30) return 14;
  return 22;
}

/**
 * Pick a diverse set of stills for an Instagram-ready travel reel.
 * Prefers non-transport photos with places, spreads across days.
 */
export function selectReelFrames(
  photos: ReelPhotoInput[],
  durationSeconds: ReelDurationPreset
): ReelFramePlan[] {
  const usable = photos.filter((p) => {
    if (!p.selected) return false;
    if (p.mediaType === "VIDEO" && !p.posterFilename) return false;
    return true;
  });

  const nonTransport = usable.filter((p) => !p.isTransportStart && !p.isTransportEnd);
  const pool = nonTransport.length > 0 ? nonTransport : usable;
  if (pool.length === 0) return [];

  const byDay = new Map<string, ReelPhotoInput[]>();
  for (const photo of pool) {
    const key = toDayKey(photo.exifDateTime) ?? "_sin_fecha";
    const list = byDay.get(key) ?? [];
    list.push(photo);
    byDay.set(key, list);
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const placeScore = (b.placeName ? 1 : 0) - (a.placeName ? 1 : 0);
      if (placeScore !== 0) return placeScore;
      const aTime = a.exifDateTime ? new Date(a.exifDateTime).getTime() : 0;
      const bTime = b.exifDateTime ? new Date(b.exifDateTime).getTime() : 0;
      return aTime - bTime;
    });
  }

  const dayKeys = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
  const maxFrames = Math.min(maxFramesForDuration(durationSeconds), pool.length);
  const pickedIds = new Set<string>();
  const frames: ReelFramePlan[] = [];

  let pass = 0;
  while (frames.length < maxFrames && pass < 8) {
    for (const dayKey of dayKeys) {
      if (frames.length >= maxFrames) break;
      const list = byDay.get(dayKey) ?? [];
      const candidate = list[pass];
      if (!candidate || pickedIds.has(candidate.id)) continue;
      pickedIds.add(candidate.id);
      const realDay = dayKey === "_sin_fecha" ? null : dayKey;
      frames.push({
        photoId: candidate.id,
        dayKey: realDay,
        dayLabel: realDay ? formatDateKey(realDay, "short") : null,
        placeName: candidate.placeName?.trim() || null,
        kenBurns: frames.length % 2 === 0 ? "in" : "out",
      });
    }
    pass += 1;
  }

  return frames;
}

export function buildReelManifest(input: {
  title: string;
  participants: string[];
  startDate: Date | string | null;
  endDate: Date | string | null;
  photos: ReelPhotoInput[];
  durationSeconds: ReelDurationPreset;
}): ReelManifest {
  const durationSeconds = input.durationSeconds;
  const frames = selectReelFrames(input.photos, durationSeconds);
  const clipBudget = Math.max(durationSeconds - 2.4, frames.length * 1.2);
  const secondsPerClip =
    frames.length > 0 ? Math.max(1.2, Math.min(2.4, clipBudget / frames.length)) : 2;

  let dateRangeLabel: string | null = null;
  const startKey = toDayKey(input.startDate);
  const endKey = toDayKey(input.endDate);
  if (startKey && endKey) {
    dateRangeLabel =
      startKey === endKey
        ? formatDateKey(startKey, "long")
        : `${formatDateKey(startKey, "short")} – ${formatDateKey(endKey, "short")}`;
  } else if (startKey) {
    dateRangeLabel = formatDateKey(startKey, "long");
  }

  return {
    title: input.title,
    participants: input.participants,
    dateRangeLabel,
    durationSeconds,
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    fps: REEL_FPS,
    secondsPerClip,
    frames,
  };
}

export function reelReadmeText(manifest: ReelManifest): string {
  return `Reel listo para Instagram
===========================

Archivo: instagram-reel.mp4
Formato: MP4 H.264, ${manifest.width}×${manifest.height} (9:16), ${manifest.fps} fps
Duración objetivo: ~${manifest.durationSeconds} s
Audio: sin pista (añade música trending en Instagram → más alcance)

Cómo publicar
-------------
1. Abre Instagram → + → Reel (o Comparte → Reel).
2. Sube instagram-reel.mp4 (o cover.jpg como portada si te lo pide).
3. Añade audio de la biblioteca de Instagram.
4. Escribe el copy; deja margen abajo (Instagram tapa la zona inferior).
5. Publica en Reels (también sirve para Stories si lo recortas a 15 s).

Consejos influencer
-------------------
- El vídeo ya está en vertical 1080×1920: no lo reencuadres.
- Primera imagen = gancho; no pongas texto crítico en bordes.
- Hashtags: mezcla destino + estilo de viaje (3–8 bastan).
- cover.jpg es una miniatura 9:16 por si quieres portada fija.

Generado con TravelToBlog.
`;
}

export function parseReelDuration(value: unknown): ReelDurationPreset {
  if (value === 15 || value === "15") return 15;
  if (value === 60 || value === "60") return 60;
  return 30;
}
