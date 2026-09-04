import { marked } from "marked";
import { formatDateKey } from "@/lib/travel-dates";

/**
 * Shared journal → prose extraction for PDF day-dividers and the unified
 * HTML “El viaje” section (crónica + recorrido in one).
 */

export function normalizeNarrativeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Journal markdown embeds photos as `![Foto de X](url)` + `*author*`.
 * Strip those so export surfaces don't dump alt text as a text column.
 */
export function stripMarkdownImagesAndBylines(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^\s*\*[^*\n]+\*\s*$/gm, "")
    .replace(/^\s*_[^_\n]+_\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function markdownToProseHtml(markdown: string): string {
  const prose = stripMarkdownImagesAndBylines(markdown);
  if (!prose) return "";
  const html = marked.parse(prose, { async: false }) as string;
  return html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .trim();
}

const SKIP_H2 =
  /^(el viaje día a día|lugares(?: del recorrido)?|transporte|notas del viaje)\b/i;

const META_H2 = /^(lugares(?: del recorrido)?|transporte|notas del viaje)\b/i;

export type JournalDayNarratives = {
  byTitle: Map<string, string>;
  ordered: string[];
};

/** Per-day HTML snippets (### chapters, or ## Día N fallback). */
export function extractDayNarratives(markdown: string | null): JournalDayNarratives {
  const byTitle = new Map<string, string>();
  const ordered: string[] = [];
  if (!markdown?.trim()) return { byTitle, ordered };

  const raw = markdown.trim();
  const h3Blocks = raw.split(/\n(?=###\s+)/).filter((s) => /^\s*###\s+/.test(s));

  const ingest = (title: string, bodyMarkdown: string) => {
    const html = markdownToProseHtml(bodyMarkdown);
    if (!html) return;
    if (title) byTitle.set(normalizeNarrativeTitle(title), html);
    ordered.push(html);
  };

  if (h3Blocks.length > 0) {
    for (const block of h3Blocks) {
      const match = block.match(/^\s*###\s+(.+?)\s*(?:\n|$)/);
      const title = match?.[1]?.trim() ?? "";
      const body = block.replace(/^\s*###\s+.+?(?:\n|$)/, "");
      ingest(title, body);
    }
    return { byTitle, ordered };
  }

  if (!/^##\s+/m.test(raw)) {
    const html = markdownToProseHtml(raw);
    if (html) ordered.push(html);
    return { byTitle, ordered };
  }

  for (const section of raw.split(/\n(?=##\s+)/)) {
    if (!section.trim()) continue;
    const match = section.match(/^\s*##\s+(.+?)\s*(?:\n|$)/);
    const title = match?.[1]?.trim() ?? "";
    if (title && SKIP_H2.test(title)) continue;
    if (title && META_H2.test(title)) continue;
    const body = section.replace(/^\s*##\s+.+?(?:\n|$)/, "");
    ingest(title, body);
  }
  return { byTitle, ordered };
}

export function resolveDayNarrativeHtml(
  dayKey: string,
  dayTitle: string,
  dayIndex: number,
  narratives: JournalDayNarratives
): string | undefined {
  const fromTitle =
    narratives.byTitle.get(normalizeNarrativeTitle(dayTitle)) ??
    (dayKey !== "sin-fecha"
      ? narratives.byTitle.get(
          normalizeNarrativeTitle(formatDateKey(dayKey, "short"))
        )
      : undefined);
  if (fromTitle) return fromTitle;
  if (dayKey === "sin-fecha") return undefined;
  return narratives.ordered[dayIndex];
}

export type JournalStoryProse = {
  introHtml: string;
  conclusionHtml: string;
  days: JournalDayNarratives;
  /** True when there is any prose worth showing in the unified story. */
  hasProse: boolean;
};

/**
 * Split journal markdown into intro + per-day prose + conclusion for the
 * unified HTML story section. Skips lugares / transporte / notas lists and
 * embedded photo markdown.
 */
export function extractJournalStoryProse(
  markdown: string | null
): JournalStoryProse {
  const empty: JournalStoryProse = {
    introHtml: "",
    conclusionHtml: "",
    days: { byTitle: new Map(), ordered: [] },
    hasProse: false,
  };
  if (!markdown?.trim()) return empty;

  let raw = markdown.trim();
  raw = raw.replace(/^#\s+[^\n]+\n+/, "");

  // Conclusion: last --- block that is not a ## meta section
  let conclusionMd = "";
  const hrParts = raw.split(/\n---\s*\n/).map((p) => p.trim());
  if (hrParts.length >= 2) {
    const last = hrParts[hrParts.length - 1] ?? "";
    if (last && !/^\s*##\s+/.test(last)) {
      conclusionMd = last;
      raw = hrParts.slice(0, -1).join("\n\n---\n\n");
    }
  }

  // Drop meta ## sections (lugares, transporte, notas)
  raw = raw
    .split(/\n(?=##\s+)/)
    .filter((section) => {
      const title = section.match(/^\s*##\s+(.+?)\s*(?:\n|$)/)?.[1]?.trim() ?? "";
      return !(title && META_H2.test(title));
    })
    .join("\n")
    .trim();

  let introMd = "";
  let daysSource = raw;
  const viajeMatch = raw.match(/\n##\s+El viaje día a día\b[^\n]*\n?/i);
  if (viajeMatch && viajeMatch.index != null) {
    introMd = raw.slice(0, viajeMatch.index);
    daysSource = raw.slice(viajeMatch.index + viajeMatch[0].length);
  } else {
    const h3 = raw.search(/\n###\s+/);
    if (h3 >= 0) {
      introMd = raw.slice(0, h3);
      daysSource = raw.slice(h3 + 1);
    } else if (!/^###\s+/m.test(raw) && !/^##\s+/m.test(raw)) {
      introMd = raw;
      daysSource = "";
    }
  }

  introMd = introMd.replace(/^---\s*$/gm, "").trim();
  daysSource = daysSource.replace(/^##\s+El viaje día a día\s*\n*/i, "");

  const dayNarratives = extractDayNarratives(daysSource);

  const introHtml = markdownToProseHtml(introMd);
  const conclusionHtml = markdownToProseHtml(conclusionMd);
  const hasProse = Boolean(
    introHtml || conclusionHtml || dayNarratives.ordered.length > 0
  );

  return {
    introHtml,
    conclusionHtml,
    days: dayNarratives,
    hasProse,
  };
}
