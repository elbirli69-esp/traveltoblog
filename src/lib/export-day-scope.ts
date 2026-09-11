import {
  enumerateDateKeys,
  formatDateKey,
  isoToDateKey,
} from "@/lib/travel-dates";
import {
  filterDayJournalMarkdownToKeys,
  parseJournalDayKey,
} from "@/lib/journal-day-chapter";
import type { ExportContext, ExportPhoto } from "@/lib/export-html";

export function parseDayRangeBounds(
  dayFrom: unknown,
  dayTo: unknown
): { dayFrom: string; dayTo: string } | null {
  const from = parseJournalDayKey(dayFrom);
  const to = parseJournalDayKey(dayTo) ?? from;
  if (!from || !to) return null;
  return from <= to ? { dayFrom: from, dayTo: to } : { dayFrom: to, dayTo: from };
}

export function expandDayRange(dayFrom: string, dayTo: string): string[] {
  return enumerateDateKeys(dayFrom, dayTo);
}

function photoDayKey(photo: ExportPhoto): string | null {
  if (!photo.exifDateTime) return null;
  const iso =
    photo.exifDateTime instanceof Date
      ? photo.exifDateTime.toISOString()
      : String(photo.exifDateTime);
  return isoToDateKey(iso);
}

/**
 * Narrow an export context to an inclusive calendar day range (day chronicle).
 * Filters photos, map photos, places, notes, GPS and day-journal markdown.
 */
export function filterExportContextByDayRange(
  ctx: ExportContext,
  dayFrom: string,
  dayTo: string
): ExportContext {
  const keys = expandDayRange(dayFrom, dayTo);
  const keySet = new Set(keys);

  const photos = ctx.photos.filter((p) => {
    const k = photoDayKey(p);
    return k != null && keySet.has(k);
  });
  const mapPhotos = (ctx.mapPhotos ?? ctx.photos).filter((p) => {
    const k = photoDayKey(p);
    return k != null && keySet.has(k);
  });

  const places = (ctx.places ?? []).filter((place) => {
    const visited = place.visitedAt
      ? isoToDateKey(
          place.visitedAt instanceof Date
            ? place.visitedAt.toISOString()
            : String(place.visitedAt)
        )
      : null;
    if (visited && keySet.has(visited)) return true;
    if (place.id) {
      return photos.some((p) => p.placeId === place.id);
    }
    return false;
  });

  const notes = (ctx.notes ?? []).filter((note) => {
    if (note.type === "DAY" && note.dayDate) {
      const k = isoToDateKey(
        note.dayDate instanceof Date
          ? note.dayDate.toISOString()
          : String(note.dayDate)
      );
      return keySet.has(k);
    }
    // Drop trip-wide notes on single-day slices; keep for multi-day ranges.
    if (note.type === "TRIP") return keys.length > 1;
    return note.type !== "DAY";
  });

  const gpsTracks = (ctx.gpsTracks ?? [])
    .map((track) => {
      const points = (track.points ?? []).filter((pt) => {
        if (!pt.at) return false;
        const k = isoToDateKey(pt.at);
        return k >= dayFrom && k <= dayTo;
      });
      return { ...track, points };
    })
    .filter((t) => t.points.length >= 2);

  const label =
    dayFrom === dayTo
      ? formatDateKey(dayFrom, "long")
      : `${formatDateKey(dayFrom, "short")} – ${formatDateKey(dayTo, "short")}`;

  const filteredMd = filterDayJournalMarkdownToKeys(
    ctx.travel.journalMarkdown,
    keys,
    ctx.travel.title
  );

  return {
    ...ctx,
    photos,
    mapPhotos,
    places,
    notes,
    gpsTracks,
    journalSource: "day",
    publicTitle: ctx.publicTitle?.trim() || `${ctx.travel.title} · ${label}`,
    travel: {
      ...ctx.travel,
      journalMarkdown: filteredMd,
      htmlJournalSource: "day",
      startDate: new Date(`${dayFrom}T12:00:00`),
      endDate: new Date(`${dayTo}T12:00:00`),
    },
  };
}
