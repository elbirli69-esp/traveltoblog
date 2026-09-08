/**
 * Blog editorial B3 — short “Si vais, no os perdáis…” reader guide.
 * Only real visited places; optional tip from PLACE note / comment; max 5 items.
 */

import type { PlaceType } from "@prisma/client";
import { compareHighlightScore } from "@/lib/highlight-score";
import { PLACE_TYPE_EMOJI, PLACE_TYPE_LABELS } from "@/lib/places";

export const READER_GUIDE_MAX_ITEMS = 5;

export type ReaderGuidePlace = {
  id?: string;
  name: string;
  type: string;
  /** PLACE note / place comment — used as tip when present. */
  comment: string | null;
  alias?: string;
  highlightScore?: number;
};

export type ReaderGuideItem = {
  name: string;
  type: string;
  typeLabel: string;
  emoji: string;
  tip: string | null;
  highlightScore: number;
  alias: string;
};

function typeMeta(type: string): { typeLabel: string; emoji: string } {
  const key = (type in PLACE_TYPE_LABELS ? type : "OTHER") as PlaceType;
  return {
    typeLabel: PLACE_TYPE_LABELS[key] ?? "Otro",
    emoji: PLACE_TYPE_EMOJI[key] ?? "📍",
  };
}

/**
 * Rank visited places for the reader guide: tip first, then highlight.
 * Never invents places — only returns a subset of the input.
 */
export function selectReaderGuideItems(
  places: ReaderGuidePlace[],
  maxItems: number = READER_GUIDE_MAX_ITEMS
): ReaderGuideItem[] {
  if (!places.length || maxItems <= 0) return [];

  const ranked = [...places].sort((a, b) => {
    const tipA = Boolean(a.comment?.trim());
    const tipB = Boolean(b.comment?.trim());
    if (tipA !== tipB) return tipA ? -1 : 1;
    return compareHighlightScore(a.highlightScore ?? 5, b.highlightScore ?? 5);
  });

  return ranked.slice(0, maxItems).map((p) => {
    const { typeLabel, emoji } = typeMeta(p.type);
    const tip = p.comment?.trim() || null;
    return {
      name: p.name.trim(),
      type: p.type,
      typeLabel,
      emoji,
      tip,
      highlightScore: p.highlightScore ?? 5,
      alias: p.alias?.trim() || "",
    };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Compact magazine section: ≤5 places the reader should not miss.
 */
export function buildReaderGuideHtml(
  places: ReaderGuidePlace[],
  options: { maxItems?: number; includeSection?: boolean } = {}
): string {
  if (options.includeSection === false) return "";
  const items = selectReaderGuideItems(places, options.maxItems ?? READER_GUIDE_MAX_ITEMS);
  if (items.length === 0) return "";

  const list = items
    .map((item, i) => {
      const tip = item.tip
        ? `<p class="mag-reader-tip">${escapeHtml(item.tip)}</p>`
        : "";
      const by =
        item.alias && item.tip
          ? `<footer class="mag-reader-by">${escapeHtml(item.alias)}</footer>`
          : "";
      return `<li class="mag-reader-item">
  <span class="mag-reader-num" aria-hidden="true">${i + 1}</span>
  <div class="mag-reader-body">
    <h3 class="mag-reader-name">${item.emoji} ${escapeHtml(item.name)}</h3>
    <p class="mag-reader-type">${escapeHtml(item.typeLabel)}</p>
    ${tip}
    ${by}
  </div>
</li>`;
    })
    .join("");

  return `
<section id="guia" class="mag-reader-guide reveal visible">
  <header class="mag-section-head">
    <p class="mag-eyebrow">Para el lector</p>
    <h2 class="section-title">Si vais, no os perdáis…</h2>
    <p class="mag-reader-lead">Lugares que visitamos — sin inventar paradas.</p>
  </header>
  <ol class="mag-reader-list">${list}</ol>
</section>`;
}

/** CSS complement for magazine export (appended near other mag styles). */
export const readerGuideStyles = `
.mag-reader-guide { padding: 2.5rem 1.25rem 3rem; max-width: 42rem; margin: 0 auto; }
.mag-reader-lead { margin: 0.35rem 0 0; font-size: 0.95rem; color: var(--muted, #64748b); }
.mag-reader-list { list-style: none; margin: 1.5rem 0 0; padding: 0; display: grid; gap: 1rem; }
.mag-reader-item { display: grid; grid-template-columns: 2rem 1fr; gap: 0.75rem; align-items: start; }
.mag-reader-num {
  width: 1.75rem; height: 1.75rem; border-radius: 999px;
  display: grid; place-items: center;
  font-size: 0.8rem; font-weight: 700;
  background: color-mix(in srgb, var(--accent, #0d9488) 18%, transparent);
  color: var(--accent, #0d9488);
}
.mag-reader-name { margin: 0; font-size: 1.1rem; line-height: 1.3; }
.mag-reader-type { margin: 0.15rem 0 0; font-size: 0.8rem; color: var(--muted, #64748b); }
.mag-reader-tip { margin: 0.45rem 0 0; font-size: 0.95rem; line-height: 1.45; }
.mag-reader-by { margin: 0.35rem 0 0; font-size: 0.75rem; color: var(--muted, #64748b); }
`;
