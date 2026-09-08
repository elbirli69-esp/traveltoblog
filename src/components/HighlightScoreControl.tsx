"use client";

import { useEffect, useRef, useState } from "react";
import {
  clampHighlightScore,
  HIGHLIGHT_SCORE_DEFAULT,
} from "@/lib/highlight-score";

interface HighlightScoreControlProps {
  value: number;
  /** Fired when the user commits a new score (release / change), not on every drag tick. */
  onChange: (score: number) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
}

/**
 * Range control with local draft while dragging so parent re-renders / network
 * saves cannot interrupt the thumb mid-gesture.
 */
export default function HighlightScoreControl({
  value,
  onChange,
  disabled = false,
  compact = false,
  label = "Protagonismo (Reel y export)",
}: HighlightScoreControlProps) {
  const clampedProp = clampHighlightScore(value);
  const [draft, setDraft] = useState(clampedProp);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setDraft(clampedProp);
  }, [clampedProp]);

  const commit = (raw: number) => {
    const next = clampHighlightScore(raw);
    setDraft(next);
    if (next !== clampedProp) onChange(next);
  };

  const score = draft;
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
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          commit(Number(e.currentTarget.value));
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setDraft(clampedProp);
        }}
        onTouchStart={() => {
          dragging.current = true;
        }}
        onTouchEnd={(e) => {
          dragging.current = false;
          const t = e.currentTarget;
          commit(Number(t.value));
        }}
        onInput={(e) => {
          setDraft(clampHighlightScore(Number(e.currentTarget.value)));
        }}
        onChange={(e) => {
          // Keyboard / a11y / browsers that only fire change
          if (!dragging.current) {
            commit(Number(e.currentTarget.value));
          } else {
            setDraft(clampHighlightScore(Number(e.currentTarget.value)));
          }
        }}
        className="w-full cursor-pointer accent-[var(--accent-mint)] touch-manipulation"
        style={{ touchAction: "none" }}
        aria-label={label}
      />
      <p className="text-[11px] leading-snug text-fg-tertiary">
        No es la nota de texto de la foto. 5 = neutro. Más alto: más peso en el
        Reel y más protagonismo en el HTML. 0 = al final por si acaso.
      </p>
    </div>
  );
}
