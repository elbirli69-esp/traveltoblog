"use client";

import {
  buildBlogCompleteness,
  type BlogGapActionKind,
  type BlogCompletenessInput,
} from "@/lib/blog-completeness";

export type BlogCompletenessFixHandler = (
  kind: BlogGapActionKind,
  opts?: { dayDate?: string; photoId?: string }
) => void;

interface BlogCompletenessPanelProps {
  input: BlogCompletenessInput;
  onFix: BlogCompletenessFixHandler;
  /** Compact strip for Recuerdos tab */
  compact?: boolean;
}

export default function BlogCompletenessPanel({
  input,
  onFix,
  compact = false,
}: BlogCompletenessPanelProps) {
  const { score, gaps, stats } = buildBlogCompleteness(input);

  if (input.photos.filter((p) => p.selected !== false).length === 0) {
    return null;
  }

  if (gaps.length === 0) {
    if (compact) return null;
    return (
      <div className="callout callout-success mb-4 text-sm">
        Buen material para el blog (score {score}/100): lugares, notas y ritmo
        cubren lo esencial. Puedes generar o refinar la crónica.
      </div>
    );
  }

  return (
    <div
      className={`callout callout-warning ${compact ? "mb-3 py-3" : "mb-4"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {compact ? "Para un mejor blog" : "Qué falta para un buen blog"}
        </p>
        <p className="text-[11px] opacity-80">
          Completitud {score}/100
          {stats.photosWithoutNote > 0
            ? ` · ${stats.photosWithoutNote} foto${stats.photosWithoutNote === 1 ? "" : "s"} sin nota de texto`
            : ""}
        </p>
      </div>
      {!compact && (
        <p className="mt-1 text-xs opacity-90">
          Sugerencias para enriquecer el relato — no inventan visitas; te guían a
          completar lo que ya vivisteis.
        </p>
      )}
      <ul className={`${compact ? "mt-2" : "mt-3"} space-y-2`}>
        {gaps.map((gap) => (
          <li
            key={gap.code}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm opacity-95">{gap.message}</span>
            <button
              type="button"
              onClick={() =>
                onFix(gap.actionKind, {
                  dayDate: gap.dayDate,
                  photoId: gap.photoId,
                })
              }
              className="btn-secondary shrink-0 self-start px-3 py-1.5 text-xs sm:self-auto"
            >
              {gap.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
