/**
 * Match free-text brief + typed reel directives → montage preset.
 *
 * Duration stays on the UI selector. UI preset wins unless the user clicks
 * "Aplicar sugerencia". Strong caption/rhythm cues outweigh generic defaults.
 */

import type { ExportReelDirectives, Emphasis } from "@/lib/export-directives";
import {
  REEL_PRESET_CATALOG,
  getReelPresetCatalogEntry,
  type ReelPresetCatalogEntry,
  type ReelPresetId,
} from "@/lib/export/reel-preset-catalog";

export interface ReelPresetMatchInput {
  brief?: string;
  directives: ExportReelDirectives;
  /** Current UI preset selection. */
  uiPreset?: ReelPresetId | null;
}

export interface ReelPresetMatchResult {
  entry: ReelPresetCatalogEntry;
  suggestedPresetId: ReelPresetId;
  score: number;
  reasons: string[];
  unmet: string[];
  differsFromUi: boolean;
}

const EMPHASIS_RANK: Record<Emphasis, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeBrief(brief: string): string {
  return brief
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Explicit preset naming (highest priority). */
const NAMED_PRESET_CUES: Array<{ id: ReelPresetId; re: RegExp }> = [
  {
    id: "calm-story",
    re: /\bcronica\s+calmada\b|\bcalm\s+story\b|\bpreset\s+calmad\w*\b/,
  },
  {
    id: "punchy-highlights",
    re: /\bhighlights?\s+rapidos?\b|\bpunchy\s+highlights?\b|\bpreset\s+rapido\b/,
  },
  {
    id: "textless-photos",
    re: /\bsolo\s+fotos\b|\btextless\b|\bsin\s+texto(\s+en\s+pantalla)?\b|\bpreset\s+sin\s+texto\b|\bsolo\s+imagenes?\b/,
  },
  {
    id: "place-labels",
    re: /\bnombres?\s+de\s+lugar(es)?\b|\bplace\s+labels?\b|\bpreset\s+lugares?\b|\bsolo\s+nombres?\s+de\s+(sitios?|lugares?)\b/,
  },
  {
    id: "map-pulse",
    re: /\bmapa\s+al\s+frente\b|\bmap\s+pulse\b|\bpreset\s+mapa\b|\bmapa\s+protagonista\b/,
  },
  {
    id: "balanced-story",
    re: /\bhistoria\s+equilibrada\b|\bbalanced\s+story\b|\bpreset\s+equilibrad\w*\b/,
  },
];

export function namedReelPresetInBrief(brief: string): ReelPresetId | null {
  const text = normalizeBrief(brief);
  const hits = NAMED_PRESET_CUES.filter((n) => n.re.test(text)).map((n) => n.id);
  if (hits.length === 0) return null;
  // Map + place phrases often co-occur; prefer map-pulse when the brief leads with mapa/recorrido.
  if (
    hits.includes("map-pulse") &&
    /\b(mapa|recorrido|ruta|trayecto|gps)\b/.test(text)
  ) {
    return "map-pulse";
  }
  if (hits.includes("map-pulse") && hits.includes("place-labels")) {
    return "map-pulse";
  }
  return hits[0] ?? null;
}

function enumExact<T extends string>(a: T, b: T, weight: number): number {
  return a === b ? weight : 0;
}

function emphasisClose(a: Emphasis, b: Emphasis, weight: number): number {
  const dist = Math.abs(EMPHASIS_RANK[a] - EMPHASIS_RANK[b]) / 2;
  return weight * (1 - dist);
}

function inferPhotoDensity(d: ExportReelDirectives): Emphasis {
  const n = d.targetPhotoCount;
  if (n == null) return "medium";
  if (n <= 6) return "low";
  if (n >= 12) return "high";
  return "medium";
}

function distinctiveCaption(
  mode: ExportReelDirectives["captionMode"]
): boolean {
  return mode === "none" || mode === "placeOnly" || mode === "story";
}

function scoreEntry(
  entry: ReelPresetCatalogEntry,
  directives: ExportReelDirectives,
  briefNorm: string
): { score: number; reasons: string[]; unmet: string[] } {
  const c = entry.criteria;
  const reasons: string[] = [];
  const unmet: string[] = [];
  let score = 0;

  // Caption is the strongest montage signal (0.32), with mismatch penalty when distinctive.
  if (directives.captionMode === c.captionMode) {
    score += distinctiveCaption(directives.captionMode) ? 0.36 : 0.28;
    reasons.push(
      directives.captionMode === "none"
        ? "sin textos"
        : directives.captionMode === "placeOnly"
          ? "solo lugares"
          : directives.captionMode === "story"
            ? "textos narrativos"
            : "textos cortos"
    );
  } else if (distinctiveCaption(directives.captionMode)) {
    score -= 0.12;
    unmet.push(
      `pedías captions ${directives.captionMode}; esta preset usa ${c.captionMode}`
    );
  }

  // Pacing 0.22
  const paceScore = enumExact(directives.pacing, c.pacing, 0.22);
  score += paceScore;
  if (paceScore > 0) {
    reasons.push(
      directives.pacing === "calm"
        ? "ritmo calmado"
        : directives.pacing === "punchy"
          ? "ritmo rápido"
          : "ritmo equilibrado"
    );
  }

  // Transitions 0.14
  const trScore = enumExact(directives.transitionStyle, c.transitionStyle, 0.14);
  score += trScore;
  if (trScore > 0) {
    reasons.push(
      directives.transitionStyle === "softFade"
        ? "fundidos suaves"
        : directives.transitionStyle === "fastCut"
          ? "cortes rápidos"
          : "transiciones mixtas"
    );
  }

  // Hero bias 0.12
  score += emphasisClose(directives.heroBias, c.heroBias, 0.12);
  if (directives.heroBias === "high" && c.heroBias === "high") {
    reasons.push("prioriza highlights");
  }

  // Photo density 0.08
  const density = inferPhotoDensity(directives);
  score += emphasisClose(density, c.photoDensity, 0.08);
  if (density === "low" && c.photoDensity === "low") reasons.push("pocas fotos");
  if (density === "high" && c.photoDensity === "high") reasons.push("más fotos");

  // Lexical tags / soft cues 0.12
  if (briefNorm) {
    const hits = entry.tags.filter((t) => briefNorm.includes(t.toLowerCase()));
    if (hits.length > 0) {
      score += Math.min(0.1, 0.04 * hits.length);
      reasons.push(`encaja con: ${hits.slice(0, 2).join(", ")}`);
    }
    if (
      entry.id === "map-pulse" &&
      /\b(mapa|recorrido|ruta|trayecto|gps|protagonista)\b/.test(briefNorm)
    ) {
      score += 0.1;
      reasons.push("mapa / recorrido");
    }
    if (
      entry.id === "textless-photos" &&
      /\b(sin\s+texto|solo\s+fotos|solo\s+imagenes|mute|sin\s+letra)\b/.test(
        briefNorm
      )
    ) {
      score += 0.12;
      reasons.push("sin texto en pantalla");
    }
    if (
      entry.id === "calm-story" &&
      /\b(tranquil|calmad|lent|suave|pausad|cronica)\b/.test(briefNorm)
    ) {
      score += 0.06;
    }
    if (
      entry.id === "punchy-highlights" &&
      /\b(rapid|dinam|punchy|cortes?|highlights?|muchas?\s+fotos)\b/.test(
        briefNorm
      )
    ) {
      score += 0.06;
    }
  }

  score += (7 - entry.uiOrder) * 0.001;

  return {
    score: Math.max(0, Math.min(1, score)),
    reasons: unique(reasons),
    unmet: unique(unmet),
  };
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Pick the best reel montage preset for the brief + directives.
 * Does not mutate the UI selection; callers decide whether to apply.
 */
export function matchReelPresetCatalog(
  input: ReelPresetMatchInput
): ReelPresetMatchResult {
  const uiPreset = input.uiPreset ?? "balanced-story";
  const briefNorm = normalizeBrief(input.brief ?? "");
  const namedId = namedReelPresetInBrief(input.brief ?? "");

  if (namedId) {
    const namedEntry = getReelPresetCatalogEntry(namedId)!;
    const meta = scoreEntry(namedEntry, input.directives, briefNorm);
    return {
      entry: namedEntry,
      suggestedPresetId: namedEntry.id,
      score: Math.max(meta.score, 0.85),
      reasons: unique([`pediste ${namedEntry.label}`, ...meta.reasons]),
      unmet: meta.unmet,
      differsFromUi: namedEntry.id !== uiPreset,
    };
  }

  let best: ReelPresetCatalogEntry | undefined;
  let bestScore = -1;
  let bestMeta = { reasons: [] as string[], unmet: [] as string[] };

  for (const entry of REEL_PRESET_CATALOG) {
    const meta = scoreEntry(entry, input.directives, briefNorm);
    if (
      meta.score > bestScore ||
      (meta.score === bestScore &&
        (best == null || entry.uiOrder < best.uiOrder))
    ) {
      best = entry;
      bestScore = meta.score;
      bestMeta = meta;
    }
  }

  const entry =
    best ??
    getReelPresetCatalogEntry(uiPreset) ??
    REEL_PRESET_CATALOG[0]!;

  return {
    entry,
    suggestedPresetId: entry.id,
    score: bestScore < 0 ? 0 : bestScore,
    reasons: unique(bestMeta.reasons),
    unmet: unique(bestMeta.unmet),
    differsFromUi: entry.id !== uiPreset,
  };
}
