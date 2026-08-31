import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTravelTimeline } from "@/lib/timeline-data";
import { suggestTravelType } from "@/lib/export/detect-travel-type";
import { travelToTimelineInput } from "@/lib/timeline-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const travel = await prisma.travel.findUnique({
    where: { id },
    include: {
      photos: {
        include: { user: true },
        orderBy: { exifDateTime: "asc" },
      },
      places: {
        include: {
          user: true,
          notes: { where: { type: "PLACE" }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { visitedAt: "asc" },
      },
      notes: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
      gpsTracks: {
        include: { user: true },
        orderBy: { startedAt: "asc" },
      },
    },
  });

  if (!travel) {
    return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
  }

  const timeline = buildTravelTimeline(travel, { selectedPhotosOnly: false });
  const suggestion = suggestTravelType(travelToTimelineInput(travel));

  return NextResponse.json({
    ...timeline,
    travelType: travel.travelType,
    suggestion,
  });
}
