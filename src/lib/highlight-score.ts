/** Global prominence 0–10 for Reel + HTML export. Default 5 = neutral (no change). */
export const HIGHLIGHT_SCORE_DEFAULT = 5;
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

/** Deviation from neutral: 0 at score 5. */
export function highlightDelta(score: number): number {
  return clampHighlightScore(score) - HIGHLIGHT_SCORE_DEFAULT;
}

export type ExportHighlightTier = "featured" | "accent" | "normal" | "subtle" | "minimal";

export function exportHighlightTier(score: number): ExportHighlightTier {
  const s = clampHighlightScore(score);
  if (s >= 8) return "featured";
  if (s >= 6) return "accent";
  if (s === 5) return "normal";
  if (s === 0) return "minimal";
  return "subtle";
}

export function exportHighlightClass(score: number, prefix: string): string {
  const tier = exportHighlightTier(score);
  return tier === "normal" ? "" : `${prefix}--${tier}`;
}

/** Higher scores first; 0 always last (still included if selected). */
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
  const score = clampHighlightScore(input.highlightScore ?? HIGHLIGHT_SCORE_DEFAULT);
  let p = highlightDelta(score) * 3;
  if (input.hasCaption) p += 2;
  if (input.placeName) p += 1;
  if (input.placeHighlightScore != null) {
    p += highlightDelta(input.placeHighlightScore) * 1.5;
  }
  if (score === 0) p -= 120;
  return p;
}
