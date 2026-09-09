/**
 * Global prominence 0–10 for Reel + HTML/PDF export.
 * 0 = unscored (default). 5 = intentional mid. Higher = more weight.
 */
export const HIGHLIGHT_SCORE_DEFAULT = 0;
/** Mid-scale intentional score (delta baseline for Reel priority). */
export const HIGHLIGHT_SCORE_NEUTRAL = 5;
export const HIGHLIGHT_SCORE_MIN = 0;
export const HIGHLIGHT_SCORE_MAX = 10;

export function clampHighlightScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return HIGHLIGHT_SCORE_DEFAULT;
  return Math.max(
    HIGHLIGHT_SCORE_MIN,
    Math.min(HIGHLIGHT_SCORE_MAX, Math.round(n))
  );
}

/** Resolve DB/API nullish to the unscored default. */
export function resolveHighlightScore(value: number | null | undefined): number {
  return clampHighlightScore(value ?? HIGHLIGHT_SCORE_DEFAULT);
}

/** Deviation from mid-scale (5): 0 at intentional mid; unscored (0) is −5. */
export function highlightDelta(score: number): number {
  return clampHighlightScore(score) - HIGHLIGHT_SCORE_NEUTRAL;
}

export type ExportHighlightTier = "featured" | "accent" | "normal" | "subtle" | "minimal";

export function exportHighlightTier(score: number): ExportHighlightTier {
  const s = clampHighlightScore(score);
  if (s >= 8) return "featured";
  if (s >= 6) return "accent";
  // 0 = unscored (no CSS de-emphasis); 5 = intentional mid — both "normal".
  if (s === 0 || s === 5) return "normal";
  if (s <= 2) return "minimal";
  return "subtle";
}

export function exportHighlightClass(score: number, prefix: string): string {
  const tier = exportHighlightTier(score);
  return tier === "normal" ? "" : `${prefix}--${tier}`;
}

/** Higher scores first; 0 (unscored) always last (still included if selected). */
export function compareHighlightScore(a: number, b: number): number {
  const sa = clampHighlightScore(a);
  const sb = clampHighlightScore(b);
  if (sa === 0 && sb !== 0) return 1;
  if (sb === 0 && sa !== 0) return -1;
  return sb - sa;
}

export interface ReelPriorityInput {
  highlightScore?: number;
  hasCaption?: boolean;
  placeName?: string | null;
  placeHighlightScore?: number | null;
}

/** Composite sort key for reel frame picking (higher = earlier). */
export function computeReelPhotoPriority(input: ReelPriorityInput): number {
  const score = resolveHighlightScore(input.highlightScore);
  // Unscored (0): flat baseline. Any intentional score uses mid-scale delta,
  // plus a small “was rated” bump so 5 beats 0.
  let p = score === 0 ? 0 : highlightDelta(score) * 3 + 1;
  if (input.hasCaption) p += 2;
  if (input.placeName) p += 1;
  if (input.placeHighlightScore != null && input.placeHighlightScore !== 0) {
    p += highlightDelta(input.placeHighlightScore) * 1.5;
  }
  return p;
}
