import { formatDateKey } from "@/lib/travel-dates";
import type { EnhancedJournalContext } from "@/lib/journal-pipeline";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseJournalDayKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return DAY_KEY_RE.test(key) ? key : null;
}

export function dayChapterHeadings(dayKey: string): string[] {
  return [formatDateKey(dayKey, "long"), formatDateKey(dayKey, "short")];
}

function normalizeHeading(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function headingsMatchDay(title: string, dayKey: string): boolean {
  const norm = normalizeHeading(title);
  return dayChapterHeadings(dayKey).some((h) => normalizeHeading(h) === norm);
}

export type JournalChapterBlock = {
  title: string;
  /** Full block including the ### heading line. */
  markdown: string;
  dayKey: string | null;
};

/** Split day chronicle into ### chapters (body only after title/# intro). */
export function splitDayJournalChapters(markdown: string): {
  preface: string;
  chapters: JournalChapterBlock[];
  appendix: string;
} {
  const trimmed = markdown.trim();
  if (!trimmed) return { preface: "", chapters: [], appendix: "" };

  const parts = trimmed.split(/\n(?=###\s+)/);
  const prefaceParts: string[] = [];
  const chapters: JournalChapterBlock[] = [];
  const appendixParts: string[] = [];
  let seenChapter = false;
  let inAppendix = false;

  for (const part of parts) {
    if (!/^\s*###\s+/.test(part)) {
      if (!seenChapter) prefaceParts.push(part.trimEnd());
      else appendixParts.push(part.trimEnd());
      continue;
    }
    const match = part.match(/^\s*###\s+(.+?)\s*(?:\n|$)/);
    const title = match?.[1]?.trim() ?? "";
    // Meta H2 sections after days (Lugares / Transporte / Si vas) often appear
    // after --- without ### — captured as trailing non-### parts.
    // If a ### looks like closing, treat remaining as appendix.
    if (/^(si vas|conclusi[oó]n|cierre|para cerrar)/i.test(title)) {
      inAppendix = true;
    }
    if (inAppendix) {
      appendixParts.push(part.trimEnd());
      continue;
    }
    seenChapter = true;
    chapters.push({
      title,
      markdown: part.trimEnd(),
      dayKey: null,
    });
  }

  return {
    preface: prefaceParts.join("\n\n").trim(),
    chapters,
    appendix: appendixParts.join("\n\n").trim(),
  };
}

export function findDayChapterIndex(
  chapters: JournalChapterBlock[],
  dayKey: string
): number {
  return chapters.findIndex((c) => headingsMatchDay(c.title, dayKey));
}

/** Extract one day chapter (### …) or null if missing. */
export function extractDayChapterMarkdown(
  fullMarkdown: string | null | undefined,
  dayKey: string
): string | null {
  if (!fullMarkdown?.trim()) return null;
  const { chapters } = splitDayJournalChapters(fullMarkdown);
  const idx = findDayChapterIndex(chapters, dayKey);
  if (idx < 0) return null;
  return chapters[idx]!.markdown.trim();
}

/**
 * Insert or replace a single ### day chapter inside a day chronicle.
 * Creates a minimal skeleton when the document is empty.
 */
export function upsertDayChapterMarkdown(
  fullMarkdown: string | null | undefined,
  dayKey: string,
  chapterMarkdown: string,
  tripTitle = "Viaje"
): string {
  const heading = `### ${formatDateKey(dayKey, "long")}`;
  let chapter = chapterMarkdown.trim();
  if (!chapter.startsWith("###")) {
    chapter = `${heading}\n\n${chapter}`;
  } else {
    // Normalize heading to the canonical long date label.
    chapter = chapter.replace(/^\s*###\s+.+?(?:\n|$)/, `${heading}\n`);
  }

  const existing = fullMarkdown?.trim() ?? "";
  if (!existing) {
    return [
      `# ${tripTitle}`,
      "",
      "_Crónica en construcción — capítulos generados día a día._",
      "",
      "---",
      "",
      "## El viaje día a día",
      "",
      chapter,
      "",
    ].join("\n");
  }

  const { preface, chapters, appendix } = splitDayJournalChapters(existing);
  const idx = findDayChapterIndex(chapters, dayKey);
  if (idx >= 0) {
    chapters[idx] = {
      title: formatDateKey(dayKey, "long"),
      markdown: chapter,
      dayKey,
    };
  } else {
    // Keep chronological order by dayKey when we can map titles; else append.
    chapters.push({
      title: formatDateKey(dayKey, "long"),
      markdown: chapter,
      dayKey,
    });
    chapters.sort((a, b) => {
      const ka = a.dayKey ?? guessDayKeyFromTitle(a.title);
      const kb = b.dayKey ?? guessDayKeyFromTitle(b.title);
      if (ka && kb) return ka.localeCompare(kb);
      return 0;
    });
  }

  const body = chapters.map((c) => c.markdown.trim()).join("\n\n");
  const pieces = [preface.trim(), body];
  if (appendix.trim()) pieces.push(appendix.trim());
  return pieces.filter(Boolean).join("\n\n") + "\n";
}

/** Best-effort: if title already is ISO-like. */
function guessDayKeyFromTitle(title: string): string | null {
  const iso = title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso?.[1] ?? null;
}

/** Keep only ### chapters whose titles match dayKeys (inclusive set). */
export function filterDayJournalMarkdownToKeys(
  fullMarkdown: string | null | undefined,
  dayKeys: string[],
  tripTitle = "Viaje"
): string {
  const keySet = new Set(dayKeys);
  if (keySet.size === 0) return fullMarkdown?.trim() || `# ${tripTitle}\n`;

  const existing = fullMarkdown?.trim() ?? "";
  if (!existing) return `# ${tripTitle}\n`;

  const { preface, chapters, appendix } = splitDayJournalChapters(existing);
  const kept = chapters.filter((c) =>
    dayKeys.some((k) => headingsMatchDay(c.title, k))
  );
  if (kept.length === 0) {
    return [
      preface || `# ${tripTitle}`,
      "",
      "_No hay capítulos de crónica para el rango de días elegido._",
      "",
    ].join("\n");
  }

  const intro =
    preface.trim() ||
    `# ${tripTitle}\n\n_Export parcial — ${dayKeys.length === 1 ? formatDateKey(dayKeys[0]!, "long") : `${dayKeys[0]} → ${dayKeys[dayKeys.length - 1]}`}._`;

  // Drop trip-wide appendix on partial exports (Si vas / lugares globales).
  void appendix;
  return `${intro.trim()}\n\n---\n\n## El viaje día a día\n\n${kept
    .map((c) => c.markdown.trim())
    .join("\n\n")}\n`;
}

export function filterJournalContextToDay(
  ctx: EnhancedJournalContext,
  dayKey: string
): EnhancedJournalContext {
  const day = ctx.days.find((d) => d.date === dayKey);
  const days = day
    ? [day]
    : [
        {
          date: dayKey,
          dayNotes: [],
          photos: [],
          places: [],
        },
      ];
  const placeNames = new Set(days.flatMap((d) => d.places.map((p) => p.name)));
  return {
    ...ctx,
    days,
    places: ctx.places.filter((p) => placeNames.has(p.name)),
    dateRange: { start: dayKey, end: dayKey },
  };
}
