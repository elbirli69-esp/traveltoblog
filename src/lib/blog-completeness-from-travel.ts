import type { BlogCompletenessInput } from "@/lib/blog-completeness";
import { normalizeDestinationThemes } from "@/lib/destination-fiche";

/** Build completeness input from travel payload shapes used in UI. */
export function blogCompletenessInputFromTravel(travel: {
  title: string;
  journalBrief?: string | null;
  destinationName?: string | null;
  destinationThemes?: string | string[] | null;
  startDate: string | null;
  endDate: string | null;
  photos: Array<{
    id: string;
    selected?: boolean;
    exifDateTime: string | null;
    latitude?: number | null;
    longitude?: number | null;
    placeId?: string | null;
    highlightScore?: number | null;
    isTransportStart?: boolean;
    isTransportEnd?: boolean;
    notes?: Array<{ type: string; text?: string }>;
    photoNoteCount?: number;
  }>;
  places: Array<{
    type: string;
    notes?: Array<{ text?: string }>;
    noteCount?: number;
  }>;
  notes: Array<{
    type: string;
    text?: string;
    dayDate: string | null;
  }>;
}): BlogCompletenessInput {
  const dayNotes = travel.notes.filter((n) => n.type === "DAY");
  const tripNoteCount = travel.notes.filter((n) => n.type === "TRIP").length;

  let personalNoteChars = 0;
  for (const n of travel.notes) {
    if (n.type === "DAY" || n.type === "TRIP") {
      personalNoteChars += (n.text ?? "").trim().length;
    }
  }
  for (const p of travel.photos) {
    for (const n of p.notes ?? []) {
      if (n.type === "PHOTO") personalNoteChars += (n.text ?? "").trim().length;
    }
  }
  for (const place of travel.places) {
    for (const n of place.notes ?? []) {
      personalNoteChars += (n.text ?? "").trim().length;
    }
  }
  // PLACE notes only on travel.notes when places.notes absent
  if (travel.places.every((pl) => pl.notes === undefined && pl.noteCount === undefined)) {
    for (const n of travel.notes) {
      if (n.type === "PLACE") personalNoteChars += (n.text ?? "").trim().length;
    }
  }

  return {
    title: travel.title,
    journalBrief: travel.journalBrief ?? null,
    destinationName: travel.destinationName ?? null,
    destinationThemes: normalizeDestinationThemes(
      travel.destinationThemes ?? []
    ),
    startDate: travel.startDate,
    endDate: travel.endDate,
    photos: travel.photos.map((p) => ({
      id: p.id,
      selected: p.selected,
      exifDateTime: p.exifDateTime,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      placeId: p.placeId ?? null,
      highlightScore: p.highlightScore,
      isTransportStart: p.isTransportStart,
      isTransportEnd: p.isTransportEnd,
      photoNoteCount:
        p.photoNoteCount ??
        (p.notes ?? []).filter((n) => n.type === "PHOTO").length,
    })),
    places: travel.places.map((pl) => ({
      type: pl.type,
      noteCount: pl.noteCount ?? pl.notes?.length ?? 0,
    })),
    dayNotes: dayNotes.map((n) => ({
      dayDate: n.dayDate,
      textLength: (n.text ?? "").trim().length,
    })),
    tripNoteCount,
    personalNoteChars,
  };
}
