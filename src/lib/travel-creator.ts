import { prisma } from "@/lib/prisma";

type TravelWithUsers = {
  id: string;
  creatorId: string | null;
  users: { id: string; createdAt: Date }[];
};

/** Resolve the travel creator, backfilling creatorId for older trips. */
export async function resolveTravelCreatorId(travel: TravelWithUsers): Promise<string | null> {
  if (travel.creatorId) return travel.creatorId;

  const first = [...travel.users].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )[0];
  if (!first) return null;

  await prisma.travel
    .update({
      where: { id: travel.id },
      data: { creatorId: first.id },
    })
    .catch(() => undefined);

  return first.id;
}
