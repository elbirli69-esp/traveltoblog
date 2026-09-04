/**
 * Typed presentation directives for exports (HTML / reel / PDF).
 * Produced by interpretExportBrief from free-text user needs — never free CSS/MP4.
 */

export type Emphasis = "low" | "medium" | "high";

export type ReelPacing = "calm" | "balanced" | "punchy";
export type ReelCaptionMode = "none" | "placeOnly" | "short" | "story";
export type ReelCaptionPlacement = "bottom" | "center" | "side";
export type ReelTransitionStyle = "softFade" | "mixed" | "fastCut";
export type ReelDurationPreset = 15 | 30 | 60;

export interface ExportHtmlDirectives {
  imageEmphasis: Emphasis;
  galleryEmphasis: Emphasis;
  proseDensity: Emphasis;
  placeCallouts: Emphasis;
  mapEmphasis: Emphasis;
  preferSectionOrder?: Array<
    "timeline" | "gallery" | "map" | "guide" | "closing"
  >;
}

export interface ExportReelDirectives {
  /** Only applied when the UI duration selector does not override (UI wins). */
  durationSeconds?: ReelDurationPreset;
  targetPhotoCount?: number;
  pacing: ReelPacing;
  captionMode: ReelCaptionMode;
  captionPlacement: ReelCaptionPlacement;
  transitionStyle: ReelTransitionStyle;
  transitionSeconds?: number;
  heroBias: Emphasis;
}

export interface ExportPdfDirectives {
  imageEmphasis: Emphasis;
  proseDensity: Emphasis;
  preferFullBleed: Emphasis;
  mosaicBias: Emphasis;
}

export interface ExportDirectives {
  version: 1;
  /** Short echo of what we understood from the free text (UI). */
  interpretation?: string;
  html?: ExportHtmlDirectives;
  reel?: ExportReelDirectives;
  pdf?: ExportPdfDirectives;
}

const EMPHASIS: Emphasis[] = ["low", "medium", "high"];
const PACING: ReelPacing[] = ["calm", "balanced", "punchy"];
const CAPTION_MODE: ReelCaptionMode[] = [
  "none",
  "placeOnly",
  "short",
  "story",
];
const CAPTION_PLACE: ReelCaptionPlacement[] = ["bottom", "center", "side"];
const TRANSITION: ReelTransitionStyle[] = ["softFade", "mixed", "fastCut"];
const SECTION_ORDER = [
  "timeline",
  "gallery",
  "map",
  "guide",
  "closing",
] as const;

function isEmphasis(v: unknown): v is Emphasis {
  return typeof v === "string" && (EMPHASIS as string[]).includes(v);
}

function clampNumber(n: unknown, min: number, max: number): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseDuration(v: unknown): ReelDurationPreset | undefined {
  if (v === 15 || v === "15") return 15;
  if (v === 30 || v === "30") return 30;
  if (v === 60 || v === "60") return 60;
  return undefined;
}

export function defaultExportDirectives(): ExportDirectives {
  return {
    version: 1,
    html: {
      imageEmphasis: "medium",
      galleryEmphasis: "medium",
      proseDensity: "medium",
      placeCallouts: "medium",
      mapEmphasis: "medium",
    },
    reel: {
      pacing: "balanced",
      captionMode: "short",
      captionPlacement: "bottom",
      transitionStyle: "mixed",
      transitionSeconds: 0.4,
      heroBias: "medium",
    },
    pdf: {
      imageEmphasis: "medium",
      proseDensity: "medium",
      preferFullBleed: "medium",
      mosaicBias: "medium",
    },
  };
}

function clampHtml(
  raw: Record<string, unknown> | undefined
): ExportHtmlDirectives {
  const d = defaultExportDirectives().html!;
  if (!raw) return d;
  const order = Array.isArray(raw.preferSectionOrder)
    ? raw.preferSectionOrder.filter(
        (x): x is (typeof SECTION_ORDER)[number] =>
          typeof x === "string" &&
          (SECTION_ORDER as readonly string[]).includes(x)
      )
    : undefined;
  return {
    imageEmphasis: isEmphasis(raw.imageEmphasis) ? raw.imageEmphasis : d.imageEmphasis,
    galleryEmphasis: isEmphasis(raw.galleryEmphasis)
      ? raw.galleryEmphasis
      : d.galleryEmphasis,
    proseDensity: isEmphasis(raw.proseDensity) ? raw.proseDensity : d.proseDensity,
    placeCallouts: isEmphasis(raw.placeCallouts) ? raw.placeCallouts : d.placeCallouts,
    mapEmphasis: isEmphasis(raw.mapEmphasis) ? raw.mapEmphasis : d.mapEmphasis,
    ...(order && order.length > 0 ? { preferSectionOrder: order } : {}),
  };
}

function clampReel(
  raw: Record<string, unknown> | undefined,
  durationHint?: ReelDurationPreset
): ExportReelDirectives {
  const d = defaultExportDirectives().reel!;
  if (!raw) return { ...d };
  const durationSeconds = parseDuration(raw.durationSeconds);
  const target = clampNumber(raw.targetPhotoCount, 3, 24);
  const transitionSec =
    typeof raw.transitionSeconds === "number" && Number.isFinite(raw.transitionSeconds)
      ? Math.max(0.15, Math.min(0.55, raw.transitionSeconds))
      : d.transitionSeconds;

  const bandMax =
    (durationHint ?? durationSeconds ?? 30) <= 15
      ? 8
      : (durationHint ?? durationSeconds ?? 30) <= 30
        ? 14
        : 24;
  const bandMin =
    (durationHint ?? durationSeconds ?? 30) <= 15
      ? 3
      : (durationHint ?? durationSeconds ?? 30) <= 30
        ? 5
        : 8;

  return {
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(target != null
      ? { targetPhotoCount: Math.max(bandMin, Math.min(bandMax, target)) }
      : {}),
    pacing:
      typeof raw.pacing === "string" && (PACING as string[]).includes(raw.pacing)
        ? (raw.pacing as ReelPacing)
        : d.pacing,
    captionMode:
      typeof raw.captionMode === "string" &&
      (CAPTION_MODE as string[]).includes(raw.captionMode)
        ? (raw.captionMode as ReelCaptionMode)
        : d.captionMode,
    captionPlacement:
      typeof raw.captionPlacement === "string" &&
      (CAPTION_PLACE as string[]).includes(raw.captionPlacement)
        ? (raw.captionPlacement as ReelCaptionPlacement)
        : d.captionPlacement,
    transitionStyle:
      typeof raw.transitionStyle === "string" &&
      (TRANSITION as string[]).includes(raw.transitionStyle)
        ? (raw.transitionStyle as ReelTransitionStyle)
        : d.transitionStyle,
    transitionSeconds: transitionSec,
    heroBias: isEmphasis(raw.heroBias) ? raw.heroBias : d.heroBias,
  };
}

function clampPdf(
  raw: Record<string, unknown> | undefined
): ExportPdfDirectives {
  const d = defaultExportDirectives().pdf!;
  if (!raw) return d;
  return {
    imageEmphasis: isEmphasis(raw.imageEmphasis) ? raw.imageEmphasis : d.imageEmphasis,
    proseDensity: isEmphasis(raw.proseDensity) ? raw.proseDensity : d.proseDensity,
    preferFullBleed: isEmphasis(raw.preferFullBleed)
      ? raw.preferFullBleed
      : d.preferFullBleed,
    mosaicBias: isEmphasis(raw.mosaicBias) ? raw.mosaicBias : d.mosaicBias,
  };
}

/**
 * Parse unknown JSON into clamped ExportDirectives.
 * Unknown keys are dropped; missing fields fall back to safe defaults.
 */
export function parseExportDirectives(
  raw: unknown,
  opts?: { durationHint?: ReelDurationPreset }
): ExportDirectives {
  const base = defaultExportDirectives();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const interpretation =
    typeof obj.interpretation === "string"
      ? obj.interpretation.replace(/\s+/g, " ").trim().slice(0, 280) || undefined
      : undefined;

  return {
    version: 1,
    ...(interpretation ? { interpretation } : {}),
    html: clampHtml(
      obj.html && typeof obj.html === "object"
        ? (obj.html as Record<string, unknown>)
        : undefined
    ),
    reel: clampReel(
      obj.reel && typeof obj.reel === "object"
        ? (obj.reel as Record<string, unknown>)
        : undefined,
      opts?.durationHint
    ),
    pdf: clampPdf(
      obj.pdf && typeof obj.pdf === "object"
        ? (obj.pdf as Record<string, unknown>)
        : undefined
    ),
  };
}

/** Human-readable chip summary of reel directives. */
export function summarizeReelDirectives(reel: ExportReelDirectives): string {
  const bits: string[] = [];
  if (reel.targetPhotoCount != null) {
    bits.push(`~${reel.targetPhotoCount} fotos`);
  }
  bits.push(
    reel.pacing === "calm"
      ? "ritmo calmado"
      : reel.pacing === "punchy"
        ? "ritmo rápido"
        : "ritmo equilibrado"
  );
  bits.push(
    reel.captionMode === "none"
      ? "sin textos"
      : reel.captionMode === "placeOnly"
        ? "solo lugares"
        : reel.captionMode === "story"
          ? "textos narrativos"
          : "textos cortos"
  );
  bits.push(
    reel.transitionStyle === "softFade"
      ? "fundidos suaves"
      : reel.transitionStyle === "fastCut"
        ? "cortes rápidos"
        : "transiciones mixtas"
  );
  if (reel.heroBias === "high") bits.push("prioriza highlights");
  if (reel.heroBias === "low") bits.push("mezcla abierta");
  return bits.join(" · ");
}

/** Human-readable chip summary of HTML directives. */
export function summarizeHtmlDirectives(html: ExportHtmlDirectives): string {
  const label = (e: Emphasis, high: string, low: string, mid: string) =>
    e === "high" ? high : e === "low" ? low : mid;
  return [
    label(html.imageEmphasis, "fotos grandes", "fotos compactas", "fotos medias"),
    label(html.galleryEmphasis, "galería protagonista", "galería discreta", "galería normal"),
    label(html.proseDensity, "más crónica", "poca prosa", "prosa equilibrada"),
    label(html.placeCallouts, "guía destacada", "guía ligera", "guía normal"),
    label(html.mapEmphasis, "mapa grande", "mapa compacto", "mapa normal"),
  ].join(" · ");
}

/** Body class list from HTML directives (for CSS knobs). */
export function htmlDirectiveBodyClasses(html: ExportHtmlDirectives): string {
  return [
    "export-dir",
    `export-dir--images-${html.imageEmphasis}`,
    `export-dir--gallery-${html.galleryEmphasis}`,
    `export-dir--prose-${html.proseDensity}`,
    `export-dir--callouts-${html.placeCallouts}`,
    `export-dir--map-${html.mapEmphasis}`,
  ].join(" ");
}
