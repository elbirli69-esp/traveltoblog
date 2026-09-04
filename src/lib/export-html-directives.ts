/**
 * Apply typed HTML export directives to layout/CSS (never free CSS from the model).
 */

import {
  defaultExportDirectives,
  htmlDirectiveBodyClasses,
  type Emphasis,
  type ExportHtmlDirectives,
} from "@/lib/export-directives";

export type HtmlSectionId =
  | "timeline"
  | "gallery"
  | "map"
  | "guide"
  | "closing"
  | "stats"
  | "flights"
  | "journal"
  | "hero"
  | "play";

const ORDERABLE: HtmlSectionId[] = [
  "timeline",
  "gallery",
  "map",
  "guide",
  "closing",
];

export function resolveHtmlDirectives(
  html?: ExportHtmlDirectives | null
): ExportHtmlDirectives {
  return html ?? defaultExportDirectives().html!;
}

/**
 * Keep only the first N paragraph blocks for low prose density.
 * Medium/high leave HTML untouched.
 */
export function clampProseHtml(html: string, density: Emphasis, maxParagraphs = 1): string {
  const trimmed = html.trim();
  if (!trimmed || density === "high" || density === "medium") return html;
  const paragraphs = trimmed.match(/<p\b[\s\S]*?<\/p>/gi) ?? [];
  if (paragraphs.length === 0) {
    // No <p>: keep a short plain slice
    return trimmed.length > 420 ? `${trimmed.slice(0, 400).trim()}…` : trimmed;
  }
  return paragraphs.slice(0, Math.max(1, maxParagraphs)).join("\n");
}

/**
 * Soft-reorder middle sections from preferSectionOrder without dropping unknowns.
 * Typology/template hard rules (e.g. visual map outer) are applied by the caller.
 */
export function applyHtmlSectionOrderBias(
  baseOrder: string[],
  prefer?: ExportHtmlDirectives["preferSectionOrder"],
  galleryEmphasis: Emphasis = "medium"
): string[] {
  let order = [...baseOrder];

  // Gallery position bias even without preferSectionOrder
  if (order.includes("gallery") && order.includes("timeline")) {
    order = order.filter((id) => id !== "gallery");
    if (galleryEmphasis === "low") {
      // Near the end, before closing if present
      const closingIdx = order.indexOf("closing");
      if (closingIdx >= 0) {
        order = [
          ...order.slice(0, closingIdx),
          "gallery",
          ...order.slice(closingIdx),
        ];
      } else {
        order = [...order, "gallery"];
      }
    } else {
      // high/medium: right after timeline (Magazine default)
      const timelineIdx = order.indexOf("timeline");
      order = [
        ...order.slice(0, timelineIdx + 1),
        "gallery",
        ...order.slice(timelineIdx + 1),
      ];
    }
  }

  if (!prefer || prefer.length === 0) return order;

  const preferred = prefer.filter((id) => ORDERABLE.includes(id));
  if (preferred.length === 0) return order;

  const preferredPresent = preferred.filter((id) => order.includes(id));
  if (preferredPresent.length === 0) return order;

  const remaining = order.filter((id) => !preferredPresent.includes(id as never));
  // Insert preferred block where the first preferred id used to sit
  const firstIdx = Math.min(
    ...preferredPresent.map((id) => order.indexOf(id)).filter((i) => i >= 0)
  );
  const insertAt = Number.isFinite(firstIdx) ? firstIdx : remaining.length;
  return [
    ...remaining.slice(0, insertAt),
    ...preferredPresent,
    ...remaining.slice(insertAt),
  ];
}

/** CSS overrides keyed off body.export-dir--* classes. */
export function htmlDirectiveStyles(): string {
  return `
/* --- Export brief directives (typed knobs) --- */
body.export-dir--images-high .story-photo-img {
  aspect-ratio: 3 / 2;
  max-height: 560px;
}
body.export-dir--images-high .story-card-content .story-media {
  margin-bottom: 1.1rem;
}
body.export-dir--images-high .story-card-content {
  padding-top: .85rem;
}
body.export-dir--images-low .story-photo-img {
  aspect-ratio: 16 / 9;
  max-height: 220px;
}
body.export-dir--images-low .story-media--compact .story-photo-img {
  max-height: 160px;
}

body.export-dir--gallery-high .gallery-grid {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: .85rem;
}
body.export-dir--gallery-high .gallery-section {
  margin-top: 2rem;
}
body.export-dir--gallery-low .gallery-grid {
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: .45rem;
}
body.export-dir--gallery-low .gallery-tile--featured {
  grid-column: span 1;
  grid-row: span 1;
}
body.export-dir--gallery-low .gallery-tile figcaption {
  display: none;
}

body.export-dir--prose-low .story-day-prose,
body.export-dir--prose-low .story-intro,
body.export-dir--prose-low .story-conclusion {
  font-size: .95rem;
  max-width: 36rem;
  opacity: .86;
  line-height: 1.6;
}
body.export-dir--prose-high .story-day-prose,
body.export-dir--prose-high .story-intro,
body.export-dir--prose-high .story-conclusion {
  font-size: 1.12rem;
  max-width: 44rem;
  line-height: 1.8;
}

body.export-dir--map-high .map-canvas {
  min-height: 480px !important;
  height: min(62vh, 560px) !important;
}
body.export-dir--map-high .map-explorer-body,
body.export-dir--map-high .map-frame-wrap {
  min-height: 480px;
}
body.export-dir--map-low .map-canvas {
  min-height: 220px !important;
  height: 240px !important;
}
body.export-dir--map-low .map-explorer-body,
body.export-dir--map-low .map-frame-wrap {
  min-height: 240px;
}

body.export-dir--callouts-low .mag-callout-note { display: none; }
body.export-dir--callouts-low .mag-callout-photos { display: none; }
body.export-dir--callouts-low .mag-callout-grid {
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
}
body.export-dir--callouts-high .mag-callout-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.1rem;
}
body.export-dir--callouts-high .mag-callout-card {
  padding: 1.1rem 1.15rem;
}
body.export-dir--callouts-high .mag-callout-name { font-size: 1.08rem; }
`;
}

export function bodyClassForHtmlDirectives(
  html?: ExportHtmlDirectives | null
): string {
  return htmlDirectiveBodyClasses(resolveHtmlDirectives(html));
}
