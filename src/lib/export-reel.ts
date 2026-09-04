import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import {
  computeReelPhotoPriority,
} from "@/lib/highlight-score";
import {
  buildReelMapPlan,
  type ReelMapPlan,
  type ReelMapPoint,
} from "@/lib/export-reel-map";
import {
  buildGpsTrailPolylines,
  type GpsTrackForMap,
} from "@/lib/gps-track-map";
import { placeEmoji } from "@/lib/places";
import type { PlaceType } from "@prisma/client";

/** Instagram Reels recommended master: vertical 9:16 H.264 MP4. */
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
/** Target visual bitrate — ~2.8 Mbps keeps a 30s reel near 10–12 MB. */
export const REEL_BITRATE = 2_800_000;

export const REEL_CROSSFADE_SECONDS = 0.18;
/** Shorter map beat after the hook. */
export const REEL_MAP_INTRO_SECONDS = 2.15;
export const REEL_TITLE_INTRO_SECONDS = 0.65;
export const REEL_OUTRO_SECONDS = 1.9;
export const REEL_HOOK_SECONDS = 1.05;
export const REEL_CHAPTER_SECONDS = 0.65;
/** Simulated “beat” lengths for punchy pacing. */
export const REEL_BEAT_PATTERN = [0.75, 1.15, 1.85] as const;

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
  placeType?: string | null;
  highlightScore?: number;
  placeHighlightScore?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** PHOTO notes / captions from travelers */
  comments?: string[];
}

export interface ReelPlaceInput {
  name: string;
  type?: string | null;
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

/** Visual treatment per clip — rotated for variety. */
export type ReelTreatment =
  | "clean"
  | "story"
  | "placePin"
  | "mapInset"
  | "mapFocus";

export type ReelTransition = "fade" | "slideLeft" | "slideUp" | "zoomSoft";

/** How story captions are painted (not subtitle bars). */
export type ReelCaptionStyle = "pullQuote" | "glassCard" | "sideAccent";

export type ReelFrameRole = "hook" | "chapter" | "clip";

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
  treatment: ReelTreatment;
  transitionOut: ReelTransition;
  captionStyle: ReelCaptionStyle;
  kenBurns: "in" | "out";
  latitude: number | null;
  longitude: number | null;
  role: ReelFrameRole;
  /** 1-based day chapter index when role is chapter / for CTA */
  dayIndex: number | null;
  /** Place-type emoji sticker */
  sticker: string | null;
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
  /** Best still for cover.jpg */
  coverPhotoId: string | null;
  /** Closing CTA line */
  ctaLine: string;
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
  // Fewer, stronger clips (point 4): leave room for hook + chapters + map + CTA.
  if (seconds <= 15) return 7;
  if (seconds <= 30) return 11;
  return 16;
}

/** Keys match Prisma PlaceType. */
const PLACE_TYPE_KEYS: Record<string, true> = {
  HOTEL: true,
  RESTAURANT: true,
  CAFE: true,
  MUSEUM: true,
  PARK: true,
  BEACH: true,
  VIEWPOINT: true,
  TRANSPORT: true,
  SHOP: true,
  OTHER: true,
};

function resolveSticker(type: string | null | undefined): string | null {
  if (!type) return null;
  if (!(type in PLACE_TYPE_KEYS)) return "📍";
  return placeEmoji(type as PlaceType);
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

const TRANSITIONS: ReelTransition[] = ["fade", "slideLeft", "slideUp", "zoomSoft"];
const CAPTION_STYLES: ReelCaptionStyle[] = ["pullQuote", "glassCard", "sideAccent"];

function pickTransition(index: number, treatment: ReelTreatment): ReelTransition {
  if (treatment === "mapFocus" || treatment === "mapInset") {
    return index % 2 === 0 ? "slideUp" : "fade";
  }
  if (treatment === "story") return index % 2 === 0 ? "fade" : "zoomSoft";
  return TRANSITIONS[index % TRANSITIONS.length]!;
}

function pickCaptionStyle(index: number): ReelCaptionStyle {
  return CAPTION_STYLES[index % CAPTION_STYLES.length]!;
}

/**
 * Assign varied treatments so consecutive clips don't look the same.
 * Prefers story when caption exists, map/pin when place+GPS, clean otherwise.
 */
export function assignReelTreatments(
  frames: ReelFramePlan[],
  hasMap: boolean
): ReelFramePlan[] {
  const recent: ReelTreatment[] = [];
  let mapFocusUsed = 0;

  return frames.map((frame, i) => {
    if (frame.role === "hook" || frame.role === "chapter") {
      return {
        ...frame,
        treatment: "clean" as ReelTreatment,
        layout: "full" as ReelLayout,
        transitionOut: "fade" as ReelTransition,
        captionStyle: "glassCard" as ReelCaptionStyle,
        durationSeconds:
          frame.role === "hook" ? REEL_HOOK_SECONDS : REEL_CHAPTER_SECONDS,
      };
    }

    const hasCaption = Boolean(frame.caption);
    const hasPlace = Boolean(frame.placeName);
    const hasGps = frame.latitude != null && frame.longitude != null;
    const canMap = hasMap && hasGps;

    const candidates: ReelTreatment[] = [];
    if (hasCaption) candidates.push("story");
    if (hasPlace) candidates.push("placePin");
    if (canMap && hasPlace) {
      candidates.push("mapInset");
      if (mapFocusUsed < Math.ceil(frames.length / 5) + 1) {
        candidates.push("mapFocus");
      }
    }
    if (!hasCaption || i % 4 === 3) candidates.push("clean");
    if (candidates.length === 0) candidates.push("clean");

    const preferred = candidates.filter((t) => !recent.includes(t));
    const pool = preferred.length > 0 ? preferred : candidates;
    // Bias: rotate through pool by index for stability in tests
    let treatment = pool[i % pool.length]!;
    // Prefer story on captioned heroes
    if (frame.hero && hasCaption && !recent.includes("story")) {
      treatment = "story";
    }
    // Prefer mapFocus occasionally for place+GPS
    if (
      canMap &&
      hasPlace &&
      i > 0 &&
      i % 5 === 3 &&
      !recent.includes("mapFocus")
    ) {
      treatment = "mapFocus";
    }

    if (treatment === "mapFocus") mapFocusUsed += 1;

    recent.push(treatment);
    if (recent.length > 2) recent.shift();

    return {
      ...frame,
      treatment,
      layout: treatment === "mapInset" ? "mapInset" : "full",
      transitionOut: pickTransition(i, treatment),
      captionStyle: pickCaptionStyle(i + (treatment === "story" ? 1 : 0)),
      sticker: frame.sticker,
      durationSeconds:
        treatment === "mapFocus"
          ? Math.max(frame.durationSeconds, frame.hero ? 2.1 : 1.45)
          : treatment === "story"
            ? Math.max(frame.durationSeconds, frame.hero ? 2.0 : 1.25)
            : frame.durationSeconds,
    };
  });
}

/**
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
  // Higher bar (point 4): prefer captioned / placed / high-score shots when the pool is rich.
  const minPriority = durationSeconds <= 15 ? 2 : 1;

  let pass = 0;
  while (frames.length < maxFrames && pass < 8) {
    for (const dayKey of dayKeys) {
      if (frames.length >= maxFrames) break;
      const list = byDay.get(dayKey) ?? [];
      const candidate = list[pass];
      if (!candidate || pickedIds.has(candidate.id)) continue;
      const caption = resolveFrameCaption(candidate);
      const priority = computeReelPhotoPriority({
        highlightScore: candidate.highlightScore,
        hasCaption: Boolean(caption),
        placeName: candidate.placeName,
        placeHighlightScore: candidate.placeHighlightScore,
      });
      // On early passes, skip weak clips if stronger ones remain.
      if (pass === 0 && priority < minPriority && pool.length > maxFrames) {
        continue;
      }
      pickedIds.add(candidate.id);
      const realDay = dayKey === "_sin_fecha" ? null : dayKey;
      let dayNote: string | null = null;
      if (realDay && notesByDay.has(realDay) && !usedDayNotes.has(realDay)) {
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
        treatment: "clean",
        transitionOut: "fade",
        captionStyle: "glassCard",
        kenBurns: frames.length % 2 === 0 ? "in" : "out",
        latitude: candidate.latitude ?? null,
        longitude: candidate.longitude ?? null,
        role: "clip",
        dayIndex: null,
        sticker: resolveSticker(candidate.placeType),
      });
    }
    pass += 1;
  }

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

  const withHeroes = frames.map((f, i) => ({
    ...f,
    hero: heroes.has(i),
    durationSeconds: heroes.has(i) ? 2.0 : 1.15,
    kenBurns: (i % 2 === 0 ? "in" : "out") as "in" | "out",
  }));

  return assignReelTreatments(withHeroes, hasMap);
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

  // Beat pacing (point 1): irregular punchy lengths for clips; fixed for hook/chapter.
  let beat = 0;
  const paced = frames.map((f) => {
    if (f.role === "hook") {
      return { ...f, durationSeconds: REEL_HOOK_SECONDS };
    }
    if (f.role === "chapter") {
      return { ...f, durationSeconds: REEL_CHAPTER_SECONDS };
    }
    const pattern = REEL_BEAT_PATTERN[beat % REEL_BEAT_PATTERN.length]!;
    beat += 1;
    const base = f.hero ? Math.max(pattern, 1.85) : pattern;
    const boosted =
      f.treatment === "mapFocus"
        ? Math.max(base, f.hero ? 2.0 : 1.45)
        : f.treatment === "story"
          ? Math.max(base, f.hero ? 1.85 : 1.15)
          : base;
    return { ...f, durationSeconds: boosted };
  });

  const fixed = mapIntroSeconds + titleIntroSeconds + outroSeconds;
  const budget = Math.max(durationSeconds - fixed, paced.length * 0.55);
  const baseSum = paced.reduce((s, f) => s + f.durationSeconds, 0);
  if (baseSum <= 0) return paced;
  const scale = budget / baseSum;
  return paced.map((f) => {
    if (f.role === "hook" || f.role === "chapter") return f;
    const min = f.hero ? 1.35 : 0.65;
    const max = f.hero ? 2.35 : 2.0;
    return {
      ...f,
      durationSeconds: Math.max(min, Math.min(max, f.durationSeconds * scale)),
    };
  });
}

function pickBestCoverFrame(frames: ReelFramePlan[]): ReelFramePlan | null {
  const clips = frames.filter((f) => f.role === "clip" || f.role === "hook");
  if (clips.length === 0) return null;
  return [...clips].sort((a, b) => {
    const scoreA =
      computeReelPhotoPriority({
        highlightScore: a.highlightScore,
        hasCaption: Boolean(a.caption),
        placeName: a.placeName,
      }) + (a.hero ? 2 : 0);
    const scoreB =
      computeReelPhotoPriority({
        highlightScore: b.highlightScore,
        hasCaption: Boolean(b.caption),
        placeName: b.placeName,
      }) + (b.hero ? 2 : 0);
    return scoreB - scoreA;
  })[0]!;
}

function buildHookFrame(best: ReelFramePlan): ReelFramePlan {
  return {
    ...best,
    role: "hook",
    dayIndex: null,
    hero: true,
    caption: null,
    dayNote: null,
    treatment: "clean",
    layout: "full",
    transitionOut: "zoomSoft",
    captionStyle: "glassCard",
    durationSeconds: REEL_HOOK_SECONDS,
    kenBurns: "in",
    // Keep sticker off the hook so the still hits hard.
    sticker: null,
  };
}

function insertDayChapters(frames: ReelFramePlan[]): ReelFramePlan[] {
  const dayKeys = [
    ...new Set(frames.map((f) => f.dayKey).filter((k): k is string => Boolean(k))),
  ].sort((a, b) => a.localeCompare(b));
  if (dayKeys.length < 2) return frames;

  const out: ReelFramePlan[] = [];
  let lastDay: string | null = null;
  let chapterCount = 0;
  for (const frame of frames) {
    if (
      frame.role === "clip" &&
      frame.dayKey &&
      frame.dayKey !== lastDay &&
      chapterCount < 4
    ) {
      const dayIndex = dayKeys.indexOf(frame.dayKey) + 1;
      out.push({
        ...frame,
        role: "chapter",
        dayIndex: dayIndex > 0 ? dayIndex : null,
        hero: false,
        caption: null,
        dayNote: null,
        treatment: "clean",
        layout: "full",
        transitionOut: "fade",
        captionStyle: "glassCard",
        durationSeconds: REEL_CHAPTER_SECONDS,
        sticker: null,
        kenBurns: "out",
      });
      chapterCount += 1;
      lastDay = frame.dayKey;
    }
    if (frame.role === "clip" && frame.dayKey) lastDay = frame.dayKey;
    out.push(frame);
  }
  return out;
}

function buildCtaLine(title: string, participants: string[]): string {
  const who =
    participants.length > 0 ? participants.slice(0, 3).join(" · ") : null;
  if (who) return `${title} — ¿cuál fue vuestro momento? 👇`;
  return `Comenta tu parada favorita de ${title} 👇`;
}

export function buildReelManifest(input: {
  title: string;
  participants: string[];
  startDate: Date | string | null;
  endDate: Date | string | null;
  photos: ReelPhotoInput[];
  places?: ReelPlaceInput[];
  dayNotes?: ReelDayNoteInput[];
  gpsTracks?: GpsTrackForMap[];
  durationSeconds: ReelDurationPreset;
}): ReelManifest {
  const durationSeconds = input.durationSeconds;
  // Prefer tracks marked for export; if none, still show any recorded trails.
  const exportMarked = (input.gpsTracks ?? []).filter((t) => t.includeInExport);
  const trailSource =
    exportMarked.length > 0 ? exportMarked : input.gpsTracks ?? [];
  const gpsTrails = buildGpsTrailPolylines(trailSource);

  const map = buildReelMapPlan(
    collectMapPoints(input.photos, input.places ?? []),
    gpsTrails
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

  const best = pickBestCoverFrame(frames);
  const coverPhotoId = best?.photoId ?? frames[0]?.photoId ?? null;
  if (best) {
    frames = [buildHookFrame(best), ...insertDayChapters(frames)];
  } else {
    frames = insertDayChapters(frames);
  }

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
    coverPhotoId,
    ctaLine: buildCtaLine(input.title, input.participants),
  };
}

export function reelReadmeText(manifest: ReelManifest): string {
  const mapLine = manifest.map
    ? `- Incluye intro con mapa (${manifest.map.points.length} puntos GPS/lugares)${
        (manifest.map.gpsTrails?.length ?? 0) > 0 ? " + trail GPS animado" : ""
      }.\n`
    : "";
  const treatments = [...new Set(manifest.frames.map((f) => f.treatment))].join(", ");
  return `Reel listo para Instagram
===========================

Archivo: instagram-reel.mp4
Formato: MP4 H.264, ${manifest.width}×${manifest.height} (9:16), ${manifest.fps} fps
Duración objetivo: ~${manifest.durationSeconds} s
Audio: sin pista (añade música trending en Instagram → más alcance)
Estructura: gancho → mapa → título → capítulos/clips → CTA
Tratamientos visuales: ${treatments || "variados"}
Portada: cover.jpg (mejor still del viaje)
CTA: ${manifest.ctaLine}
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
