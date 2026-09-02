import { NextResponse } from "next/server";
import { autoLinkPhotosForTravel } from "@/lib/photo-place-auto-link";
import { prisma } from "@/lib/prisma";
import { summarizeUnlinkedPhotos } from "@/lib/photo-place-link";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: travelId } = await params;

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { id: true },
    });
    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const result = await autoLinkPhotosForTravel(travelId);

    const [photos, places] = await Promise.all([
      prisma.photo.findMany({
        where: { travelId },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          placeId: true,
          isTransportStart: true,
          isTransportEnd: true,
        },
      }),
      prisma.place.findMany({
        where: { travelId },
        select: { id: true, latitude: true, longitude: true },
      }),
    ]);

    const remaining = summarizeUnlinkedPhotos(photos, places);

    return NextResponse.json({
      linked: result.linked,
      links: result.links,
      remaining,
    });
  } catch (error) {
    console.error("POST /api/travels/[id]/photos/auto-link-places", error);
    return NextResponse.json(
      { error: "No se pudieron vincular las fotos" },
      { status: 500 }
    );
  }
}
