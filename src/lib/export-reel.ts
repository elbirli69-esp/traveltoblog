import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import {
  computeReelPhotoPriority,
} from "@/lib/highlight-score";
import {
  buildReelMapPlan,
  type ReelMapPlan,
  type ReelMapPoint,
} from "@/lib/export-reel-map";

/** Instagram Reels recommended master: vertical 9:16 H.264 MP4. */
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
/** Target visual bitrate — ~2.8 Mbps keeps a 30s reel near 10–12 MB. */
export const REEL_BITRATE = 2_800_000;

export const REEL_CROSSFADE_SECONDS = 0.22;
export const REEL_MAP_INTRO_SECONDS = 3.2;
export const REEL_TITLE_INTRO_SECONDS = 1.1;
export const REEL_OUTRO_SECONDS = 1.2;

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
  placeComment?: string | null;
  highlightScore?: number;
  placeHighlightScore?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** PHOTO notes / captions from travelers */
  comments?: string[];
}

export interface ReelPlaceInput {
  name: string;
  latitude: number | null;
  longitude: number | null;
  comment: string | null;
  visitedAt: Date | string | null;
  createdAt?: Date | string | null;
  highlightScore?: number;
}

export interface ReelDayNoteInput {
  dayKey: string;
  text: string;
  author: string;
}

export type ReelLayout = "full" | "mapInset";

export interface ReelFramePlan {
  photoId: string;
  dayKey: string | null;
  dayLabel: string | null;
  placeName: string | null;
  highlightScore: number;
  /** Short overlay line from photo/place notes */
  caption: string | null;
  /** Occasional day-note pull quote */
  dayNote: string | null;
  /** Longer Ken Burns beat */
  hero: boolean;
  durationSeconds: number;
  layout: ReelLayout;
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
  /** @deprecated use per-frame durationSeconds */
  secondsPerClip: number;
  crossfadeSeconds: number;
  mapIntroSeconds: number;
  titleIntroSeconds: number;
  outroSeconds: number;
  map: ReelMapPlan | null;
  frames: ReelFramePlan[];
}

function toDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const iso = typeof value === "string" ? value : value.toISOString();
  return isoToDateKey(iso);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function maxFramesForDuration(seconds: ReelDurationPreset): number {
  if (seconds <= 15) return 9;
  if (seconds <= 30) return 16;
  return 24;
}

export function clipOverlayText(text: string, max = 78): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const sliced = t.slice(0, max - 1);
  const neat = sliced.replace(/\s+\S*$/, "").trim();
  return `${neat || sliced.trim()}…`;
}

export function resolveFrameCaption(photo: ReelPhotoInput): string | null {
  const fromComments = photo.comments?.map((c) => c.trim()).find(Boolean);
  if (fromComments) return clipOverlayText(fromComments, 78);
  if (photo.placeComment?.trim()) return clipOverlayText(photo.placeComment, 78);
  return null;
}

/**
 * Pick a diverse set of stills for an Instagram-ready travel reel.
 * Prefers non-transport photos with places/captions, spreads across days.
 */
export function selectReelFrames(
  photos: ReelPhotoInput[],
  durationSeconds: ReelDurationPreset,
  dayNotes: ReelDayNoteInput[] = [],
  hasMap = false
): ReelFramePlan[] {
  const usable = photos.filter((p) => {
    if (!p.selected) return false;
    if (p.mediaType === "VIDEO" && !p.posterFilename) return false;
    return true;
  });

  const nonTransport = usable.filter((p) => !p.isTransportStart && !p.isTransportEnd);
  const pool = nonTransport.length > 0 ? nonTransport : usable;
  if (pool.length === 0) return [];

  const notesByDay = new Map<string, string>();
  for (const n of dayNotes) {
    if (!notesByDay.has(n.dayKey) && n.text.trim()) {
      notesByDay.set(n.dayKey, clipOverlayText(`${n.author}: ${n.text}`, 90));
    }
  }

  const byDay = new Map<string, ReelPhotoInput[]>();
  for (const photo of pool) {
    const key = toDayKey(photo.exifDateTime) ?? "_sin_fecha";
    const list = byDay.get(key) ?? [];
    list.push(photo);
    byDay.set(key, list);
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const capA = computeReelPhotoPriority({
        highlightScore: a.highlightScore,
        hasCaption: Boolean(resolveFrameCaption(a)),
        placeName: a.placeName,
        placeHighlightScore: a.placeHighlightScore,
      });
      const capB = computeReelPhotoPriority({
        highlightScore: b.highlightScore,
        hasCaption: Boolean(resolveFrameCaption(b)),
        placeName: b.placeName,
        placeHighlightScore: b.placeHighlightScore,
      });
      if (capB !== capA) return capB - capA;
      const aTime = a.exifDateTime ? new Date(a.exifDateTime).getTime() : 0;
      const bTime = b.exifDateTime ? new Date(b.exifDateTime).getTime() : 0;
      return aTime - bTime;
    });
  }

  const dayKeys = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
  const maxFrames = Math.min(maxFramesForDuration(durationSeconds), pool.length);
  const pickedIds = new Set<string>();
  const frames: ReelFramePlan[] = [];
  const usedDayNotes = new Set<string>();

  let pass = 0;
  while (frames.length < maxFrames && pass < 8) {
    for (const dayKey of dayKeys) {
      if (frames.length >= maxFrames) break;
      const list = byDay.get(dayKey) ?? [];
      const candidate = list[pass];
      if (!candidate || pickedIds.has(candidate.id)) continue;
      pickedIds.add(candidate.id);
      const realDay = dayKey === "_sin_fecha" ? null : dayKey;
      const caption = resolveFrameCaption(candidate);
      let dayNote: string | null = null;
      if (realDay && notesByDay.has(realDay) && !usedDayNotes.has(realDay)) {
        // Attach day note every ~2–3 clips max once per day
        if (frames.length % 3 === 1 || !caption) {
          dayNote = notesByDay.get(realDay) ?? null;
          usedDayNotes.add(realDay);
        }
      }
      frames.push({
        photoId: candidate.id,
        dayKey: realDay,
        dayLabel: realDay ? formatDateKey(realDay, "short") : null,
        placeName: candidate.placeName?.trim() || null,
        highlightScore: candidate.highlightScore ?? 5,
        caption,
        dayNote,
        hero: false,
        durationSeconds: 1.2,
        layout: "full",
        kenBurns: frames.length % 2 === 0 ? "in" : "out",
      });
    }
    pass += 1;
  }

  // Mark 2–3 hero beats (prefer captioned / place frames, spaced out)
  const heroBudget = durationSeconds <= 15 ? 2 : 3;
  const heroCandidates = frames
    .map((f, i) => ({
      f,
      i,
      score:
        computeReelPhotoPriority({
          highlightScore: f.highlightScore,
          hasCaption: Boolean(f.caption),
          placeName: f.placeName,
        }) +
        (f.dayNote ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const heroes = new Set<number>();
  for (const c of heroCandidates) {
    if (heroes.size >= heroBudget) break;
    if ([...heroes].some((h) => Math.abs(h - c.i) < 2)) continue;
    heroes.add(c.i);
  }
  if (heroes.size === 0 && frames.length > 0) {
    heroes.add(0);
    if (frames.length > 4) heroes.add(Math.floor(frames.length / 2));
  }

  return frames.map((f, i) => ({
    ...f,
    hero: heroes.has(i),
    durationSeconds: heroes.has(i) ? 2.0 : 1.15,
    layout: hasMap && i > 0 && i % 3 === 2 ? "mapInset" : "full",
    kenBurns: i % 2 === 0 ? "in" : "out",
  }));
}

function collectMapPoints(
  photos: ReelPhotoInput[],
  places: ReelPlaceInput[]
): ReelMapPoint[] {
  const points: ReelMapPoint[] = [];
  for (const p of photos) {
    if (!p.selected) continue;
    if (p.latitude == null || p.longitude == null) continue;
    points.push({
      lat: p.latitude,
      lng: p.longitude,
      kind: "photo",
      label: p.placeName ?? null,
      at: toIso(p.exifDateTime),
    });
  }
  for (const place of places) {
    if (place.latitude == null || place.longitude == null) continue;
    points.push({
      lat: place.latitude,
      lng: place.longitude,
      kind: "place",
      label: place.name,
      at: toIso(place.visitedAt) ?? toIso(place.createdAt),
    });
  }
  return points;
}

function fitClipDurations(
  frames: ReelFramePlan[],
  durationSeconds: ReelDurationPreset,
  mapIntroSeconds: number,
  titleIntroSeconds: number,
  outroSeconds: number
): ReelFramePlan[] {
  if (frames.length === 0) return frames;
  const fixed = mapIntroSeconds + titleIntroSeconds + outroSeconds;
  const budget = Math.max(durationSeconds - fixed, frames.length * 0.9);
  const baseSum = frames.reduce((s, f) => s + f.durationSeconds, 0);
  const scale = budget / baseSum;
  return frames.map((f) => ({
    ...f,
    durationSeconds: Math.max(
      f.hero ? 1.6 : 0.95,
      Math.min(f.hero ? 2.2 : 1.45, f.durationSeconds * scale)
    ),
  }));
}

export function buildReelManifest(input: {
  title: string;
  participants: string[];
  startDate: Date | string | null;
  endDate: Date | string | null;
  photos: ReelPhotoInput[];
  places?: ReelPlaceInput[];
  dayNotes?: ReelDayNoteInput[];
  durationSeconds: ReelDurationPreset;
}): ReelManifest {
  const durationSeconds = input.durationSeconds;
  const map = buildReelMapPlan(
    collectMapPoints(input.photos, input.places ?? [])
  );
  const mapIntroSeconds = map ? REEL_MAP_INTRO_SECONDS : 0;
  const titleIntroSeconds = REEL_TITLE_INTRO_SECONDS;
  const outroSeconds = REEL_OUTRO_SECONDS;

  let frames = selectReelFrames(
    input.photos,
    durationSeconds,
    input.dayNotes ?? [],
    Boolean(map)
  );
  frames = fitClipDurations(
    frames,
    durationSeconds,
    mapIntroSeconds,
    titleIntroSeconds,
    outroSeconds
  );

  const avgClip =
    frames.length > 0
      ? frames.reduce((s, f) => s + f.durationSeconds, 0) / frames.length
      : 1.2;

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
    secondsPerClip: avgClip,
    crossfadeSeconds: REEL_CROSSFADE_SECONDS,
    mapIntroSeconds,
    titleIntroSeconds,
    outroSeconds,
    map,
    frames,
  };
}

export function reelReadmeText(manifest: ReelManifest): string {
  const mapLine = manifest.map
    ? `- Incluye intro con mapa (${manifest.map.points.length} puntos GPS/lugares).\n`
    : "";
  return `Reel listo para Instagram
===========================

Archivo: instagram-reel.mp4
Formato: MP4 H.264, ${manifest.width}×${manifest.height} (9:16), ${manifest.fps} fps
Duración objetivo: ~${manifest.durationSeconds} s
Audio: sin pista (añade música trending en Instagram → más alcance)
${mapLine}
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
