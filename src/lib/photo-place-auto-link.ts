import { prisma } from "@/lib/prisma";
import {
  matchPhotoToPlaceId,
  planPhotoPlaceLinks,
  type PhotoForPlaceLink,
  type PlaceForLink,
} from "@/lib/photo-place-link";

export interface AutoLinkResult {
  linked: number;
  links: { photoId: string; placeId: string }[];
}

export async function loadPlacesForLink(travelId: string): Promise<PlaceForLink[]> {
  return prisma.place.findMany({
    where: { travelId },
    select: { id: true, latitude: true, longitude: true },
  });
}

/** Infer place from GPS when the client did not send an explicit placeId. */
export function inferPlaceIdFromGps(
  latitude: number | null,
  longitude: number | null,
  places: PlaceForLink[],
  explicitPlaceId: string | null | undefined,
  flags?: { isTransportStart?: boolean; isTransportEnd?: boolean }
): string | null {
  if (explicitPlaceId) {
    return places.some((p) => p.id === explicitPlaceId) ? explicitPlaceId : null;
  }
  return matchPhotoToPlaceId(
    {
      id: "",
      latitude,
      longitude,
      placeId: null,
      isTransportStart: flags?.isTransportStart,
      isTransportEnd: flags?.isTransportEnd,
    },
    places
  );
}

/** Link unlinked photos to nearby places (≤120 m). Does not override manual links. */
export async function autoLinkPhotosForTravel(
  travelId: string,
  options?: { photoIds?: string[] }
): Promise<AutoLinkResult> {
  const places = await loadPlacesForLink(travelId);
  if (!places.length) return { linked: 0, links: [] };

  const photos = await prisma.photo.findMany({
    where: {
      travelId,
      placeId: null,
      isTransportStart: false,
      isTransportEnd: false,
      ...(options?.photoIds?.length ? { id: { in: options.photoIds } } : {}),
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      placeId: true,
      isTransportStart: true,
      isTransportEnd: true,
    },
  });

  const plan = planPhotoPlaceLinks(photos as PhotoForPlaceLink[], places);
  const links: { photoId: string; placeId: string }[] = [];

  for (const [photoId, placeId] of plan) {
    await prisma.photo.update({
      where: { id: photoId },
      data: { placeId },
    });
    links.push({ photoId, placeId });
  }

  if (links.length > 0) {
    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });
  }

  return { linked: links.length, links };
}
