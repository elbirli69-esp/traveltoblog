import { prisma } from "@/lib/prisma";

/**
 * Validate placeId for a travel.
 * - `undefined` → leave unchanged
 * - `null` / `""` → unlink
 * - id → must belong to travelId (otherwise null)
 */
export async function resolvePhotoPlaceId(
  travelId: string,
  placeId: string | null | undefined
): Promise<string | null | undefined> {
  if (placeId === undefined) return undefined;
  if (placeId === null || placeId === "") return null;
  const place = await prisma.place.findFirst({
    where: { id: placeId, travelId },
    select: { id: true },
  });
  return place?.id ?? null;
}
