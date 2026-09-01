import type { NoteType, TravelType } from "@prisma/client";
import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";

export type TimelineEventKind =
  | "photo"
  | "place"
  | "note"
  | "flight-out"
  | "flight-in"
  | "day-boundary"
  | "journal-chunk"
  | "gps-segment";

export interface TimelineEventMeta {
  visitedAtSource?: "user" | "createdAt" | "exif";
  placeType?: string;
  noteType?: NoteType;
  photoId?: string;
  placeId?: string;
  trackId?: string;
}

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  at: string;
  dayKey: string;
  lat?: number;
  lng?: number;
  title: string;
  body?: string;
  mediaUrl?: string;
  author?: string;
  meta?: TimelineEventMeta;
}

export interface TimelinePhotoInput {
  id: string;
  url: string;
  exifDateTime: Date | string | null;
  createdAt?: Date | string;
  latitude: number | null;
  longitude: number | null;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  selected?: boolean;
  alias: string;
}

export interface TimelinePlaceInput {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  visitedAt: Date | string | null;
  createdAt: Date | string;
  alias: string;
  comment?: string | null;
  noteText?: string | null;
}

export interface TimelineNoteInput {
  id: string;
  type: NoteType;
  text: string;
  dayDate: Date | string | null;
  photoId: string | null;
  placeId: string | null;
  createdAt: Date | string;
  alias: string;
}

export interface TimelineGpsTrackInput {
  id: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  points: { lat: number; lng: number; at: string }[];
  includeInExport: boolean;
  alias: string;
}

export interface BuildTimelineInput {
  photos: TimelinePhotoInput[];
  places: TimelinePlaceInput[];
  notes: TimelineNoteInput[];
  journalMarkdown?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  gpsTracks?: TimelineGpsTrackInput[];
  /** Only selected photos in export; app shows all by default */
  selectedPhotosOnly?: boolean;
}

export interface TimelineResult {
  events: TimelineEvent[];
  days: { dayKey: string; label: string; eventCount: number }[];
  meta: {
    eventCount: number;
    hasGps: boolean;
    dayCount: number;
  };
}

const KIND_PRIORITY: Record<TimelineEventKind, number> = {
  "day-boundary": 0,
  "flight-out": 1,
  "flight-in": 2,
  photo: 3,
  place: 4,
  note: 5,
  "journal-chunk": 6,
  "gps-segment": 7,
};

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function dayKeyFrom(d: Date | string): string {
  return isoToDateKey(toIso(d));
}

function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  const at = a.at.localeCompare(b.at);
  if (at !== 0) return at;
  const kp = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  if (kp !== 0) return kp;
  return a.id.localeCompare(b.id);
}

function parseJournalChunks(markdown: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const lines = markdown.split("\n");
  let currentDayKey: string | null = null;
  let buffer: string[] = [];
  let chunkIndex = 0;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (!text) return;
    const at = currentDayKey
      ? new Date(`${currentDayKey}T12:00:00`).toISOString()
      : new Date().toISOString();
    events.push({
      id: `journal-${chunkIndex++}`,
      kind: "journal-chunk",
      at,
      dayKey: currentDayKey ?? dayKeyFrom(at),
      title: "Crónica",
      body: text,
    });
    buffer = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const heading = h2?.[1] ?? h3?.[1];
    if (heading) {
      flush();
      const dateMatch = heading.match(/(\d{4}-\d{2}-\d{2})/);
      const dayWord = heading.match(/d[ií]a\s+(\d+)/i);
      if (dateMatch) {
        currentDayKey = dateMatch[1];
      } else if (dayWord) {
        currentDayKey = null;
      }
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return events;
}

export function buildTimeline(input: BuildTimelineInput): TimelineResult {
  const events: TimelineEvent[] = [];
  const photos = input.selectedPhotosOnly
    ? input.photos.filter((p) => p.selected !== false)
    : input.photos;

  for (const photo of photos) {
    if (photo.isTransportStart && photo.latitude != null && photo.longitude != null) {
      const at = toIso(photo.exifDateTime ?? photo.createdAt ?? new Date());
      events.push({
        id: `flight-out-${photo.id}`,
        kind: "flight-out",
        at,
        dayKey: dayKeyFrom(at),
        lat: photo.latitude,
        lng: photo.longitude,
        title: `Vuelo de ida`,
        body: photo.alias,
        mediaUrl: photo.url,
        author: photo.alias,
        meta: { photoId: photo.id },
      });
      continue;
    }
    if (photo.isTransportEnd && photo.latitude != null && photo.longitude != null) {
      const at = toIso(photo.exifDateTime ?? photo.createdAt ?? new Date());
      events.push({
        id: `flight-in-${photo.id}`,
        kind: "flight-in",
        at,
        dayKey: dayKeyFrom(at),
        lat: photo.latitude,
        lng: photo.longitude,
        title: `Vuelo de vuelta`,
        body: photo.alias,
        mediaUrl: photo.url,
        author: photo.alias,
        meta: { photoId: photo.id },
      });
      continue;
    }
    if (photo.isTransportStart || photo.isTransportEnd) continue;

    const at = toIso(photo.exifDateTime ?? photo.createdAt ?? new Date());
    events.push({
      id: `photo-${photo.id}`,
      kind: "photo",
      at,
      dayKey: dayKeyFrom(at),
      lat: photo.latitude ?? undefined,
      lng: photo.longitude ?? undefined,
      title: "Foto",
      mediaUrl: photo.url,
      author: photo.alias,
      meta: { photoId: photo.id, visitedAtSource: photo.exifDateTime ? "exif" : undefined },
    });
  }

  for (const place of input.places) {
    const visited = place.visitedAt ?? place.createdAt;
    const at = toIso(visited);
    const body = place.noteText ?? place.comment ?? undefined;
    events.push({
      id: `place-${place.id}`,
      kind: "place",
      at,
      dayKey: dayKeyFrom(at),
      lat: place.latitude,
      lng: place.longitude,
      title: place.name,
      body,
      author: place.alias,
      meta: {
        placeId: place.id,
        placeType: place.type,
        visitedAtSource: place.visitedAt ? "user" : "createdAt",
      },
    });
  }

  for (const note of input.notes) {
    if (note.type === "PLACE") continue;
    let at: string;
    if (note.type === "DAY" && note.dayDate) {
      at = toIso(note.dayDate);
    } else if (note.type === "PHOTO" && note.photoId) {
      const linked = photos.find((p) => p.id === note.photoId);
      at = linked
        ? toIso(linked.exifDateTime ?? linked.createdAt ?? note.createdAt)
        : toIso(note.createdAt);
    } else if (note.type === "TRIP" && input.startDate) {
      at = toIso(input.startDate);
    } else {
      at = toIso(note.createdAt);
    }
    events.push({
      id: `note-${note.id}`,
      kind: "note",
      at,
      dayKey: note.type === "DAY" && note.dayDate ? dayKeyFrom(note.dayDate) : dayKeyFrom(at),
      title: note.type === "TRIP" ? "Nota del viaje" : note.type === "DAY" ? "Nota del día" : "Nota",
      body: note.text,
      author: note.alias,
      meta: { noteType: note.type, photoId: note.photoId ?? undefined, placeId: note.placeId ?? undefined },
    });
  }

  for (const track of input.gpsTracks ?? []) {
    if (!track.includeInExport && input.selectedPhotosOnly) continue;
    const pts = track.points;
    if (pts.length === 0) continue;
    const at = pts[0].at;
    events.push({
      id: `gps-${track.id}`,
      kind: "gps-segment",
      at,
      dayKey: dayKeyFrom(at),
      title: `Recorrido GPS (${pts.length} puntos)`,
      author: track.alias,
      meta: { trackId: track.id },
    });
  }

  if (input.journalMarkdown?.trim()) {
    events.push(...parseJournalChunks(input.journalMarkdown));
  }

  events.sort(compareEvents);

  const withBoundaries: TimelineEvent[] = [];
  let lastDay: string | null = null;
  for (const ev of events) {
    if (ev.kind === "day-boundary") continue;
    if (ev.dayKey !== lastDay) {
      withBoundaries.push({
        id: `day-${ev.dayKey}`,
        kind: "day-boundary",
        at: new Date(`${ev.dayKey}T00:00:00`).toISOString(),
        dayKey: ev.dayKey,
        title: formatDateKey(ev.dayKey),
      });
      lastDay = ev.dayKey;
    }
    withBoundaries.push(ev);
  }

  const dayMap = new Map<string, number>();
  for (const ev of withBoundaries) {
    if (ev.kind === "day-boundary") continue;
    dayMap.set(ev.dayKey, (dayMap.get(ev.dayKey) ?? 0) + 1);
  }

  const days = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, eventCount]) => ({
      dayKey,
      label: formatDateKey(dayKey),
      eventCount,
    }));

  return {
    events: withBoundaries,
    days,
    meta: {
      eventCount: withBoundaries.filter((e) => e.kind !== "day-boundary").length,
      hasGps: withBoundaries.some((e) => e.lat != null && e.lng != null),
      dayCount: days.length,
    },
  };
}

export type TravelTypeId = TravelType;

export const TRAVEL_TYPE_LABELS: Record<TravelTypeId, string> = {
  GENERIC: "Genérico",
  CITY_BREAK: "Ciudad",
  ROAD_TRIP: "Carretera",
  INTERNATIONAL: "Internacional",
  BEACH_RESORT: "Playa / resort",
  TREKKING: "Trekking",
  SLOW_TRAVEL: "Estancia larga",
};
