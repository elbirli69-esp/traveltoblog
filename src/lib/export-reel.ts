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
import { FLIGHT_IN_EMOJI, FLIGHT_OUT_EMOJI, resolveFlightLegs } from "@/lib/flights";
import {
  buildDirectRouteGeometry,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  hasFlightOverview,
} from "@/lib/mapbox-route";
import { placeEmoji } from "@/lib/places";
import type { PlaceType } from "@prisma/client";
import {
  defaultExportDirectives,
  type Emphasis,
  type ExportReelDirectives,
  type ReelCaptionMode,
  type ReelCaptionPlacement,
  type ReelPacing,
  type ReelTransitionStyle,
} from "@/lib/export-directives";
import {
  exportPlaceKey,
  isNearDuplicateReelCandidate,
} from "@/lib/export-photo-pick";
import {
  getReelAudioPreset,
  parseReelAudioPresetId,
  snapDurationToBpm,
  type ReelAudioPresetId,
} from "@/lib/export/reel-audio";

export { isNearDuplicateReelCandidate } from "@/lib/export-photo-pick";

/** Instagram Reels recommended master: vertical 9:16 H.264 MP4. */
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
/** Target visual bitrate — ~2.8 Mbps keeps a 30s reel near 10–12 MB. */
export const REEL_BITRATE = 2_800_000;

/**
 * Crossfade / slide / soft-zoom length.
 * ~0.4 s matches travel-influencer Reels (readable, not whip-cut).
 */
export const REEL_CROSSFADE_SECONDS = 0.4;
/** Shorter map beat after the hook. */
export const REEL_MAP_INTRO_SECONDS = 2.15;
/** Longer cinematic map open for iPhone-style Recuerdos. */
export const REEL_MEMORIES_MAP_INTRO_SECONDS = 3.2;
export const REEL_TITLE_INTRO_SECONDS = 0.65;
export const REEL_MEMORIES_TITLE_INTRO_SECONDS = 1.8;
export const REEL_OUTRO_SECONDS = 1.9;
export const REEL_MEMORIES_OUTRO_SECONDS = 2.4;
export const REEL_HOOK_SECONDS = 1.05;
/** Day chapter card — long enough to read the label. */
export const REEL_CHAPTER_SECONDS = 1.4;
/**
 * Clip hold pattern (includes outgoing transition).
 * With a 0.4 s crossfade, clean on-screen holds land ~0.55 / 0.95 / 1.6 s.
 */
export const REEL_BEAT_PATTERN = [2.1, 2.5, 3.0] as const;
/** Overlay reading pace (~chars/sec) for large on-screen type — slower = more readable. */
export const REEL_CAPTION_CHARS_PER_SEC = 10;
export const REEL_CAPTION_MAX_CHARS = 56;
/** Minimum on-screen hold (after crossfade) when a clip has a caption/day note. */
export const REEL_CAPTION_MIN_HOLD_SECONDS = 2.3;

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

export type ReelTransition =
  | "fade"
  | "fadeBlack"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "zoomSoft"
  | "zoomPunch";

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
  /** Show day chip once when this day first appears in the body */
  showDayChip?: boolean;
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
  /** Echo of free-text brief grounding (if any). */
  briefInterpretation?: string | null;
  /** Reel knobs that were applied after UI duration. */
  appliedReelDirectives?: ExportReelDirectives | null;
  /** Montage look (drives Ken Burns amplitude, map intro styling, etc.). */
  look?: import("@/lib/export-directives").ReelLook;
  /** When set, this Reel covers one calendar day (not the whole trip). */
  scopeDayKey?: string | null;
  /** Typed audio bed; none = mute MP4. */
  audioPreset?: ReelAudioPresetId;
  audioBpm?: number | null;
}

/** Resolved knobs used while building a reel from optional brief directives. */
export interface ReelBuildOptions {
  targetPhotoCount?: number;
  pacing: ReelPacing;
  captionMode: ReelCaptionMode;
  captionPlacement: ReelCaptionPlacement;
  transitionStyle: ReelTransitionStyle;
  transitionSeconds: number;
  heroBias: ExportReelDirectives["heroBias"];
  mapBias: Emphasis;
  look: import("@/lib/export-directives").ReelLook;
  audioPreset: ReelAudioPresetId;
  /** Forced ordered photo ids from AI / manual storyboard (validated upstream). */
  storyboardPhotoIds?: string[];
  /** Optional overlay captions keyed by photo id. */
  captionOverrides?: Record<string, string>;
}

export function resolveReelBuildOptions(
  reel?: ExportReelDirectives | null
): ReelBuildOptions {
  const d = defaultExportDirectives().reel!;
  const src = reel ?? d;
  const look = src.look === "memories" ? "memories" : "default";
  const maxFade = look === "memories" ? 0.9 : 0.55;
  const audioPreset = parseReelAudioPresetId(src.audioPreset);
  return {
    targetPhotoCount: src.targetPhotoCount,
    pacing: src.pacing ?? d.pacing,
    captionMode: src.captionMode ?? d.captionMode,
    captionPlacement: src.captionPlacement ?? d.captionPlacement,
    transitionStyle: src.transitionStyle ?? d.transitionStyle,
    transitionSeconds:
      typeof src.transitionSeconds === "number"
        ? Math.max(0.15, Math.min(maxFade, src.transitionSeconds))
        : look === "memories"
          ? 0.75
          : (d.transitionSeconds ?? REEL_CROSSFADE_SECONDS),
    heroBias: src.heroBias ?? d.heroBias,
    mapBias: src.mapBias ?? d.mapBias ?? "medium",
    look,
    audioPreset,
  };
}

function beatPatternForPacing(pacing: ReelPacing): readonly number[] {
  if (pacing === "calm") return [2.4, 2.9, 3.4];
  if (pacing === "punchy") return [1.6, 2.0, 2.4];
  return REEL_BEAT_PATTERN;
}

function captionStyleForPlacement(
  placement: ReelCaptionPlacement,
  index: number
): ReelCaptionStyle {
  if (placement === "center") return "pullQuote";
  if (placement === "side") return "sideAccent";
  // bottom: mild rotation still lands mostly on glassCard
  return index % 5 === 0 ? "pullQuote" : "glassCard";
}

function toDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const iso = typeof value === "string" ? value : value.toISOString();
  return isoToDateKey(iso);
}

/** Accept YYYY-MM-DD from the export UI / API; reject anything else. */
export function parseReelDayKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return key;
}

/**
 * Narrow trip inputs to one calendar day so mid-trip Instagram Reels work
 * before the journey is finished.
 */
export function filterReelInputsForDayKey(input: {
  photos: ReelPhotoInput[];
  places?: ReelPlaceInput[];
  dayNotes?: ReelDayNoteInput[];
  gpsTracks?: GpsTrackForMap[];
  dayKey: string;
}): {
  photos: ReelPhotoInput[];
  places: ReelPlaceInput[];
  dayNotes: ReelDayNoteInput[];
  gpsTracks: GpsTrackForMap[];
} {
  const dayKey = input.dayKey;
  const photos = input.photos.filter(
    (p) => toDayKey(p.exifDateTime) === dayKey
  );
  const placeNames = new Set(
    photos.map((p) => p.placeName?.trim()).filter((n): n is string => Boolean(n))
  );
  const places = (input.places ?? []).filter((place) => {
    const visited = toDayKey(place.visitedAt) ?? toDayKey(place.createdAt);
    if (visited === dayKey) return true;
    return placeNames.has(place.name.trim());
  });
  const dayNotes = (input.dayNotes ?? []).filter((n) => n.dayKey === dayKey);
  const gpsTracks = (input.gpsTracks ?? [])
    .map((track) => {
      const started = toDayKey(track.startedAt);
      const points = (track.points ?? []).filter((pt) => {
        if (!pt.at) return started === dayKey;
        return toDayKey(pt.at) === dayKey;
      });
      return { ...track, points };
    })
    .filter((track) => track.points.length >= 2);
  return { photos, places, dayNotes, gpsTracks };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function maxFramesForDuration(
  seconds: ReelDurationPreset,
  targetPhotoCount?: number
): number {
  // Photo clips only (hook/chapters/map/CTA are extra).
  // 15s ≈ 6 · 30s ≈ 10 · 60s ≈ 20.
  const softMax = seconds <= 15 ? 6 : seconds <= 30 ? 10 : 20;
  const hardMax = seconds <= 15 ? 8 : seconds <= 30 ? 14 : 24;
  const hardMin = seconds <= 15 ? 3 : seconds <= 30 ? 5 : 8;
  if (targetPhotoCount == null) return softMax;
  return Math.max(hardMin, Math.min(hardMax, targetPhotoCount));
}

/** Soft photo-clip count for duration (storyboard / UI). */
export function reelSoftMaxFrames(
  seconds: ReelDurationPreset,
  targetPhotoCount?: number
): number {
  return maxFramesForDuration(seconds, targetPhotoCount);
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

/**
 * Truncate for on-screen overlays at a word boundary (never mid-word when
 * there is at least one complete word that fits). Ellipsis is included in `max`.
 */
export function truncateAtWordBoundary(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const budget = Math.max(1, max - 1); // room for …
  let cut = t.slice(0, budget);
  const next = t[budget];
  // Mid-word cut → drop the partial token.
  if (next && !/\s/.test(next) && cut.length > 0 && !/\s/.test(cut[cut.length - 1]!)) {
    const sp = cut.lastIndexOf(" ");
    if (sp >= 1) cut = cut.slice(0, sp);
  }
  cut = cut.trimEnd();
  if (!cut) cut = t.slice(0, budget).trimEnd();
  return `${cut}…`;
}

export function clipOverlayText(text: string, max = REEL_CAPTION_MAX_CHARS): string {
  return truncateAtWordBoundary(text, max);
}

/** How many caption characters fit a clip hold at reel overlay size. */
export function captionCharBudget(holdSeconds: number): number {
  return Math.max(
    16,
    Math.min(
      REEL_CAPTION_MAX_CHARS,
      Math.floor(holdSeconds * REEL_CAPTION_CHARS_PER_SEC)
    )
  );
}

/**
 * Pick overlay text that can actually be read during the clip hold.
 * Too long → place name only (caller keeps placeName); no place → no caption.
 */
export function resolveReadableCaption(
  photo: Pick<ReelPhotoInput, "comments" | "placeComment" | "placeName">,
  holdSeconds: number
): string | null {
  const budget = captionCharBudget(holdSeconds);
  const fromComments = photo.comments?.map((c) => c.trim()).find(Boolean);
  const raw = (fromComments || photo.placeComment?.trim() || "").replace(/\s+/g, " ");
  if (!raw) return null;
  if (raw.length <= budget) return clipOverlayText(raw, budget);
  // Not readable in time — drop comment; place pin still shows via placeName.
  return null;
}

export function resolveFrameCaption(photo: ReelPhotoInput): string | null {
  // Provisional: assume a typical ~1.6 s hold until durations are fitted.
  return resolveReadableCaption(photo, 2.6);
}

/** After durations are known, drop captions that cannot be read in the hold. */
export function fitCaptionsToClipHolds(frames: ReelFramePlan[]): ReelFramePlan[] {
  return frames.map((frame) => {
    if (frame.role === "chapter" || frame.role === "hook") return frame;
    if (!frame.caption) return frame;
    const hold = Math.max(0.45, frame.durationSeconds - REEL_CROSSFADE_SECONDS);
    const budget = captionCharBudget(hold);
    // Tiny holds cannot carry text; otherwise truncate to what is readable.
    if (budget < 12 || hold < 1.0) return { ...frame, caption: null };
    return { ...frame, caption: clipOverlayText(frame.caption, budget) };
  });
}

/** Full travel-reel palette (mixed style). */
const TRANSITIONS: ReelTransition[] = [
  "fade",
  "fadeBlack",
  "slideLeft",
  "slideRight",
  "slideUp",
  "zoomSoft",
  "zoomPunch",
];

function transitionsForStyle(style: ReelTransitionStyle): ReelTransition[] {
  // Soft / Recuerdos: gentle dissolves only (still vary between clips).
  if (style === "softFade") return ["fade", "fadeBlack", "zoomSoft"];
  if (style === "fastCut") {
    return ["fade", "slideLeft", "slideRight", "slideUp", "zoomPunch"];
  }
  return TRANSITIONS;
}

/**
 * Pick a transition that fits the treatment and avoid immediate repeats
 * so consecutive photo beats don't all feel identical.
 */
export function pickTransition(
  index: number,
  treatment: ReelTreatment,
  style: ReelTransitionStyle = "mixed",
  previous: ReelTransition | null = null
): ReelTransition {
  let pool = transitionsForStyle(style);
  // Map beats stay soft — whip-slides fight the map→photo reveal.
  if (treatment === "mapFocus" || treatment === "mapInset") {
    pool = pool.filter((t) => t === "fade" || t === "fadeBlack" || t === "zoomSoft");
    if (pool.length === 0) pool = ["fade"];
  } else if (treatment === "story") {
    // Story cards read better with dissolves / soft zoom than hard slides.
    const storyPool = pool.filter(
      (t) => t === "fade" || t === "fadeBlack" || t === "zoomSoft"
    );
    if (storyPool.length > 0) pool = storyPool;
  }

  const candidates =
    previous && pool.length > 1 ? pool.filter((t) => t !== previous) : pool;
  const use = candidates.length > 0 ? candidates : pool;
  // Rotate with a prime stride so short clips don't always land on the same two cuts.
  return use[(index * 3) % use.length]!;
}

function pickCaptionStyle(
  index: number,
  placement: ReelCaptionPlacement = "bottom"
): ReelCaptionStyle {
  return captionStyleForPlacement(placement, index);
}

/**
 * Assign varied treatments so consecutive clips don't look the same.
 * Prefers story when caption exists, map/pin when place+GPS, clean otherwise.
 * Memories look: photo-first, no body map treatments (map lives in the intro).
 */
export function assignReelTreatments(
  frames: ReelFramePlan[],
  hasMap: boolean,
  opts?: Pick<
    ReelBuildOptions,
    "captionMode" | "captionPlacement" | "transitionStyle" | "mapBias" | "look"
  >
): ReelFramePlan[] {
  const recent: ReelTreatment[] = [];
  let mapFocusUsed = 0;
  let previousTransition: ReelTransition | null = null;
  const captionMode = opts?.captionMode ?? "short";
  const captionPlacement = opts?.captionPlacement ?? "bottom";
  // Memories uses the soft palette but still rotates fade / fadeBlack / zoomSoft.
  const transitionStyle: ReelTransitionStyle =
    opts?.look === "memories"
      ? "softFade"
      : (opts?.transitionStyle ?? "mixed");
  const mapBias = opts?.mapBias ?? "medium";
  const memories = opts?.look === "memories";
  const allowMapTreatments = !memories && mapBias !== "low";
  const maxMapFocus =
    mapBias === "high" ? Math.ceil(frames.length / 4) + 1 : Math.ceil(frames.length / 5) + 1;

  const out: ReelFramePlan[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    if (frame.role === "hook" || frame.role === "chapter") {
      const transitionOut = pickTransition(
        i,
        "clean",
        transitionStyle,
        previousTransition
      );
      previousTransition = transitionOut;
      out.push({
        ...frame,
        treatment: "clean" as ReelTreatment,
        layout: "full" as ReelLayout,
        transitionOut,
        captionStyle: "glassCard" as ReelCaptionStyle,
        durationSeconds:
          frame.role === "hook"
            ? memories
              ? 1.4
              : REEL_HOOK_SECONDS
            : REEL_CHAPTER_SECONDS,
      });
      continue;
    }

    const allowCaptions =
      captionMode !== "none" && captionMode !== "placeOnly";
    const hasCaption = Boolean(frame.caption) && allowCaptions;
    const hasPlace = Boolean(frame.placeName);
    const hasGps = frame.latitude != null && frame.longitude != null;
    const canMap = hasMap && hasGps && allowMapTreatments;

    // Memories: almost all clean photo holds — map is the dedicated intro beat.
    if (memories) {
      recent.push("clean");
      if (recent.length > 2) recent.shift();
      const transitionOut = pickTransition(
        i,
        "clean",
        transitionStyle,
        previousTransition
      );
      previousTransition = transitionOut;
      out.push({
        ...frame,
        treatment: "clean" as ReelTreatment,
        layout: "full" as ReelLayout,
        transitionOut,
        captionStyle: "glassCard" as ReelCaptionStyle,
        sticker: null,
        durationSeconds: Math.max(
          frame.durationSeconds,
          frame.hero ? 3.8 : 2.8
        ),
      });
      continue;
    }

    const candidates: ReelTreatment[] = [];
    if (hasCaption && captionMode === "story") candidates.push("story", "story");
    else if (hasCaption) candidates.push("story");
    if (hasPlace) candidates.push("placePin");
    if (canMap && hasPlace) {
      candidates.push("mapInset");
      if (mapFocusUsed < maxMapFocus) {
        candidates.push("mapFocus");
      }
    }
    if (!hasCaption || i % 4 === 3 || !allowCaptions) candidates.push("clean");
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
      !recent.includes("mapFocus") &&
      allowCaptions
    ) {
      treatment = "mapFocus";
    }

    if (treatment === "mapFocus") mapFocusUsed += 1;

    recent.push(treatment);
    if (recent.length > 2) recent.shift();

    const transitionOut = pickTransition(
      i,
      treatment,
      transitionStyle,
      previousTransition
    );
    previousTransition = transitionOut;

    out.push({
      ...frame,
      treatment,
      layout: treatment === "mapInset" ? "mapInset" : "full",
      transitionOut,
      captionStyle: pickCaptionStyle(
        i + (treatment === "story" ? 1 : 0),
        captionPlacement
      ),
      sticker: frame.sticker,
      durationSeconds:
        treatment === "mapFocus"
          ? // Map→photo reveal needs a real two-beat hold (was ~1.5s and felt cut).
            Math.max(frame.durationSeconds, frame.hero ? 3.4 : 3.0)
          : treatment === "mapInset"
            ? Math.max(frame.durationSeconds, frame.hero ? 3.0 : 2.6)
            : treatment === "story"
              ? Math.max(frame.durationSeconds, frame.hero ? 2.0 : 1.25)
              : frame.durationSeconds,
    });
  }
  return out;
}

export function selectReelFrames(
  photos: ReelPhotoInput[],
  durationSeconds: ReelDurationPreset,
  dayNotes: ReelDayNoteInput[] = [],
  hasMap = false,
  buildOpts?: Partial<ReelBuildOptions>
): ReelFramePlan[] {
  const opts = resolveReelBuildOptions(
    buildOpts
      ? {
          pacing: buildOpts.pacing ?? "balanced",
          captionMode: buildOpts.captionMode ?? "short",
          captionPlacement: buildOpts.captionPlacement ?? "bottom",
          transitionStyle: buildOpts.transitionStyle ?? "mixed",
          transitionSeconds: buildOpts.transitionSeconds ?? REEL_CROSSFADE_SECONDS,
          heroBias: buildOpts.heroBias ?? "medium",
          targetPhotoCount: buildOpts.targetPhotoCount,
          mapBias: buildOpts.mapBias ?? "medium",
          look: buildOpts.look ?? "default",
          audioPreset: buildOpts.audioPreset ?? "none",
        }
      : null
  );

  const captionOverrides = buildOpts?.captionOverrides ?? {};
  const storyboardIds = (buildOpts?.storyboardPhotoIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);

  const photosForPick = photos.map((p) => {
    const override = captionOverrides[p.id]?.trim();
    if (!override) return p;
    return {
      ...p,
      comments: [override, ...(p.comments ?? [])],
    };
  });

  if (storyboardIds.length > 0) {
    return selectReelFramesFromStoryboard(
      photosForPick,
      storyboardIds,
      durationSeconds,
      dayNotes,
      hasMap,
      opts
    );
  }

  return selectReelFramesAuto(
    photosForPick,
    durationSeconds,
    dayNotes,
    hasMap,
    opts
  );
}

function selectReelFramesFromStoryboard(
  photos: ReelPhotoInput[],
  storyboardIds: string[],
  durationSeconds: ReelDurationPreset,
  dayNotes: ReelDayNoteInput[],
  hasMap: boolean,
  opts: ReelBuildOptions
): ReelFramePlan[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const maxFrames = Math.min(
    maxFramesForDuration(durationSeconds, opts.targetPhotoCount),
    storyboardIds.length
  );
  const notesByDay = new Map<string, string>();
  for (const n of dayNotes) {
    if (!notesByDay.has(n.dayKey) && n.text.trim()) {
      notesByDay.set(n.dayKey, clipOverlayText(`${n.author}: ${n.text}`, 90));
    }
  }
  const usedDayNotes = new Set<string>();
  const frames: ReelFramePlan[] = [];
  const seenDays = new Set<string>();

  for (const id of storyboardIds) {
    if (frames.length >= maxFrames) break;
    const candidate = byId.get(id);
    if (!candidate) continue;
    if (!candidate.selected) continue;
    if (candidate.mediaType === "VIDEO" && !candidate.posterFilename) continue;

    const dayKey = toDayKey(candidate.exifDateTime);
    const firstOfDay = Boolean(dayKey && !seenDays.has(dayKey));
    if (dayKey) seenDays.add(dayKey);

    let dayNote: string | null = null;
    if (
      firstOfDay &&
      dayKey &&
      notesByDay.has(dayKey) &&
      !usedDayNotes.has(dayKey) &&
      opts.captionMode !== "none" &&
      opts.captionMode !== "placeOnly"
    ) {
      dayNote = notesByDay.get(dayKey) ?? null;
      usedDayNotes.add(dayKey);
    }

    const caption =
      opts.captionMode === "none" || opts.captionMode === "placeOnly"
        ? null
        : resolveFrameCaption(candidate);

    frames.push({
      photoId: candidate.id,
      dayKey,
      dayLabel: dayKey ? formatDateKey(dayKey, "short") : null,
      placeName: candidate.placeName?.trim() || null,
      highlightScore: candidate.highlightScore ?? 0,
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
      showDayChip: firstOfDay,
    });
  }

  if (frames.length === 0) {
    return selectReelFramesAuto(photos, durationSeconds, dayNotes, hasMap, opts);
  }

  const heroBudget = Math.min(3, Math.max(1, Math.floor(frames.length / 3)));
  const heroCandidates = frames
    .map((f, i) => ({
      f,
      i,
      score: computeReelPhotoPriority({
        highlightScore: f.highlightScore,
        hasCaption: Boolean(f.caption),
        placeName: f.placeName,
      }),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const heroes = new Set<number>();
  for (const c of heroCandidates) {
    if (heroes.size >= heroBudget) break;
    if ([...heroes].some((h) => Math.abs(h - c.i) < 2)) continue;
    heroes.add(c.i);
  }
  if (heroes.size === 0 && frames.length > 0) heroes.add(0);

  const withHeroes = frames.map((f, i) => ({
    ...f,
    hero: heroes.has(i),
    durationSeconds: heroes.has(i) ? 2.0 : 1.15,
    kenBurns: (i % 2 === 0 ? "in" : "out") as "in" | "out",
  }));

  return assignReelTreatments(withHeroes, hasMap, opts);
}

function selectReelFramesAuto(
  photos: ReelPhotoInput[],
  durationSeconds: ReelDurationPreset,
  dayNotes: ReelDayNoteInput[],
  hasMap: boolean,
  opts: ReelBuildOptions
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

  // Dated days ascending; undated bucket always last (never opens the story).
  const dayKeys = [...byDay.keys()].sort((a, b) => {
    if (a === "_sin_fecha") return 1;
    if (b === "_sin_fecha") return -1;
    return a.localeCompare(b);
  });
  const maxFrames = Math.min(
    maxFramesForDuration(durationSeconds, opts.targetPhotoCount),
    pool.length
  );
  const pickedIds = new Set<string>();
  const frames: ReelFramePlan[] = [];
  const pickedMeta: Array<{
    id: string;
    photoId: string;
    placeName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    exifDateTime?: Date | string | null;
  }> = [];
  const usedDayNotes = new Set<string>();
  const placeCounts = new Map<string, number>();
  // Soft place diversity: avoid stacking many clips from one café/spot.
  const maxPerPlace = Math.max(2, Math.ceil(maxFrames / Math.max(dayKeys.length, 3)));
  // Higher bar: prefer captioned / placed / high-score shots when the pool is rich.
  const minPriority =
    opts.heroBias === "high"
      ? durationSeconds <= 15
        ? 3
        : 2
      : opts.heroBias === "low"
        ? 0
        : durationSeconds <= 15
          ? 2
          : 1;

  const tryPick = (
    dayKey: string,
    candidate: ReelPhotoInput,
    firstOfDay: boolean,
    allowWeak: boolean
  ): boolean => {
    if (frames.length >= maxFrames || pickedIds.has(candidate.id)) return false;
    const caption = resolveFrameCaption(candidate);
    const priority = computeReelPhotoPriority({
      highlightScore: candidate.highlightScore,
      hasCaption: Boolean(caption),
      placeName: candidate.placeName,
      placeHighlightScore: candidate.placeHighlightScore,
    });
    if (!allowWeak && priority < minPriority && pool.length > maxFrames) {
      return false;
    }
    if (
      isNearDuplicateReelCandidate(candidate, pickedMeta, {
        maxMeters: 45,
        maxSeconds: 90,
      })
    ) {
      return false;
    }
    const pk = exportPlaceKey(candidate.placeName, null);
    if (pk && !allowWeak) {
      const used = placeCounts.get(pk) ?? 0;
      if (used >= maxPerPlace) return false;
    }
    pickedIds.add(candidate.id);
    pickedMeta.push({
      id: candidate.id,
      photoId: candidate.id,
      placeName: candidate.placeName,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      exifDateTime: candidate.exifDateTime,
    });
    if (pk) placeCounts.set(pk, (placeCounts.get(pk) ?? 0) + 1);
    const realDay = dayKey === "_sin_fecha" ? null : dayKey;
    let dayNote: string | null = null;
    if (
      firstOfDay &&
      realDay &&
      notesByDay.has(realDay) &&
      !usedDayNotes.has(realDay) &&
      opts.captionMode !== "none" &&
      opts.captionMode !== "placeOnly"
    ) {
      dayNote = notesByDay.get(realDay) ?? null;
      usedDayNotes.add(realDay);
    }
    frames.push({
      photoId: candidate.id,
      dayKey: realDay,
      dayLabel: realDay ? formatDateKey(realDay, "short") : null,
      placeName: candidate.placeName?.trim() || null,
      highlightScore: candidate.highlightScore ?? 0,
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
      showDayChip: Boolean(firstOfDay && realDay),
    });
    return true;
  };

  // Chronological fill: walk days in order, take a fair quota from each (priority-sorted).
  for (let di = 0; di < dayKeys.length; di++) {
    if (frames.length >= maxFrames) break;
    const dayKey = dayKeys[di]!;
    const list = byDay.get(dayKey) ?? [];
    const daysLeft = dayKeys.length - di;
    const quota = Math.min(
      list.length,
      Math.max(1, Math.ceil((maxFrames - frames.length) / daysLeft))
    );
    let taken = 0;
    let firstOfDay = true;
    for (const candidate of list) {
      if (taken >= quota || frames.length >= maxFrames) break;
      if (tryPick(dayKey, candidate, firstOfDay, taken > 0 || list.length <= quota)) {
        taken += 1;
        firstOfDay = false;
      }
    }
  }

  // Top up remaining slots in the same chronological day order (weaker shots ok).
  if (frames.length < maxFrames) {
    for (const dayKey of dayKeys) {
      if (frames.length >= maxFrames) break;
      const list = byDay.get(dayKey) ?? [];
      const alreadyInDay = frames.some(
        (f) => (dayKey === "_sin_fecha" ? f.dayKey == null : f.dayKey === dayKey)
      );
      let firstOfDay = !alreadyInDay;
      for (const candidate of list) {
        if (frames.length >= maxFrames) break;
        if (tryPick(dayKey, candidate, firstOfDay, true)) {
          firstOfDay = false;
        }
      }
    }
  }

  const heroBudget =
    opts.heroBias === "high"
      ? durationSeconds <= 15
        ? 3
        : 4
      : opts.heroBias === "low"
        ? durationSeconds <= 15
          ? 1
          : 2
        : durationSeconds <= 15
          ? 2
          : 3;
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

  return assignReelTreatments(withHeroes, hasMap, opts);
}

/** Apply captionMode after durations are known. */
export function applyReelCaptionMode(
  frames: ReelFramePlan[],
  mode: ReelCaptionMode
): ReelFramePlan[] {
  if (mode === "short" || mode === "story") return frames;
  return frames.map((frame) => {
    if (frame.role === "chapter" || frame.role === "hook") return frame;
    if (mode === "none") {
      return { ...frame, caption: null, dayNote: null };
    }
    // placeOnly
    return { ...frame, caption: null, dayNote: null };
  });
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

/** Airport pins for the flights overview (same markers as Lugares → Trayecto). */
function collectFlightMapPoints(photos: ReelPhotoInput[]): ReelMapPoint[] {
  const { outbound, inbound } = resolveFlightLegs(
    photos.map((p) => ({
      id: p.id,
      url: "",
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      isTransportStart: p.isTransportStart,
      isTransportEnd: p.isTransportEnd,
      exifDateTime: toIso(p.exifDateTime),
      user: { alias: "" },
    }))
  );
  const points: ReelMapPoint[] = [];
  if (
    outbound?.hasGps &&
    outbound.photo.latitude != null &&
    outbound.photo.longitude != null
  ) {
    points.push({
      lat: outbound.photo.latitude,
      lng: outbound.photo.longitude,
      kind: "flight",
      label: `${FLIGHT_OUT_EMOJI} ${outbound.label}`,
      at: outbound.photo.exifDateTime,
    });
  }
  if (
    inbound?.hasGps &&
    inbound.photo.latitude != null &&
    inbound.photo.longitude != null
  ) {
    // Keep vuelta even when GPS matches ida — labels differ; coalesce later.
    points.push({
      lat: inbound.photo.latitude,
      lng: inbound.photo.longitude,
      kind: "flight",
      label: `${FLIGHT_IN_EMOJI} ${inbound.label}`,
      at: inbound.photo.exifDateTime,
    });
  }
  return points;
}

/** Destination centroid: prefer places; else the GPS cluster farthest from origin (skip layovers). */
function destinationCentroid(
  photos: ReelPhotoInput[],
  places: ReelPlaceInput[],
  origin: { lat: number; lng: number } | null
): { lat: number; lng: number } | null {
  const placePts = places.filter(
    (p) => p.latitude != null && p.longitude != null
  ) as Array<ReelPlaceInput & { latitude: number; longitude: number }>;
  const photoPts = photos.filter(
    (p) =>
      p.selected &&
      !p.isTransportStart &&
      !p.isTransportEnd &&
      p.latitude != null &&
      p.longitude != null
  ) as Array<ReelPhotoInput & { latitude: number; longitude: number }>;
  let pts =
    placePts.length > 0
      ? placePts.map((p) => ({ lat: p.latitude, lng: p.longitude }))
      : photoPts.map((p) => ({ lat: p.latitude, lng: p.longitude }));
  if (pts.length === 0) return null;
  if (origin) {
    // Ignore GPS near the home airport and keep the farthest cluster (destination).
    const far = pts.filter((p) => Math.hypot(p.lat - origin.lat, p.lng - origin.lng) > 2.5);
    if (far.length > 0) pts = far;
    let farthest = pts[0]!;
    let best = -1;
    for (const p of pts) {
      const d = Math.hypot(p.lat - origin.lat, p.lng - origin.lng);
      if (d > best) {
        best = d;
        farthest = p;
      }
    }
    pts = pts.filter((p) => Math.hypot(p.lat - farthest.lat, p.lng - farthest.lng) < 3);
  }
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

function sameSpot(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  eps = 0.15
): boolean {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng) < eps;
}

/**
 * Build visible flight arcs for the reel intro.
 * Prefer geometry legs when they already span home↔destination; otherwise
 * synthesize origin→destination (ida/vuelta often share the same airport GPS,
 * so adjacent-node legs alone can stop at a layover).
 */
function buildFlightOverviewLegs(
  photos: ReelPhotoInput[],
  places: ReelPlaceInput[],
  geometryLegs: Array<Array<{ lat: number; lng: number }>>
): Array<Array<{ lat: number; lng: number }>> {
  const airports = collectFlightMapPoints(photos);
  const out = airports.find((p) => p.label?.includes("ida") || p.label?.includes("Ida"));
  const inbound = airports.find((p) => p.label?.includes("vuelta") || p.label?.includes("Vuelta"));
  const origin = out ?? inbound ?? null;
  const dest = destinationCentroid(photos, places, origin);

  const synthesized: Array<Array<{ lat: number; lng: number }>> = [];
  if (origin && dest && !sameSpot(origin, dest)) {
    synthesized.push([
      { lat: origin.lat, lng: origin.lng },
      { lat: dest.lat, lng: dest.lng },
    ]);
    if (inbound && out && !sameSpot(out, inbound)) {
      synthesized.push([
        { lat: dest.lat, lng: dest.lng },
        { lat: inbound.lat, lng: inbound.lng },
      ]);
    } else if (inbound || out) {
      // Round trip to same airport: draw return as dest → origin too.
      synthesized.push([
        { lat: dest.lat, lng: dest.lng },
        { lat: origin.lat, lng: origin.lng },
      ]);
    }
  }

  const fromGeometry = geometryLegs
    .filter((leg) => leg.length >= 2)
    .filter((leg) => {
      const a = leg[0]!;
      const b = leg[leg.length - 1]!;
      return Math.hypot(a.lat - b.lat, a.lng - b.lng) > 0.05;
    });

  // Prefer synthesized home↔destination when it reaches farther than geometry
  // (geometry often stops at a layover when ida/vuelta coalesce to one node).
  if (synthesized.length > 0) {
    const synthSpan = Math.max(
      ...synthesized.map((leg) =>
        Math.hypot(leg[0]!.lat - leg.at(-1)!.lat, leg[0]!.lng - leg.at(-1)!.lng)
      )
    );
    const geoSpan =
      fromGeometry.length === 0
        ? 0
        : Math.max(
            ...fromGeometry.map((leg) =>
              Math.hypot(leg[0]!.lat - leg.at(-1)!.lat, leg[0]!.lng - leg.at(-1)!.lng)
            )
          );
    if (synthSpan >= geoSpan - 0.01) return synthesized;
  }
  return fromGeometry.length > 0 ? fromGeometry : synthesized;
}

function buildReelMapFromTravel(input: {
  photos: ReelPhotoInput[];
  places?: ReelPlaceInput[];
  gpsTrails: ReturnType<typeof buildGpsTrailPolylines>;
}): ReelMapPlan | null {
  const places = input.places ?? [];
  const nodes = coalesceRouteNodes(
    buildRouteNodesFromPhotosAndPlaces(
      input.photos.map((p) => ({
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        exifDateTime: p.exifDateTime,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
      })),
      places
        .filter(
          (p): p is ReelPlaceInput & { latitude: number; longitude: number } =>
            p.latitude != null && p.longitude != null
        )
        .map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          visitedAt: p.visitedAt ?? null,
        }))
    )
  );
  const geometry = buildDirectRouteGeometry(nodes);

  const hasTransport = input.photos.some(
    (p) =>
      (p.isTransportStart || p.isTransportEnd) &&
      p.latitude != null &&
      p.longitude != null
  );

  // Match Lugares trayecto: origin↔destination arcs with plane markers.
  if (hasTransport || hasFlightOverview(geometry)) {
    const airports = collectFlightMapPoints(input.photos);
    const flightLegs = buildFlightOverviewLegs(
      input.photos,
      places,
      (geometry?.flightLegs ?? []).map((leg) =>
        leg.map((p) => ({ lat: p.lat, lng: p.lng }))
      )
    );
    if (flightLegs.length > 0) {
      // Ensure destination endpoint is marked when airports are only origin.
      const originPin = airports[0] ?? null;
      const dest = destinationCentroid(input.photos, places, originPin);
      const pins = [...airports];
      if (
        dest &&
        !pins.some((p) => sameSpot(p, dest))
      ) {
        pins.push({
          lat: dest.lat,
          lng: dest.lng,
          kind: "flight",
          label: "🛬 Destino",
          at: null,
        });
      }
      const flightPlan = buildReelMapPlan(pins, [], {
        overview: "flights",
        flightLegs,
      });
      if (flightPlan) return flightPlan;
    }
  }

  return buildReelMapPlan(collectMapPoints(input.photos, places), input.gpsTrails);
}

function fitClipDurations(
  frames: ReelFramePlan[],
  durationSeconds: ReelDurationPreset,
  mapIntroSeconds: number,
  titleIntroSeconds: number,
  outroSeconds: number,
  pacing: ReelPacing = "balanced",
  audioBpm: number | null = null
): ReelFramePlan[] {
  if (frames.length === 0) return frames;

  const patternList = beatPatternForPacing(pacing);
  // Beat pacing: irregular punchy lengths for clips; fixed for hook/chapter.
  let beat = 0;
  const paced = frames.map((f) => {
    if (f.role === "hook") {
      return {
        ...f,
        durationSeconds: audioBpm
          ? snapDurationToBpm(REEL_HOOK_SECONDS, audioBpm, 1.2)
          : REEL_HOOK_SECONDS,
      };
    }
    if (f.role === "chapter") {
      return {
        ...f,
        durationSeconds: audioBpm
          ? snapDurationToBpm(REEL_CHAPTER_SECONDS, audioBpm, 1.4)
          : REEL_CHAPTER_SECONDS,
      };
    }
    const pattern = patternList[beat % patternList.length]!;
    beat += 1;
    const base = f.hero ? Math.max(pattern, pacing === "punchy" ? 1.5 : 1.85) : pattern;
    const isMap = f.treatment === "mapFocus" || f.treatment === "mapInset";
    let boosted = isMap
      ? Math.max(base, f.treatment === "mapFocus" ? (f.hero ? 3.4 : 3.0) : f.hero ? 3.0 : 2.6)
      : f.treatment === "story"
        ? Math.max(base, f.hero ? 1.85 : 1.15)
        : base;
    if (audioBpm) {
      boosted = snapDurationToBpm(boosted, audioBpm, isMap ? 2.4 : 1.1);
    }
    return { ...f, durationSeconds: boosted };
  });

  const fixed = mapIntroSeconds + titleIntroSeconds + outroSeconds;
  const budget = Math.max(durationSeconds - fixed, paced.length * 0.55);
  const baseSum = paced.reduce((s, f) => s + f.durationSeconds, 0);
  if (baseSum <= 0) return paced;
  const scale = budget / baseSum;
  return paced.map((f) => {
    if (f.role === "hook" || f.role === "chapter") return f;
    // Keep holds usable after subtracting crossfade in the encoder.
    const hasText = Boolean(f.caption || f.dayNote);
    const isMap = f.treatment === "mapFocus" || f.treatment === "mapInset";
    // durationSeconds includes outgoing crossfade; keep readable on-screen hold.
    const minHold = isMap
      ? f.treatment === "mapFocus"
        ? 2.8
        : 2.4
      : hasText
        ? REEL_CAPTION_MIN_HOLD_SECONDS
        : pacing === "punchy"
          ? 1.0
          : pacing === "calm"
            ? 1.5
            : 1.25;
    const min = minHold + REEL_CROSSFADE_SECONDS * 0.85;
    const max = isMap
      ? 5.0
      : pacing === "punchy"
        ? hasText || f.hero
          ? 3.4
          : 2.4
        : pacing === "calm"
          ? hasText || f.hero
            ? 4.2
            : 3.2
          : hasText || f.hero
            ? 3.8
            : 2.8;
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
      }) +
      (a.hero ? 3 : 0) +
      // Prefer a still that already carries place context — better Instagram cover.
      (a.placeName ? 1.5 : 0) +
      ((a.highlightScore ?? 0) >= 8 ? 2 : 0);
    const scoreB =
      computeReelPhotoPriority({
        highlightScore: b.highlightScore,
        hasCaption: Boolean(b.caption),
        placeName: b.placeName,
      }) +
      (b.hero ? 3 : 0) +
      (b.placeName ? 1.5 : 0) +
      ((b.highlightScore ?? 0) >= 8 ? 2 : 0);
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

function insertDayChapters(
  frames: ReelFramePlan[],
  opts?: { skipDayKey?: string | null }
): ReelFramePlan[] {
  const dayKeys = [
    ...new Set(frames.map((f) => f.dayKey).filter((k): k is string => Boolean(k))),
  ].sort((a, b) => a.localeCompare(b));
  if (dayKeys.length < 2) return frames;

  const skipDayKey = opts?.skipDayKey ?? null;
  const out: ReelFramePlan[] = [];
  const openedDays = new Set<string>();
  let chapterCount = 0;
  for (const frame of frames) {
    // Skip chapter for the hook's day — hook already opened that day, so a
    // "Día 1" card right after felt like the same photo in staged repeats.
    if (
      frame.role === "clip" &&
      frame.dayKey &&
      !openedDays.has(frame.dayKey)
    ) {
      if (skipDayKey && frame.dayKey === skipDayKey) {
        openedDays.add(frame.dayKey);
      } else if (chapterCount < 4) {
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
          showDayChip: false,
        });
        chapterCount += 1;
        openedDays.add(frame.dayKey);
      } else {
        openedDays.add(frame.dayKey);
      }
    }
    out.push(frame);
  }
  return out;
}

function buildCtaLine(
  title: string,
  participants: string[],
  dayLabel?: string | null
): string {
  const who =
    participants.length > 0 ? participants.slice(0, 3).join(" · ") : null;
  const subject = dayLabel ? `${title} · ${dayLabel}` : title;
  if (who) return `${subject} — ¿cuál fue vuestro momento? 👇`;
  return `Comenta tu parada favorita de ${subject} 👇`;
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
  /** Grounded free-text brief directives (UI duration still wins). */
  reelDirectives?: ExportReelDirectives | null;
  briefInterpretation?: string | null;
  /** Limit montage to one calendar day (YYYY-MM-DD). */
  dayKey?: string | null;
  /** Optional forced storyboard order (AI / manual). */
  storyboardPhotoIds?: string[] | null;
  captionOverrides?: Record<string, string> | null;
}): ReelManifest {
  const durationSeconds = input.durationSeconds;
  const resolvedOpts = resolveReelBuildOptions(input.reelDirectives ?? null);
  const buildOpts: ReelBuildOptions = {
    ...resolvedOpts,
    ...(input.storyboardPhotoIds?.length
      ? { storyboardPhotoIds: input.storyboardPhotoIds }
      : {}),
    ...(input.captionOverrides && Object.keys(input.captionOverrides).length > 0
      ? { captionOverrides: input.captionOverrides }
      : {}),
  };
  const scopeDayKey = parseReelDayKey(input.dayKey) ?? null;
  const scoped = scopeDayKey
    ? filterReelInputsForDayKey({
        photos: input.photos,
        places: input.places,
        dayNotes: input.dayNotes,
        gpsTracks: input.gpsTracks,
        dayKey: scopeDayKey,
      })
    : {
        photos: input.photos,
        places: input.places ?? [],
        dayNotes: input.dayNotes ?? [],
        gpsTracks: input.gpsTracks ?? [],
      };

  // Prefer tracks marked for export; if none, still show any recorded trails.
  const exportMarked = scoped.gpsTracks.filter((t) => t.includeInExport);
  const trailSource =
    exportMarked.length > 0 ? exportMarked : scoped.gpsTracks;
  const gpsTrails = buildGpsTrailPolylines(trailSource);

  const map = buildReelMapFromTravel({
    photos: scoped.photos,
    places: scoped.places,
    gpsTrails,
  });
  const memories = buildOpts.look === "memories";
  const mapIntroSeconds = map
    ? memories
      ? REEL_MEMORIES_MAP_INTRO_SECONDS
      : REEL_MAP_INTRO_SECONDS
    : 0;
  const outroSeconds = memories
    ? REEL_MEMORIES_OUTRO_SECONDS
    : REEL_OUTRO_SECONDS;

  let frames = selectReelFrames(
    scoped.photos,
    durationSeconds,
    scoped.dayNotes,
    Boolean(map),
    buildOpts
  );

  const best = pickBestCoverFrame(frames);
  const coverPhotoId = best?.photoId ?? frames[0]?.photoId ?? null;
  // Hook already punches with the best still; map intro also paints the title.
  // A third "title" beat on the same cover looked like a broken loop (cover→map→cover).
  // Memories: give a soft title card when there is no map to carry the name.
  const titleIntroSeconds =
    best || map
      ? memories && !map
        ? REEL_MEMORIES_TITLE_INTRO_SECONDS
        : 0
      : memories
        ? REEL_MEMORIES_TITLE_INTRO_SECONDS
        : REEL_TITLE_INTRO_SECONDS;
  if (best) {
    // Drop the cover still from the body so Día 1 does not re-open on the same photo.
    const body = frames.filter((f) => f.photoId !== best.photoId);
    frames = [
      buildHookFrame(best),
      ...(memories
        ? body.length > 0
          ? body
          : frames.filter((f) => f.role === "clip")
        : insertDayChapters(body.length > 0 ? body : frames, {
            // If the hook still is from day 1, skip that day's chapter card.
            skipDayKey: best.dayKey,
          })),
    ];
  } else {
    frames = memories ? frames : insertDayChapters(frames);
  }

  const audioPreset = buildOpts.audioPreset;
  const audioMeta = getReelAudioPreset(audioPreset);
  const audioBpm = audioMeta.bpm;

  frames = fitClipDurations(
    frames,
    durationSeconds,
    mapIntroSeconds,
    titleIntroSeconds,
    outroSeconds,
    buildOpts.pacing,
    audioBpm
  );
  frames = fitCaptionsToClipHolds(frames);
  frames = applyReelCaptionMode(frames, buildOpts.captionMode);
  if (memories) {
    // Keep soft transition variety from assignReelTreatments; only strip text chrome.
    frames = frames.map((f) => ({
      ...f,
      caption: null,
      dayNote: null,
      sticker: null,
    }));
  }

  const avgClip =
    frames.length > 0
      ? frames.reduce((s, f) => s + f.durationSeconds, 0) / frames.length
      : 1.2;

  let dateRangeLabel: string | null = null;
  if (scopeDayKey) {
    dateRangeLabel = formatDateKey(scopeDayKey, "long");
  } else {
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
  }

  const dayShortLabel = scopeDayKey ? formatDateKey(scopeDayKey, "short") : null;

  return {
    title: input.title,
    participants: input.participants,
    dateRangeLabel,
    durationSeconds,
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    fps: REEL_FPS,
    secondsPerClip: avgClip,
    crossfadeSeconds: buildOpts.transitionSeconds,
    mapIntroSeconds,
    titleIntroSeconds,
    outroSeconds,
    map,
    frames,
    coverPhotoId,
    ctaLine: buildCtaLine(input.title, input.participants, dayShortLabel),
    briefInterpretation: input.briefInterpretation ?? null,
    appliedReelDirectives: input.reelDirectives
      ? {
          ...resolvedOpts,
          ...(input.reelDirectives.durationSeconds
            ? { durationSeconds: input.reelDirectives.durationSeconds }
            : {}),
        }
      : null,
    look: buildOpts.look,
    scopeDayKey,
    audioPreset,
    audioBpm,
  };
}

export function reelReadmeText(manifest: ReelManifest): string {
  const mapLine = manifest.map
    ? manifest.map.overview === "flights"
      ? `- Incluye intro con mapa de trayecto (${manifest.map.flightLegs.length} tramos de vuelo + aviones).\n`
      : `- Incluye intro con mapa (${manifest.map.points.length} puntos GPS/lugares)${
          (manifest.map.gpsTrails?.length ?? 0) > 0 ? " + trail GPS animado" : ""
        }.\n`
    : "";
  const treatments = [...new Set(manifest.frames.map((f) => f.treatment))].join(", ");
  const scopeLine = manifest.scopeDayKey
    ? `Ámbito: un día (${manifest.dateRangeLabel ?? manifest.scopeDayKey})\n`
    : "Ámbito: viaje completo\n";
  return `Reel listo para Instagram
===========================

Archivo: instagram-reel.mp4
Formato: MP4 H.264, ${manifest.width}×${manifest.height} (9:16), ${manifest.fps} fps
Duración objetivo: ~${manifest.durationSeconds} s
${scopeLine}Audio: ${
    manifest.audioPreset && manifest.audioPreset !== "none"
      ? `cama tipada «${manifest.audioPreset}»${manifest.audioBpm ? ` (~${manifest.audioBpm} BPM)` : ""} (sintetizada; puedes sustituirla en Instagram)`
      : "sin pista (añade música en Instagram; presets soft-pulse / travel-beat opcionales)"
  }
Estructura: ${
    manifest.look === "memories"
      ? "gancho → mapa cinematográfico → fotos con fundidos → cierre suave"
      : "gancho → mapa → título → capítulos/clips → CTA"
  }
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
