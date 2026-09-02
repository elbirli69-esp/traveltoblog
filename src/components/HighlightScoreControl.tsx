"use client";

import { clampHighlightScore, HIGHLIGHT_SCORE_DEFAULT } from "@/lib/highlight-score";

interface HighlightScoreControlProps {
  value: number;
  onChange: (score: number) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
}

export default function HighlightScoreControl({
  value,
  onChange,
  disabled = false,
  compact = false,
  label = "Nota global (Reel y export)",
}: HighlightScoreControlProps) {
  const score = clampHighlightScore(value);
  const neutral = score === HIGHLIGHT_SCORE_DEFAULT;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-fg-secondary">{label}</label>
        <span
          className={`tabular-nums text-xs font-bold ${
            score >= 8
              ? "text-accent-mint"
              : score <= 2
                ? "text-fg-tertiary"
                : "text-fg"
          }`}
        >
          {score}/10
          {neutral && (
            <span className="ml-1 font-normal text-fg-tertiary">(neutro)</span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={score}
        disabled={disabled}
        onChange={(e) => onChange(clampHighlightScore(Number(e.target.value)))}
        className="w-full accent-[var(--accent-mint)]"
        aria-label={label}
      />
      <p className="text-[11px] leading-snug text-fg-tertiary">
        5 = sin cambio. Más alto: más peso en el Reel y más protagonismo en el HTML. 0 = al final
        por si acaso.
      </p>
    </div>
  );
}
