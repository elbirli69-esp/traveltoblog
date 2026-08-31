import type { Prisma } from "@prisma/client";
import {
  buildTimeline,
  type BuildTimelineInput,
  type TimelineGpsTrackInput,
  type TimelineNoteInput,
  type TimelinePhotoInput,
  type TimelinePlaceInput,
  type TimelineResult,
} from "@/lib/timeline";

type TravelWithRelations = Prisma.TravelGetPayload<{
  include: {
    photos: { include: { user: true } };
    places: { include: { user: true; notes: true } };
    notes: { include: { user: true } };
    gpsTracks: { include: { user: true } };
  };
}>;

export function travelToTimelineInput(
  travel: TravelWithRelations,
  options?: { selectedPhotosOnly?: boolean }
): BuildTimelineInput {
  const photos: TimelinePhotoInput[] = travel.photos.map((p) => ({
    id: p.id,
    url: p.url,
    exifDateTime: p.exifDateTime,
    createdAt: p.createdAt,
    latitude: p.latitude,
    longitude: p.longitude,
    isTransportStart: p.isTransportStart,
    isTransportEnd: p.isTransportEnd,
    selected: p.selected,
    alias: p.user.alias,
  }));

  const places: TimelinePlaceInput[] = travel.places.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    latitude: p.latitude,
    longitude: p.longitude,
    visitedAt: p.visitedAt,
    createdAt: p.createdAt,
    alias: p.user.alias,
    comment: p.comment,
    noteText: p.notes?.[0]?.text ?? null,
  }));

  const notes: TimelineNoteInput[] = travel.notes.map((n) => ({
    id: n.id,
    type: n.type,
    text: n.text,
    dayDate: n.dayDate,
    photoId: n.photoId,
    placeId: n.placeId,
    createdAt: n.createdAt,
    alias: n.user.alias,
  }));

  const gpsTracks: TimelineGpsTrackInput[] = (travel.gpsTracks ?? []).map((t) => ({
    id: t.id,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    points: JSON.parse(t.points || "[]") as { lat: number; lng: number; at: string }[],
    includeInExport: t.includeInExport,
    alias: t.user.alias,
  }));

  return {
    photos,
    places,
    notes,
    journalMarkdown: travel.journalMarkdown,
    startDate: travel.startDate,
    endDate: travel.endDate,
    gpsTracks,
    selectedPhotosOnly: options?.selectedPhotosOnly,
  };
}

export function buildTravelTimeline(
  travel: TravelWithRelations,
  options?: { selectedPhotosOnly?: boolean }
): TimelineResult {
  return buildTimeline(travelToTimelineInput(travel, options));
}
