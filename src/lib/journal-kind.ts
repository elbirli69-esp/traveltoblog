/**
 * Two stored chronicles per travel:
 * - day: diario / recuerdo (### por fecha)
 * - blog: artículo continuo para compartir
 */

export type JournalKind = "day" | "blog";

/** Persisted HTML export preference (null → day). */
export type HtmlJournalSource = "day" | "blog";

export const JOURNAL_KIND_LABELS: Record<
  JournalKind,
  { title: string; description: string }
> = {
  day: {
    title: "Por días",
    description:
      "Crónica día a día: ideal para diario o recuerdo del viaje en cronología.",
  },
  blog: {
    title: "Artículo blog",
    description:
      "Texto temático (tours, ciudad, excursiones…) para enviar a quien planea un viaje similar.",
  },
};

export function parseJournalKind(value: unknown): JournalKind {
  return value === "blog" ? "blog" : "day";
}

export function parseHtmlJournalSource(value: unknown): HtmlJournalSource {
  return value === "blog" ? "blog" : "day";
}

export function resolveExportJournalMarkdown(
  travel: {
    journalMarkdown?: string | null;
    journalBlogMarkdown?: string | null;
    htmlJournalSource?: string | null;
  },
  override?: string | null
): { markdown: string | null; source: HtmlJournalSource } {
  const preferred = parseHtmlJournalSource(
    override !== undefined && override !== null
      ? override
      : travel.htmlJournalSource
  );
  const day = travel.journalMarkdown?.trim() || null;
  const blog = travel.journalBlogMarkdown?.trim() || null;

  if (preferred === "blog") {
    if (blog) return { markdown: blog, source: "blog" };
    // Fall back so export still works if only the day chronicle exists.
    return { markdown: day, source: day ? "day" : "blog" };
  }
  return { markdown: day, source: "day" };
}

export function travelHasAnyJournal(travel: {
  journalMarkdown?: string | null;
  journalBlogMarkdown?: string | null;
}): boolean {
  return Boolean(
    travel.journalMarkdown?.trim() || travel.journalBlogMarkdown?.trim()
  );
}
